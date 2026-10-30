// Runtime game singleton: wires the state machine (state.ts) to its effects and owns references to the
// physics port, controller, platforms, camera rig, level and run. The Canvas never unmounts (D-005), so one instance.
import { Ray, Vector3 } from 'three'
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
import { clearRunSave, loadRecords, loadRunSave, recordsAfterHeight, recordsAfterVictory, saveRecords, saveRunSave } from './persist.ts'
import type { Records, RunSave } from './persist.ts'
import { applyBindings } from './input-bindings.ts'
import { setLang, t } from '../ui/strings.ts'

export type GameLogEvent = { t: number; type: string; data?: unknown }

/** Minimal view of the loaded character model (mixer for pause, scene uuid for TEST-01). */
export type LoadedModel = { scene: Object3D; mixer: { timeScale: number; time: number } }

/** Canvas dpr cap (App.tsx Canvas dpr [1, 1.5]); render scale multiplies it. */
export const MAX_DPR = 1.5
const EVENT_RING = 500
/** A landing this much lower than the last grounded height counts as meters lost (D-008). */
const LOSS_MIN_M = 0.5
const TOAST_MS = 3000
/** Victory: controls and the summary buttons stay locked this long (D-023, TEST-40). */
export const VICTORY_LOCK_MS = 2000
/** lastSafe needs static geometry this close under the feet; Continue checks for a surface within 0.3 m (D-009). */
const SAFE_RAY_M = 0.1
const RESTORE_LIFT_M = 0.05
const RESTORE_RAY_M = 0.3
/** First fall of at least this much shows the one-time reassurance toast (D-021). */
const FIRST_FALL_M = 2

const ray = new Ray()
const tmp = new Vector3()

/** Victory summary shown on the VICTORY screen (D-023). */
export type VictorySummary = {
  timerMs: number
  newBest: boolean
  deltaMs: number | null
  bigFalls: number
  metersLost: number
  killPlaneRespawns: number
  restarts: number
}

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
  /** Records (D-008), persisted in va.records.v1 (TEST-16). */
  records: Records
  /** Last grounded position on static geometry (D-009); written to va.run.v1 by saveRunIfActive(). */
  readonly lastSafe = new Vector3()
  /** performance.now() until which victory locks input (D-023). */
  private inputLockedUntil = 0
  /** One-time hints of this page session (D-021): goal sentence, first-fall toast. */
  private goalShown = false
  private firstFallShown = false
  readonly events: GameLogEvent[] = []
  readonly bvh = { buildMs: {} as Record<string, number>, tris: {} as Record<string, number> }
  private worldReady = false
  private modelReady = false
  private lastGroundedY = 0
  private toastSeq = 0
  settings: Settings = loadSettings()

  constructor() {
    this.level = loadLevel(currentLevelId())
    this.records = loadRecords(this.level.targetM)
    this.setLevel(this.level)
    this.refreshSavedRun()
  }

  setLevel(level: LoadedLevel): void {
    this.level = level
    this.spawn.fromArray(level.data.spawn)
    this.spawnYaw = level.spawnYaw
    this.lastGroundedY = this.spawn.y
    this.lastSafe.copy(this.spawn)
    useUi.setState((s) => ({ hud: { ...s.hud, targetM: level.targetM } }))
  }

  /** Applies stored settings (read at startup, at every run start and on every Settings change; D-021, D-034). */
  applySettings(settings: Settings): void {
    this.settings = settings
    this.sprintMode = settings.sprintMode
    this.rawInput = settings.rawInput
    setLang(settings.lang)
    applyBindings(settings.bindings)
    this.applyCameraSettings()
    if (this.controller) this.controller.edgeGuard = settings.edgeGuard
    this.setDpr?.(Math.min(window.devicePixelRatio || 1, MAX_DPR) * settings.renderScale)
    useUi.setState((s) => ({ hud: { ...s.hud, showTimer: settings.showTimer }, uiScale: settings.uiScale, lang: settings.lang }))
  }

  private applyCameraSettings(): void {
    const rig = this.cameraRig
    if (rig == null) return
    rig.fov = this.settings.fov
    rig.sensitivity = this.settings.sensitivity
    rig.invertY = this.settings.invertY
    rig.sprintKick = this.settings.sprintKick
    rig.reducedMotion = this.reducedMotion
  }

  /** Options of the last requestPointerLock call (raw input, D-021; observed by TEST-39). */
  lastLockOptions: { unadjustedMovement: boolean } | null = null

  /** R3F's dpr setter, attached at Canvas creation (render scale, D-021). */
  setDpr: ((dpr: number) => void) | null = null

  /** Victory input lock (D-023); read by the controller loop and __game.inputLocked. */
  get inputLocked(): boolean {
    return performance.now() < this.inputLockedUntil
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
        this.records = { ...this.records, restartCount: this.records.restartCount + 1 }
        saveRecords(this.records)
        clearRunSave()
        this.startRun()
        this.afterEnterPlaying()
        break
      case 'newRun':
      case 'replayRun':
        clearRunSave()
        this.startRun()
        this.afterEnterPlaying()
        break
      case 'freeRoam':
        // free roam from where the climb ended: no timer, no records, no save, no finish (D-023, ref/02)
        this.run.newRun(this.spawn.y)
        this.inFinish = false
        this.afterEnterPlaying()
        break
      case 'continueRun':
        this.restoreSavedRun()
        this.afterEnterPlaying()
        break
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
      case 'saveAndQuit':
        this.saveRunIfActive(true)
        break
      case 'victory':
        this.onVictory()
        break
      case 'toMenu':
        this.refreshSavedRun()
        break
      default:
        break
    }
    return true
  }

  // ---- save / continue (D-009) ----------------------------------------------------------------------

  /** Writes va.run.v1 for a live climb (pagehide, hidden, Save & quit); nothing in free roam or before the first input. */
  saveRunIfActive(force = false): void {
    const s = this.snapshot
    if (s.mode !== 'run' || this.run.frozen) return
    if (!force && s.state !== 'PLAYING' && s.state !== 'PAUSED') return
    if (!this.run.started) return
    const save: RunSave = {
      v: 1,
      lastSafe: [this.lastSafe.x, this.lastSafe.y, this.lastSafe.z],
      yaw: this.cameraRig?.yaw ?? this.spawnYaw,
      timerMs: this.run.timerMs,
      killPlaneRespawns: this.run.killPlaneRespawns,
      bigFalls: this.run.bigFalls,
      metersLost: this.run.metersLost,
      highestM: this.run.highestM,
      focusUsed: this.run.focusUsed,
      savedAt: new Date().toISOString(),
    }
    saveRunSave(save)
    this.log('runSaved', { lastSafe: save.lastSafe, timerMs: Math.round(save.timerMs) })
    this.refreshSavedRun()
  }

  /** MENU shows Continue (<h> m · <mm:ss>) and New climb when a valid save exists (D-009). */
  refreshSavedRun(): void {
    const save = loadRunSave()
    useUi.setState({ savedRun: save == null ? null : { heightM: Math.max(0, Math.floor(save.lastSafe[1] - this.spawn.y)), timerMs: save.timerMs } })
  }

  /** Continue: lastSafe + 0.05 m, zero velocity, then a surface must be within 0.3 m below, else spawn + toast (D-009). */
  private restoreSavedRun(): void {
    const save = loadRunSave()
    this.motion.reset()
    this.inFinish = false
    if (save == null) {
      this.startRun()
      return
    }
    this.run.newRun(this.spawn.y)
    this.run.timerMs = save.timerMs
    this.run.started = true
    this.run.killPlaneRespawns = save.killPlaneRespawns
    this.run.bigFalls = save.bigFalls
    this.run.metersLost = save.metersLost
    this.run.highestM = save.highestM
    this.run.focusUsed = save.focusUsed
    tmp.set(save.lastSafe[0], save.lastSafe[1] + RESTORE_LIFT_M, save.lastSafe[2])
    const hit = this.rayDown(tmp, RESTORE_RAY_M)
    const target = hit == null ? this.spawn : tmp
    this.controller?.resetRun(target, save.yaw, false)
    this.port?.resetVelocity()
    if (this.visual) this.controller?.applyFacing(this.visual)
    this.cameraRig?.setView(save.yaw)
    this.lastSafe.copy(hit == null ? this.spawn : tmp.setY(save.lastSafe[1]))
    this.lastGroundedY = this.lastSafe.y
    if (hit == null) this.toast(t('continueFallback'))
    this.log('runRestored', { lastSafe: save.lastSafe, fallback: hit == null })
  }

  /** Distance to a surface straight below origin within maxDist (physics world), or null. */
  rayDown(origin: Vector3, maxDist: number): number | null {
    const world = this.physicsWorld
    if (world == null) return null
    ray.origin.copy(origin)
    ray.direction.set(0, -1, 0)
    return world.raycast(ray, maxDist)?.distance ?? null
  }

  // ---- victory (D-023) -----------------------------------------------------------------------------

  private onVictory(): void {
    this.run.freeze()
    // the landing on the finish ends the climb in the same slice, before the HUD sampler sees that height
    const summitHeight = Math.max(this.run.highestM, Math.floor((this.port?.position.y ?? this.spawn.y) - this.spawn.y))
    const withHeight = recordsAfterHeight(this.records, summitHeight, this.snapshot.mode)
    const { records, newBest, deltaMs } = recordsAfterVictory(withHeight, this.run.timerMs, this.snapshot.mode, this.run.focusUsed)
    this.records = records
    saveRecords(records)
    clearRunSave()
    this.refreshSavedRun()
    this.inputLockedUntil = performance.now() + VICTORY_LOCK_MS
    const victory: VictorySummary = {
      timerMs: this.run.timerMs,
      newBest,
      deltaMs,
      bigFalls: this.run.bigFalls,
      metersLost: this.run.metersLost,
      killPlaneRespawns: this.run.killPlaneRespawns,
      restarts: records.restartCount,
    }
    useUi.setState({ victory, victoryLockedUntil: this.inputLockedUntil })
    this.log('victory', { timerMs: Math.round(this.run.timerMs), newBest, deltaMs })
    if (document.pointerLockElement != null) document.exitPointerLock()
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
    this.controller.edgeGuard = this.settings.edgeGuard
    this.controller.groundRay = (origin, maxDist) => this.rayDown(origin, maxDist)
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
    this.applyCameraSettings()
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
    const port = this.port
    if (port == null) return
    if (s.state === 'PLAYING' && s.mode === 'run' && this.inFinish && port.isGroundedRaw) this.dispatch({ type: 'finish' })
    // lastSafe (D-009): grounded, the carry probe found no kinematic platform, and static geometry within 0.1 m below
    if (port.isGroundedRaw && this.controller?.groundBody == null) {
      tmp.copy(port.position).setY(port.position.y + 0.05)
      const d = this.rayDown(tmp, SAFE_RAY_M + 0.05)
      if (d != null) this.lastSafe.copy(port.position)
    }
  }

  /** New grounded maximum: bestHeightM in mode run (records written at once, ref/02 §Storage). */
  noteGroundedHeight(heightM: number): void {
    const next = recordsAfterHeight(this.records, heightM, this.snapshot.mode)
    if (next === this.records) return
    this.records = next
    saveRecords(next)
  }

  /** Landing: bigFall counters and meters lost (D-008, ref/02 §Run semantics). */
  private onLand(info: { simTime: number; fallMeters: number; bigFall: boolean; impactVy: number }): void {
    const y = this.port?.position.y ?? this.lastGroundedY
    const lost = this.lastGroundedY - y
    if (lost >= LOSS_MIN_M) this.run.metersLost += lost
    if (info.bigFall) {
      this.run.bigFalls++
      this.records = { ...this.records, lifetimeBigFalls: this.records.lifetimeBigFalls + 1 }
      saveRecords(this.records)
    }
    if (!this.firstFallShown && lost >= FIRST_FALL_M && this.snapshot.state === 'PLAYING') {
      this.firstFallShown = true
      this.toast(t('firstFall'))
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
    if (!this.goalShown && this.snapshot.mode === 'run') {
      // the goal sentence once, on the first Play of the page (D-021)
      this.goalShown = true
      this.toast(t('goal'))
    }
  }

  /** Kill plane (D-007): fade, spawn, same run (timer continues), toast. */
  private respawnSameRun(): void {
    this.port?.teleport(this.spawn)
    this.port?.resetVelocity()
    this.controller?.jumps.clear()
    this.controller?.resetAir()
    this.run.noteKillPlaneRespawn()
    this.lastGroundedY = this.spawn.y
    this.lastSafe.copy(this.spawn)
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
