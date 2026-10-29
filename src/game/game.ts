// Runtime game singleton: wires the state machine (state.ts) to its effects and owns references to the
// physics port, controller, platforms, camera rig and run. The Canvas never unmounts (D-005), so one instance.
import { Vector3 } from 'three'
import type { Object3D } from 'three'
import type { BvhPhysicsWorld } from '@pmndrs/viverse'
import { createCharacterPhysicsPort } from '../physics/character-physics.ts'
import type { CharacterPhysicsPort } from '../physics/character-physics.ts'
import { CharacterController } from '../controller/character-controller.ts'
import type { SprintMode } from '../controller/locomotion.ts'
import { PlatformMotion } from '../level/motion.ts'
import { FIRST_ROUTE_PAD, SPAWN } from '../level/blockout.ts'
import type { CameraRig } from '../camera/camera-rig.ts'
import { FrameClock } from './frame-clock.ts'
import { Run } from './run.ts'
import { INITIAL_SNAPSHOT, transition } from './state.ts'
import type { GameEvent, Snapshot } from './state.ts'
import { useUi } from './store.ts'
import { loadSettings } from './settings.ts'
import type { Settings } from './settings.ts'

export type GameLogEvent = { t: number; type: string; data?: unknown }

/** Minimal view of the loaded character model (mixer for pause, scene uuid for TEST-01). */
export type LoadedModel = { scene: Object3D; mixer: { timeScale: number; time: number } }

const KILL_PLANE_Y = -20
const EVENT_RING = 500

class Game {
  readonly frameClock = new FrameClock()
  readonly motion = new PlatformMotion(0)
  readonly run = new Run()
  readonly spawn = new Vector3().fromArray(SPAWN)
  /** Camera yaw that faces the first route pad from the spawn (D-007). */
  readonly spawnYaw = Math.atan2(-(FIRST_ROUTE_PAD[0] - SPAWN[0]), -(FIRST_ROUTE_PAD[2] - SPAWN[2]))
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
  readonly events: GameLogEvent[] = []
  readonly bvh = { buildMs: {} as Record<string, number>, tris: {} as Record<string, number> }
  private worldReady = false
  private modelReady = false
  settings: Settings = loadSettings()

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

  /** Applies a state-machine event and runs its effect. Never throws on unknown pairs ('ignored'). */
  dispatch(e: GameEvent): boolean {
    const result = transition(this.snapshot, e)
    if (result === 'ignored') return false
    useUi.setState({ snapshot: result.next })
    this.log('state', { event: e.type, to: result.next.state, effect: result.effect })
    switch (result.effect) {
      case 'newRun':
      case 'newClimb':
      case 'restartRun':
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
      onTakeoff: (t) => this.log('takeoff', { simTime: t }),
      onLand: (info) => this.log('land', info),
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

  get isWorldReady(): boolean {
    return this.worldReady
  }

  private tryLoaded(): void {
    if (this.worldReady && this.modelReady) this.dispatch({ type: 'loaded', worldReady: true })
  }

  // ---- effects ------------------------------------------------------------------------------------

  private startRun(): void {
    this.applySettings(loadSettings())
    this.run.newRun(this.spawn.y)
    this.motion.reset()
    this.controller?.resetRun(this.spawn, this.spawnYaw, false)
    if (this.visual) this.controller?.applyFacing(this.visual)
    this.cameraRig?.setView(this.spawnYaw)
  }

  /** Every transition into PLAYING (D-004, D-011). */
  private afterEnterPlaying(): void {
    this.frameClock.armDiscard()
    this.controller?.onEnterPlaying()
    this.setMixerPaused(false)
    this.canvas?.focus()
  }

  private respawnSameRun(): void {
    this.port?.teleport(this.spawn)
    this.port?.resetVelocity()
    this.controller?.jumps.clear()
    this.run.noteKillPlaneRespawn()
    this.log('killPlaneRespawn', { count: this.run.killPlaneRespawns })
  }

  private setMixerPaused(paused: boolean): void {
    if (this.model) this.model.mixer.timeScale = paused ? 0 : 1
  }

  /** Called by the controller frame (-2) after physics: kill plane (D-007; floorAABB arrives with level data in G2). */
  checkKillPlane(): void {
    if (this.port && this.port.position.y < KILL_PLANE_Y) this.dispatch({ type: 'killPlane' })
  }
}

export const game = new Game()
game.applySettings(game.settings)
export { INITIAL_SNAPSHOT }
