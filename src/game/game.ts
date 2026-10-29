// Runtime game singleton: wires the state machine (state.ts) to its effects and owns references to the
// physics port, controller, platforms, camera rig, level and run. The Canvas never unmounts (D-005), so one instance.
import { Vector3 } from 'three'
import type { Object3D } from 'three'
import type { BvhPhysicsWorld } from '@pmndrs/viverse'
import { createCharacterPhysicsPort } from '../physics/character-physics.ts'
import type { CharacterPhysicsPort } from '../physics/character-physics.ts'
import { CharacterController } from '../controller/character-controller.ts'
import type { SprintMode } from '../controller/locomotion.ts'
import { PlatformMotion } from '../level/motion.ts'
import { currentLevelId, loadLevel } from '../level/levels.ts'
import type { LoadedLevel } from '../level/levels.ts'
import type { CameraRig } from '../camera/camera-rig.ts'
import { FrameClock } from './frame-clock.ts'
import { Run } from './run.ts'
import { INITIAL_SNAPSHOT, transition } from './state.ts'
import type { GameEvent, Snapshot } from './state.ts'
import { useUi } from './store.ts'
import { loadSettings } from './settings.ts'
import type { Settings } from './settings.ts'
import { t } from '../ui/strings.ts'

export type GameLogEvent = { t: number; type: string; data?: unknown }

/** Minimal view of the loaded character model (mixer for pause, scene uuid for TEST-01). */
export type LoadedModel = { scene: Object3D; mixer: { timeScale: number; time: number } }

const EVENT_RING = 500
/** A landing this much lower than the last grounded height counts as meters lost (D-008). */
const LOSS_MIN_M = 0.5
const TOAST_MS = 3000

class Game {
  readonly frameClock = new FrameClock()
  readonly motion = new PlatformMotion(0)
  readonly run = new Run()
  level: LoadedLevel
  readonly spawn = new Vector3()
  /** Camera yaw that faces the first route pad from the spawn (D-007). */
  spawnYaw = 0
  port: CharacterPhysicsPort | null = null
  controller: CharacterController | null = null
  cameraRig: CameraRig | null = null
  playerRoot: Object3D | null = null
  visual: Object3D | null = null
  model: LoadedModel | null = null
  canvas: HTMLCanvasElement | null = null
  physicsWorld: BvhPhysicsWorld | null = null
  sprintMode: SprintMode = 'toggle'
  rawInput = true
  reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  frame = 0
  /** Finish sensor state (set only by the sensor callback, ref/04 §Collider, sensor, finish). */
  inFinish = false
  /** In-memory records (D-008); persisted to va.records.v1 in G3 (TEST-16). */
  readonly records = { restartCount: 0, completions: 0, lifetimeBigFalls: 0 }
  readonly events: GameLogEvent[] = []
  readonly bvh = { buildMs: {} as Record<string, number>, tris: {} as Record<string, number> }
  private worldReady = false
  private modelReady = false
  private lastGroundedY = 0
  private toastSeq = 0
  settings: Settings = loadSettings()

  constructor() {
    this.level = loadLevel(currentLevelId())
    this.setLevel(this.level)
  }

  setLevel(level: LoadedLevel): void {
    this.level = level
    this.spawn.fromArray(level.data.spawn)
    this.spawnYaw = level.spawnYaw
    this.lastGroundedY = this.spawn.y
    useUi.setState((s) => ({ hud: { ...s.hud, targetM: level.targetM } }))
  }

  /** Applies stored settings (read at startup and at every run start, D-034). */
  applySettings(settings: Settings): void {
    this.settings = settings
    this.sprintMode = settings.sprintMode
    this.rawInput = settings.rawInput
    if (this.cameraRig) this.cameraRig.fov = settings.fov
    useUi.setState((s) => ({ hud: { ...s.hud, showTimer: settings.showTimer } }))
  }

  get snapshot(): Snapshot {
    return useUi.getState().snapshot
  }

  log(type: string, data?: unknown): void {
    this.events.push({ t: performance.now(), type, data })
    if (this.events.length > EVENT_RING) this.events.splice(0, this.events.length - EVENT_RING)
  }

  /** Toast in the aria-live region (D-021). */
  toast(text: string): void {
    const id = ++this.toastSeq
    useUi.setState((s) => ({ toasts: [...s.toasts, { id, text }] }))
    this.log('toast', { text })
    setTimeout(() => useUi.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), TOAST_MS)
  }

  /** Applies a state-machine event and runs its effect. Never throws on unknown pairs ('ignored'). */
  dispatch(e: GameEvent): boolean {
    const result = transition(this.snapshot, e)
    if (result === 'ignored') return false
    useUi.setState({ snapshot: result.next, panel: 'main' })
    this.log('state', { event: e.type, to: result.next.state, effect: result.effect })
    switch (result.effect) {
      case 'restartRun':
      case 'newClimb':
        this.records.restartCount++
        this.startRun()
        this.afterEnterPlaying()
        break
      case 'newRun':
      case 'replayRun':
      case 'freeRoam':
        this.startRun()
        this.afterEnterPlaying()
        break
      case 'continueRun':
      case 'resumeRun':
        this.afterEnterPlaying()
        break
      case 'pause':
      case 'contextLost':
        this.setMixerPaused(true)
        if (document.pointerLockElement != null) document.exitPointerLock()
        break
      case 'respawn':
        this.respawnSameRun()
        break
      case 'victory':
        this.run.freeze()
        this.records.completions++
        this.log('victory', { timerMs: Math.round(this.run.timerMs) })
        if (document.pointerLockElement != null) document.exitPointerLock()
        break
      default:
        break
    }
    return true
  }

  // ---- wiring -------------------------------------------------------------------------------------

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
  }

  attachPlayer(world: BvhPhysicsWorld, root: Object3D, visual: Object3D): void {
    this.physicsWorld = world
    this.playerRoot = root
    this.visual = visual
    this.port = createCharacterPhysicsPort(world, root, {}, this.motion.nearKinematic)
    this.controller = new CharacterController(this.port, this.motion, {
      onCarryYaw: (dy) => this.cameraRig?.addYaw(dy),
      onTakeoff: (time, kind) => this.log('takeoff', { simTime: time, kind }),
      onBigFall: (time) => this.log('bigFall', { simTime: time }),
      onLand: (info) => this.onLand(info),
      afterSlice: () => this.afterSlice(),
    })
    this.port.teleport(this.spawn)
    this.controller.facingYaw = this.spawnYaw
    this.controller.applyFacing(visual)
    this.cameraRig?.setView(this.spawnYaw)
  }

  detachPlayer(): void {
    this.port = null
    this.controller = null
    this.playerRoot = null
    this.visual = null
  }

  attachCameraRig(rig: CameraRig): void {
    this.cameraRig = rig
    rig.fov = this.settings.fov
    rig.setView(this.controller?.facingYaw ?? this.spawnYaw)
  }

  setModel(model: LoadedModel | null): void {
    this.model = model
    this.modelReady = model != null
    this.tryLoaded()
  }

  setWorldReady(ready: boolean): void {
    this.worldReady = ready
    useUi.setState({ worldReady: ready })
    this.tryLoaded()
  }

  setInFinish(inside: boolean): void {
    this.inFinish = inside
    this.log('finishSensor', { inside })
  }

  get isWorldReady(): boolean {
    return this.worldReady
  }

  private tryLoaded(): void {
    if (this.worldReady && this.modelReady) this.dispatch({ type: 'loaded', worldReady: true })
  }

  // ---- per-slice hooks ----------------------------------------------------------------------------

  /** After every physics slice: victory = in the finish sensor and grounded in the same step, mode run (ref/02). */
  private afterSlice(): void {
    const s = this.snapshot
    if (s.state === 'PLAYING' && s.mode === 'run' && this.inFinish && this.port?.isGroundedRaw) this.dispatch({ type: 'finish' })
  }

  /** Landing: bigFall counters and meters lost (D-008, ref/02 §Run semantics). */
  private onLand(info: { simTime: number; fallMeters: number; bigFall: boolean; impactVy: number }): void {
    const y = this.port?.position.y ?? this.lastGroundedY
    const lost = this.lastGroundedY - y
    if (lost >= LOSS_MIN_M) this.run.metersLost += lost
    if (info.bigFall) {
      this.run.bigFalls++
      this.records.lifetimeBigFalls++
    }
    this.lastGroundedY = y
    this.log('land', { ...info, lostM: Math.max(0, Math.round(lost * 100) / 100) })
  }

  // ---- effects ------------------------------------------------------------------------------------

  private startRun(): void {
    this.applySettings(loadSettings())
    this.run.newRun(this.spawn.y)
    this.motion.reset()
    this.controller?.resetRun(this.spawn, this.spawnYaw, false)
    if (this.visual) this.controller?.applyFacing(this.visual)
    this.cameraRig?.setView(this.spawnYaw)
    this.lastGroundedY = this.spawn.y
    this.inFinish = false
  }

  /** Every transition into PLAYING (D-004, D-011). */
  private afterEnterPlaying(): void {
    this.frameClock.armDiscard()
    this.controller?.onEnterPlaying()
    this.setMixerPaused(false)
    this.canvas?.focus()
  }

  /** Kill plane (D-007): fade, spawn, same run (timer continues), toast. */
  private respawnSameRun(): void {
    this.port?.teleport(this.spawn)
    this.port?.resetVelocity()
    this.controller?.jumps.clear()
    this.controller?.resetAir()
    this.run.noteKillPlaneRespawn()
    this.lastGroundedY = this.spawn.y
    this.cameraRig?.setView(this.spawnYaw)
    useUi.setState({ fadeAt: performance.now() })
    this.toast(t('fellOut'))
    this.log('killPlaneRespawn', { count: this.run.killPlaneRespawns })
  }

  private setMixerPaused(paused: boolean): void {
    if (this.model) this.model.mixer.timeScale = paused ? 0 : 1
  }

  /** Called by the controller frame (-2) after physics: y below -20 or outside floorAABB + 10 m (D-007). */
  checkKillPlane(): void {
    if (this.port == null) return
    const p = this.port.position
    const b = this.level.bounds
    if (p.y < b.min[1] || p.x < b.min[0] || p.x > b.max[0] || p.z < b.min[2] || p.z > b.max[2]) this.dispatch({ type: 'killPlane' })
  }
}

export const game = new Game()
game.applySettings(game.settings)
export { INITIAL_SNAPSHOT }
