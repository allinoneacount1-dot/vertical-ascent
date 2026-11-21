import { GhostSystem } from './ghost.ts'
import { MultiplayerSystem, readRoomCodeFromUrl } from './multiplayer.ts'
import { applyHeroStyle, loadHeroId, saveHeroId } from '../character/heroes.ts'
import type { HeroId } from '../character/heroes.ts'
import { AETHER_GRAVITY, AETHER_LOW_G_ALTITUDE_M, ODYSSEY_SUMMIT_M, ODYSSEY_UPDRAFS } from '../level/odyssey.ts'
import { SKY_RELICS, loadCollectedRelics, saveCollectedRelics } from '../level/relicsData.ts'
// Runtime game singleton: wires the state machine (state.ts) to its effects and owns references to the
// physics port, controller, platforms, camera rig, level, challenges and run. The Canvas never unmounts (D-005).
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
import {
  CHALLENGE_SPECS,
  CROSSWIND_ACCEL,
  ChallengeRuntime,
  DEFAULT_MODIFIERS,
  RELAXED_CHECKPOINTS,
  SLIPPERY_SLOPE_MIN_RAD,
  challengeDownhillDir,
  challengeSurfaceNormal,
  isFeetOnChallenge,
} from '../level/challenges.ts'
import type { ChallengeMode, ChallengeModifiers } from '../level/challenges.ts'
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
import {
  playBounceTwang,
  playCrumbleCrack,
  playGearTick,
  playGondolaBell,
  playJump,
  playLand,
  playLanternChime,
  playMantle,
  playSteamHiss,
  playWindChime,
  playWoodCreak,
  setFocusAudio,
  syncAudioSettings,
} from '../audio/engine.ts'

export type GameLogEvent = { t: number; type: string; data?: unknown }

export type LoadedModel = { scene: Object3D; mixer: { timeScale: number; time: number } }

export const MAX_DPR = 1.5
const EVENT_RING = 500
const LOSS_MIN_M = 0.5
const TOAST_MS = 3000
export const VICTORY_LOCK_MS = 2000
const SAFE_RAY_M = 0.1
const RESTORE_LIFT_M = 0.05
const RESTORE_RAY_M = 0.3
const FIRST_FALL_M = 2
export const SUMMIT_REVEAL_MS = 3000

const ray = new Ray()
const tmp = new Vector3()
const tmpNormal = new Vector3()
const tmpDir = new Vector3()
const tmpPush = new Vector3()

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
  readonly challenges = new ChallengeRuntime()
  level: LoadedLevel
  readonly spawn = new Vector3()
  spawnYaw = 0
  port: CharacterPhysicsPort | null = null
  controller: CharacterController | null = null
  cameraRig: CameraRig | null = null
  playerRoot: Object3D | null = null
  visual: Object3D | null = null
  model: LoadedModel | null = null
  canvas: HTMLCanvasElement | null = null
  physicsWorld: BvhPhysicsWorld | null = null
  visualRoot: Object3D | null = null
  sprintMode: SprintMode = 'toggle'
  rawInput = true
  reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  frame = 0
  /** Scaled simulation delta for the current frame (0.45x during Wind Focus). */
  simDt = 0
  inFinish = false
  odysseyMode = false
  inOdysseyFinish = false
  aetherLowG = false
  inFakeSummit = false
  fakeSummitAtMs: number | null = null
  records: Records
  readonly lastSafe = new Vector3()
  private inputLockedUntil = 0
  private goalShown = false
  private firstFallShown = false
  readonly events: GameLogEvent[] = []
  readonly bvh = { buildMs: {} as Record<string, number>, tris: {} as Record<string, number> }
  private worldReady = false
  private modelReady = false
  private lastGroundedY = 0
  private toastSeq = 0
  settings: Settings = loadSettings()

  /** Tahap 3: Game Mode (hardcore = 0 checkpoints, speedrun eligible; relaxed = auto checkpoints at 125/250/375 m). */
  challengeMode: ChallengeMode = 'hardcore'
  /** Tahap 3: Optional Challenge Modifiers. */
  modifiers: ChallengeModifiers = { ...DEFAULT_MODIFIERS }
  /** Highest unlocked relaxed checkpoint index (-1 = none, 0 = 125m, 1 = 250m, 2 = 375m). */
  checkpointIndex = -1
  readonly culling = {
    registry: new Map<string, boolean>(),
    summary(): { total: number; visible: number; culled: number } {
      let visible = 0
      for (const v of this.registry.values()) if (v) visible++
      const total = this.registry.size
      return { total, visible, culled: total - visible }
    },
  }
  readonly livingWorld = {
    litShrines: 0,
  }
  readonly atmosphere = {
    fogHex: '#ecd8c2',
    skyTopHex: '#6eb1eb',
    starOpacity: 0,
    zone: 'z1' as 'z1' | 'z2' | 'z3' | 'z4',
  }
  private lastSculpturalBody: string | null = null
  private visitedSanctuaries = new Set<number>()
  readonly ghost = new GhostSystem()
  readonly collectedRelics: Set<string> = loadCollectedRelics()
  heroId: HeroId = loadHeroId()
  readonly multiplayer = new MultiplayerSystem({
    onUiChange: (mp) => useUi.setState({ multiplayer: mp }),
    onEpochSync: (epochMs) => {
      const targetClock = ((Date.now() - epochMs) / 1000) % 3600
      if (Math.abs(this.motion.worldClock - targetClock) > 0.35) {
        this.motion.worldClock = targetClock
        this.motion.syncPrev()
      }
    },
    onToast: (text) => this.toast(text),
    onEmote: () => playLanternChime(),
  })

  constructor() {
    this.level = loadLevel(currentLevelId())
    this.records = loadRecords(this.level.summitM)
    this.setLevel(this.level)
    this.refreshSavedRun()
    useUi.setState({ relicCount: this.collectedRelics.size, heroId: this.heroId, multiplayer: this.multiplayer.getUiState() })
    const urlRoom = readRoomCodeFromUrl()
    if (urlRoom) void this.multiplayer.joinRoom(urlRoom)
  }

  setLevel(level: LoadedLevel): void {
    this.level = level
    this.spawn.fromArray(level.data.spawn)
    this.spawnYaw = level.spawnYaw
    this.lastGroundedY = this.spawn.y
    this.lastSafe.copy(this.spawn)
    this.resetSummit()
  }

  setChallengeMode(mode: ChallengeMode): void {
    this.challengeMode = mode
    useUi.setState({ challengeMode: mode })
  }

  setHero(id: HeroId): void {
    this.heroId = id
    saveHeroId(id)
    useUi.setState({ heroId: id })
    applyHeroStyle(this.model?.scene, id)
    this.log('heroChanged', { heroId: id })
  }

  setOdysseyMode(on: boolean): void {
    this.odysseyMode = on
    this.inOdysseyFinish = false
    const targetM = on ? ODYSSEY_SUMMIT_M : this.level.summitM
    useUi.setState((s) => ({ odysseyMode: on, hud: { ...s.hud, targetM } }))
  }

  setInOdysseyFinish(inside: boolean): void {
    this.inOdysseyFinish = inside
    this.log('odysseyFinishSensor', { inside })
  }

  setModifiers(change: Partial<ChallengeModifiers>): void {
    this.modifiers = { ...this.modifiers, ...change }
    this.applyModifierEffects()
    useUi.setState({ modifiers: { ...this.modifiers } })
  }

  private applyModifierEffects(): void {
    this.port?.setGravity(this.modifiers.moonGravity ? -10.5 : -20)
    if (this.cameraRig) this.cameraRig.firstPerson = this.modifiers.firstPerson
    if (this.visual) this.visual.visible = !this.modifiers.firstPerson
    if (this.modifiers.noWindFocus) {
      this.challenges.focusHeld = false
      this.challenges.focusActive = false
      setFocusAudio(false)
    }
  }

  private resetSummit(): void {
    this.inFakeSummit = false
    this.fakeSummitAtMs = null
    const revealed = this.level.fakeSummitM == null || this.records.reachedFakeSummit
    const targetM = this.odysseyMode ? ODYSSEY_SUMMIT_M : revealed ? this.level.summitM : this.level.fakeSummitM!
    useUi.setState((s) => ({ summitRevealed: revealed, hud: { ...s.hud, targetM } }))
  }

  applySettings(settings: Settings): void {
    this.settings = settings
    this.sprintMode = settings.sprintMode
    this.rawInput = settings.rawInput
    setLang(settings.lang)
    applyBindings(settings.bindings)
    this.applyCameraSettings()
    if (this.controller) this.controller.edgeGuard = settings.edgeGuard
    this.setDpr?.(Math.min(window.devicePixelRatio || 1, MAX_DPR) * settings.renderScale)
    syncAudioSettings(settings.volume.master, settings.volume.sfx, settings.volume.ambience)
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
    rig.firstPerson = this.modifiers.firstPerson
  }

  lastLockOptions: { unadjustedMovement: boolean } | null = null
  setDpr: ((dpr: number) => void) | null = null

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

  toast(text: string): void {
    const id = ++this.toastSeq
    useUi.setState((s) => ({ toasts: [...s.toasts, { id, text }] }))
    this.log('toast', { text })
    setTimeout(() => useUi.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), TOAST_MS)
  }

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
        this.run.newRun(this.spawn.y)
        this.inFinish = false
    this.inOdysseyFinish = false
        this.resetSummit()
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
        this.challenges.focusHeld = false
        this.challenges.focusActive = false
        setFocusAudio(false)
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
    useUi.setState({ relicCount: this.collectedRelics.size, heroId: this.heroId })
        break
      default:
        break
    }
    return true
  }

  /** Instant speedrun restart while PLAYING (keeps pointer lock active). */
  quickRestart(): void {
    if (this.snapshot.state !== 'PLAYING') return
    this.records = { ...this.records, restartCount: this.records.restartCount + 1 }
    saveRecords(this.records)
    clearRunSave()
    this.startRun()
    this.frameClock.armDiscard()
    this.controller?.onEnterPlaying()
    this.toast(t('quickRestartToast'))
    this.log('quickRestart', { count: this.records.restartCount })
  }

  /** Optional Vista Look (V key): safely glances toward the summit/next landmark when grounded & nearly stationary. */
  triggerVistaLook(): boolean {
    if (this.snapshot.state !== 'PLAYING' || this.port == null || this.cameraRig == null || this.controller == null) return false
    if (!this.port.isGroundedRaw || this.controller.moveSpeed > 0.8) return false
    const feet = this.port.position
    const finish = this.level.data.platforms.find((p) => p.id === this.level.data.finish)
    const tx = finish ? finish.pos[0] : 78
    const ty = finish ? finish.pos[1] : this.level.summitM
    const tz = finish ? finish.pos[2] : -6.7
    const dx = tx - feet.x
    const dy = ty - (feet.y + 1.5)
    const dz = tz - feet.z
    const horiz = Math.max(1, Math.hypot(dx, dz))
    const targetYaw = Math.atan2(-dx, -dz)
    const targetPitch = Math.atan2(dy, horiz)
    this.cameraRig.startVistaLook(targetYaw, targetPitch, this.reducedMotion)
    this.log('vistaLook', { target: [tx, ty, tz] })
    return true
  }

  collectRelic(id: string, name: string): boolean {
    if (this.collectedRelics.has(id)) return false
    this.collectedRelics.add(id)
    saveCollectedRelics(this.collectedRelics)
    useUi.setState({ relicCount: this.collectedRelics.size, heroId: this.heroId })
    playWindChime()
    this.toast(`Sky Relic ${this.collectedRelics.size}/${SKY_RELICS.length} — ${name}`)
    this.log('relicCollected', { id, count: this.collectedRelics.size })
    return true
  }

  /** Return to highest unlocked checkpoint in Relaxed (Santai) mode. */
  returnToCheckpoint(): void {
    if (this.snapshot.state !== 'PLAYING' || this.challengeMode !== 'relaxed' || this.checkpointIndex < 0) return
    const cp = RELAXED_CHECKPOINTS[this.checkpointIndex]
    tmp.fromArray(cp.pos)
    this.port?.teleport(tmp)
    this.port?.resetVelocity()
    this.controller?.jumps.clear()
    this.controller?.resetAir()
    this.lastGroundedY = tmp.y
    useUi.setState({ fadeAt: performance.now() })
    this.toast(t('checkpointRespawn').replace('{n}', cp.label))
    this.log('checkpointRespawn', { label: cp.label })
  }

  // ---- save / continue (D-009) ----------------------------------------------------------------------

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
    useUi.setState({ relicCount: this.collectedRelics.size, heroId: this.heroId })
  }

  refreshSavedRun(): void {
    const save = loadRunSave()
    useUi.setState({ savedRun: save == null ? null : { heightM: Math.max(0, Math.floor(save.lastSafe[1] - this.spawn.y)), timerMs: save.timerMs } })
  }

  private restoreSavedRun(): void {
    const save = loadRunSave()
    this.motion.reset()
    this.challenges.reset()
    this.inFinish = false
    this.inOdysseyFinish = false
    this.resetSummit()
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
    this.applyModifierEffects()
    if (hit == null) this.toast(t('continueFallback'))
    this.log('runRestored', { lastSafe: save.lastSafe, fallback: hit == null })
  }

  rayDown(origin: Vector3, maxDist: number): number | null {
    const world = this.physicsWorld
    if (world == null) return null
    ray.origin.copy(origin)
    ray.direction.set(0, -1, 0)
    return world.raycast(ray, maxDist)?.distance ?? null
  }

  rayDir(origin: Vector3, dir: Vector3, maxDist: number): number | null {
    const world = this.physicsWorld
    if (world == null) return null
    ray.origin.copy(origin)
    ray.direction.copy(dir).normalize()
    return world.raycast(ray, maxDist)?.distance ?? null
  }

  // ---- victory (D-023) -----------------------------------------------------------------------------

  private onVictory(): void {
    this.run.recordFinishSplit()
    this.run.freeze()
    this.challenges.focusHeld = false
    this.challenges.focusActive = false
    setFocusAudio(false)
    const summitHeight = Math.max(this.run.highestM, Math.floor((this.port?.position.y ?? this.spawn.y) - this.spawn.y))
    const withHeight = recordsAfterHeight(this.records, summitHeight, this.snapshot.mode)
    const ineligible = this.run.focusUsed || this.challengeMode !== 'hardcore'
    const { records, newBest, deltaMs } = recordsAfterVictory(withHeight, this.run.timerMs, this.snapshot.mode, ineligible)
    this.records = records
    saveRecords(records)
    clearRunSave()
    this.refreshSavedRun()
    useUi.setState({ relicCount: this.collectedRelics.size, heroId: this.heroId })
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
    this.log('victory', { timerMs: Math.round(this.run.timerMs), newBest, deltaMs, mode: this.challengeMode })
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
      onTakeoff: (time, kind) => {
        playJump(kind === 'air')
        this.log('takeoff', { simTime: time, kind })
      },
      onBigFall: (time) => {
        if (this.cameraRig) this.cameraRig.bigFallExtra = 1
        this.log('bigFall', { simTime: time })
      },
      onLand: (info) => this.onLand(info),
      onMantle: (time) => {
        playMantle()
        this.challenges.mantleCount++
        this.log('mantle', { simTime: time })
      },
      afterSlice: () => this.afterSlice(),
    })
    this.controller.edgeGuard = this.settings.edgeGuard
    this.controller.groundRay = (origin, maxDist) => this.rayDown(origin, maxDist)
    this.controller.forwardRay = (origin, dir, maxDist) => this.rayDir(origin, dir, maxDist)
    this.port.teleport(this.spawn)
    this.controller.facingYaw = this.spawnYaw
    this.controller.applyFacing(visual)
    this.applyModifierEffects()
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
    if (model) applyHeroStyle(model.scene, this.heroId)
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

  setInFakeSummit(inside: boolean): void {
    this.inFakeSummit = inside
    this.log('fakeSummitSensor', { inside })
  }

  get isWorldReady(): boolean {
    return this.worldReady
  }

  private tryLoaded(): void {
    if (this.worldReady && this.modelReady) this.dispatch({ type: 'loaded', worldReady: true })
  }

  // ---- per-frame challenge physics (Tahap 1â€“3) -----------------------------------------------------

  stepChallenges(simDt: number): void {
    if (this.level.id !== 'main' || this.port == null || this.controller == null) return
    const feet = this.port.position
    const grounded = this.port.isGroundedRaw

    // 1. Advance timers (crumble, bounce squash, steam pipes, gondola bells, crosswind)
    const ev = this.challenges.step(simDt, feet.y, this.modifiers.constantStorm, this.motion.worldClock)
    for (const id of ev.crumbleCracks) {
      playCrumbleCrack()
      this.log('crumbleStart', { id })
    }
    for (const h of ev.steamHisses) {
      // Audible when player is within 32 m of the steam pipe
      const spec = CHALLENGE_SPECS.find((s) => s.id === h.id)
      if (spec && feet.distanceTo(tmp.fromArray(spec.pos)) < 32) playSteamHiss(h.strong)
    }
    for (const id of ev.gondolaBells) {
      const spec = CHALLENGE_SPECS.find((s) => s.id === id)
      if (spec && feet.distanceTo(tmp.fromArray(spec.pos)) < 40) playGondolaBell()
    }

    // 2. Check standing interactions with static challenge pads (bounce, crumbling, slippery, steam jets)
    let onSlippery = false
    for (const spec of CHALLENGE_SPECS) {
      if (spec.kind === 'bounce' && grounded && isFeetOnChallenge(spec, feet, 0.35)) {
        challengeSurfaceNormal(spec, tmpNormal)
        if (this.controller.triggerBounce(tmpNormal, spec.bounceSpeed ?? 25)) {
          this.challenges.triggerBounce(spec.id)
          playBounceTwang()
          this.log('bounce', { id: spec.id, speed: spec.bounceSpeed ?? 25 })
        }
      } else if (spec.kind === 'crumbling' && grounded && isFeetOnChallenge(spec, feet, 0.35)) {
        this.challenges.triggerCrumble(spec.id)
      } else if (spec.kind === 'slippery' && grounded && isFeetOnChallenge(spec, feet, 0.4)) {
        onSlippery = true
        this.challenges.slipperyTicks++
        if (Math.abs(spec.rotX ?? 0) > SLIPPERY_SLOPE_MIN_RAD) {
          challengeDownhillDir(spec, this.controller.slipperySlide)
        } else {
          this.controller.slipperySlide.set(0, 0, 0)
        }
      } else if (spec.kind === 'steamPipe') {
        const st = this.challenges.steamStates.get(spec.id)
        if (st && st.phase === 'blast') {
          const dir = spec.steamDir ?? [1, 0.35, 0]
          const jx = spec.pos[0] + dir[0] * 1.1
          const jy = spec.pos[1] + 0.65
          const jz = spec.pos[2] + dir[2] * 1.1
          const distSq = (feet.x - jx) ** 2 + (feet.y - jy) ** 2 + (feet.z - jz) ** 2
          if (distSq < 4.8) {
            tmpPush.set(dir[0] * 14 * simDt, dir[1] * 8 * simDt, dir[2] * 14 * simDt)
            this.port.impulse(tmpPush, 9)
            this.challenges.steamPushes++
          }
        }
      }
    }
    this.controller.onSlippery = onSlippery
    if (!onSlippery) this.controller.slipperySlide.set(0, 0, 0)

    // 2b. Subtle sculptural surface audio cues on first step onto bridge planks, pendulum lanterns, or vertical gear treads
    const gb = this.controller.groundBody
    if (gb !== this.lastSculpturalBody) {
      if (gb != null) {
        if (gb.includes('rope-bridge-plank')) playWoodCreak()
        else if (gb.includes('pendulum-lantern')) playLanternChime()
        else if (gb.includes('vertical-gear')) playGearTick()
      }
      this.lastSculpturalBody = gb
    }
    if (this.cameraRig?.vistaActive && this.controller.moveSpeed > 0.8) {
      this.cameraRig.cancelVistaLook()
    }
    if (this.cameraRig?.introActive && this.controller.moveSpeed > 0.35) {
      this.cameraRig.cancelIntroPan()
    }
    // 6. Mode Odyssey 1000 m physics: Z5/Z7 Updraft Thermal columns + Z7/Z8 Aether Low-Gravity (0.65x)
    if (this.odysseyMode) {
      const pp = this.port.position
      for (const u of ODYSSEY_UPDRAFS) {
        const dx = pp.x - u.pos[0]
        const dz = pp.z - u.pos[2]
        if (dx * dx + dz * dz <= u.radius * u.radius && pp.y >= u.pos[1] - 0.6 && pp.y <= u.pos[1] + u.height) {
          const curVy = this.port.velocity.y
          if (curVy < u.liftVy) {
            const deltaVy = Math.min(u.liftVy - curVy, 42 * simDt)
            this.port.impulse(tmp.set(0, deltaVy, 0), Number.POSITIVE_INFINITY)
          }
          break
        }
      }
      // Deterministic 1000 m Celestial Throne arrival zone ([55, 1000, 0], 12x12 deck)
      const onThrone = Math.abs(pp.x - 55) <= 5.8 && Math.abs(pp.z) <= 5.8 && pp.y >= 999.5 && pp.y <= 1006
      if (onThrone !== this.inOdysseyFinish) this.setInOdysseyFinish(onThrone)
      const wantLowG = pp.y - this.spawn.y >= AETHER_LOW_G_ALTITUDE_M
      if (wantLowG !== this.aetherLowG) {
        this.aetherLowG = wantLowG
        this.port.setGravity(this.modifiers.moonGravity ? -10.5 : wantLowG ? AETHER_GRAVITY : -20)
        useUi.setState({ aetherLowG: wantLowG })
        if (wantLowG) this.toast('Aether Spire — Low Gravity 0.65x')
      }
    } else if (this.aetherLowG) {
      this.aetherLowG = false
      this.port.setGravity(this.modifiers.moonGravity ? -10.5 : -20)
      useUi.setState({ aetherLowG: false })
    }

    if (this.snapshot.state === 'PLAYING' && this.snapshot.mode === 'run') {
      const p = this.port.position
      this.ghost.record(this.run.timerMs, p.x, p.y, p.z, this.controller.facingYaw, this.run.heightM)
    }

    // 3. Crosswind Gust push (z4 or Badai Konstan) with upwind shelter raycast
    if (this.challenges.windPhase === 'gust') {
      const gx = Math.cos(this.challenges.windAngle)
      const gz = Math.sin(this.challenges.windAngle)
      tmp.set(feet.x, feet.y + 0.9, feet.z)
      tmpDir.set(-gx, 0, -gz) // raycast UPWIND to detect shelter
      const shelterHit = this.rayDir(tmp, tmpDir, 12)
      this.challenges.windSheltered = shelterHit != null
      if (!this.challenges.windSheltered) {
        const strength = CROSSWIND_ACCEL * this.challenges.windIntensity * simDt
        tmpPush.set(gx * strength, 0, gz * strength)
        this.port.impulse(tmpPush, 10)
      }
    } else {
      this.challenges.windSheltered = false
    }

    // 4. Relaxed (Santai) Mode automatic checkpoints at zone gates (125 m, 250 m, 375 m)
    if (this.challengeMode === 'relaxed' && grounded) {
      const h = Math.max(0, Math.floor(feet.y - this.spawn.y))
      for (let i = RELAXED_CHECKPOINTS.length - 1; i >= 0; i--) {
        if (h >= RELAXED_CHECKPOINTS[i].heightM && i > this.checkpointIndex) {
          this.checkpointIndex = i
          this.toast(t('checkpointUnlocked').replace('{n}', RELAXED_CHECKPOINTS[i].label))
          this.log('checkpointUnlocked', { index: i, label: RELAXED_CHECKPOINTS[i].label })
          playWindChime()
          break
        }
      }
    }
  }

  // ---- per-slice hooks ----------------------------------------------------------------------------

  private afterSlice(): void {
    const s = this.snapshot
    const port = this.port
    if (port == null) return
    const atGoal = this.odysseyMode ? this.inOdysseyFinish : this.inFinish
    if (s.state === 'PLAYING' && s.mode === 'run' && atGoal && port.isGroundedRaw) this.dispatch({ type: 'finish' })
    if (s.state === 'PLAYING' && s.mode === 'run') this.checkFakeSummit(port.isGroundedRaw)
    if (port.isGroundedRaw && this.controller?.groundBody == null) {
      tmp.copy(port.position).setY(port.position.y + 0.05)
      const d = this.rayDown(tmp, SAFE_RAY_M + 0.05)
      if (d != null) this.lastSafe.copy(port.position)
    }
  }

  private checkFakeSummit(grounded: boolean): void {
    if (this.fakeSummitAtMs == null) {
      if (!this.inFakeSummit || !grounded) return
      this.fakeSummitAtMs = this.run.timerMs
      this.log('split', { name: 'fakeSummit', timerMs: Math.round(this.run.timerMs) })
      return
    }
    if (useUi.getState().summitRevealed || this.run.timerMs < this.fakeSummitAtMs + SUMMIT_REVEAL_MS) return
    this.records = { ...this.records, reachedFakeSummit: true }
    saveRecords(this.records)
    useUi.setState((s) => ({ summitRevealed: true, hud: { ...s.hud, targetM: this.level.summitM } }))
    this.toast(t('summitReveal'))
    this.log('summitReveal', { timerMs: Math.round(this.run.timerMs) })
  }

  noteGroundedHeight(heightM: number): void {
    const next = recordsAfterHeight(this.records, heightM, this.snapshot.mode)
    if (next === this.records) return
    this.records = next
    saveRecords(next)
  }

  private onLand(info: { simTime: number; fallMeters: number; bigFall: boolean; impactVy: number }): void {
    if (this.cameraRig) this.cameraRig.bigFallExtra = 0
    playLand(info.impactVy)
    const y = this.port?.position.y ?? this.lastGroundedY
    const lost = this.lastGroundedY - y
    if (lost >= LOSS_MIN_M) this.run.metersLost += lost
    if (info.bigFall) {
      this.run.bigFalls++
      this.records = { ...this.records, lifetimeBigFalls: this.records.lifetimeBigFalls + 1 }
      saveRecords(this.records)
      if (lost >= LOSS_MIN_M && this.snapshot.state === 'PLAYING') {
        const rounded = Math.round(lost)
        this.toast(t('lostMeters').replace('{n}', String(rounded)))
        useUi.setState((s) => ({ hud: { ...s.hud, lostM: rounded } }))
      }
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
    this.challenges.reset()
    this.checkpointIndex = -1
    this.lastSculpturalBody = null
    this.visitedSanctuaries.clear()
    this.ghost.commitIfBetter(this.level.summitM, false, this.run.timerMs)
    this.ghost.resetRun()
    this.cameraRig?.setVictoryOrbit(false)
    if (this.level.id === 'main') this.cameraRig?.startIntroPan(this.spawnYaw, this.reducedMotion)
    this.controller?.resetRun(this.spawn, this.spawnYaw, false)
    if (this.visual) this.controller?.applyFacing(this.visual)
    this.applyModifierEffects()
    this.cameraRig?.setView(this.spawnYaw)
    this.lastGroundedY = this.spawn.y
    this.inFinish = false
    this.inOdysseyFinish = false
    this.resetSummit()
  }

  private afterEnterPlaying(): void {
    this.frameClock.armDiscard()
    this.controller?.onEnterPlaying()
    this.applyModifierEffects()
    this.setMixerPaused(false)
    this.canvas?.focus()
    if (!this.goalShown && this.snapshot.mode === 'run') {
      this.goalShown = true
      this.toast(t('goal'))
    }
  }

  private respawnSameRun(): void {
    const target =
      this.challengeMode === 'relaxed' && this.checkpointIndex >= 0
        ? tmp.fromArray(RELAXED_CHECKPOINTS[this.checkpointIndex].pos)
        : this.spawn
    this.port?.teleport(target)
    this.port?.resetVelocity()
    this.controller?.jumps.clear()
    this.controller?.resetAir()
    this.run.noteKillPlaneRespawn()
    this.lastGroundedY = target.y
    this.lastSafe.copy(target)
    this.cameraRig?.setView(this.spawnYaw)
    useUi.setState({ fadeAt: performance.now() })
    this.toast(
      this.challengeMode === 'relaxed' && this.checkpointIndex >= 0
        ? t('checkpointRespawn').replace('{n}', RELAXED_CHECKPOINTS[this.checkpointIndex].label)
        : t('fellOut'),
    )
    this.log('killPlaneRespawn', { count: this.run.killPlaneRespawns, checkpoint: this.checkpointIndex })
  }

  private setMixerPaused(paused: boolean): void {
    if (this.model) this.model.mixer.timeScale = paused ? 0 : 1
  }

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
