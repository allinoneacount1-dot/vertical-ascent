// window.__game (ref/02 §window.__game): read-only observation surface for tests and debugging, present in
// production. Setup helpers __debugTeleport / __debugSetVelocity / __debugSetFocus / __debugSetMode exist only under DEV.
import { Vector3 } from 'three'
import type { WebGLRenderer } from 'three'
import { game } from './game.ts'
import { useUi } from './store.ts'
import { audioState } from '../audio/context.ts'
import { audioSnapshot } from '../audio/engine.ts'
import type { ChallengeMode, ChallengeModifiers } from '../level/challenges.ts'

type Vec3 = [number, number, number]

const r3 = (v: number) => Math.round(v * 1000) / 1000
const arr = (v: Vector3): Vec3 => [r3(v.x), r3(v.y), r3(v.z)]

let renderer: WebGLRenderer | null = null

export function attachRenderer(gl: WebGLRenderer): void {
  renderer = gl
}

function snapshotGame() {
  const ui = useUi.getState()
  const port = game.port
  const controller = game.controller
  const rig = game.cameraRig
  const platforms: Record<string, { phase: number }> = {}
  for (const [id, p] of game.motion.platforms) platforms[id] = { phase: r3(p.phase) }
  const crumbles: Record<string, { phase: string; timer: number }> = {}
  for (const [id, c] of game.challenges.crumbles) crumbles[id] = { phase: c.phase, timer: r3(c.timer) }
  const info = renderer?.info
  return {
    level: game.level.id,
    inFinish: game.inFinish,
    records: { ...game.records },
    ready: ui.snapshot.state !== 'LOADING',
    worldReady: ui.worldReady,
    state: ui.snapshot.state,
    mode: ui.snapshot.mode,
    challengeMode: game.challengeMode,
    modifiers: { ...game.modifiers },
    checkpointIndex: game.checkpointIndex,
    player: {
      pos: port ? arr(port.position) : ([0, 0, 0] as Vec3),
      vel: port ? arr(port.velocity) : ([0, 0, 0] as Vec3),
      groundedRaw: port?.isGroundedRaw ?? false,
      canJump: port?.canJump ?? false,
      airborne: controller?.airborne ?? false,
      bigFall: controller?.bigFall ?? false,
      groundBody: controller?.groundBody ?? null,
      sprintActive: controller?.sprintActive ?? false,
      facingYaw: r3(controller?.facingYaw ?? 0),
      onSlippery: controller?.onSlippery ?? false,
    },
    run: {
      timerMs: Math.round(game.run.timerMs),
      heightM: game.run.heightM,
      highestM: game.run.highestM,
      killPlaneRespawns: game.run.killPlaneRespawns,
      bigFalls: game.run.bigFalls,
      metersLost: game.run.metersLost,
      focusUsed: game.run.focusUsed,
      started: game.run.started,
      splits: { ...game.run.splits },
    },
    challenges: {
      focusEnergy: r3(game.challenges.focusEnergy),
      focusActive: game.challenges.focusActive,
      focusUsedCount: game.challenges.focusUsedCount,
      bounceCount: game.challenges.bounceCount,
      crumbleTriggers: game.challenges.crumbleTriggers,
      mantleCount: game.challenges.mantleCount,
      slipperyTicks: game.challenges.slipperyTicks,
      steamPushes: game.challenges.steamPushes,
      wind: game.challenges.windSnapshot(),
      crumbles,
    },
    hud: { targetM: ui.hud.targetM, showTimer: ui.hud.showTimer, tick: ui.hud.tick },
    summit: { summitM: game.level.summitM, fakeSummitM: game.level.fakeSummitM, summitRevealed: ui.summitRevealed, fakeSummitAtMs: game.fakeSummitAtMs },
    inputLocked: game.inputLocked,
    settings: JSON.parse(JSON.stringify(game.settings)) as unknown,
    lockOptions: game.lastLockOptions,
    pointerLocked: document.pointerLockElement != null && document.pointerLockElement === game.canvas,
    camera: {
      yaw: r3(rig?.yaw ?? 0),
      pitch: r3(rig?.pitch ?? 0),
      distance: r3(rig?.distance ?? 0),
      zoom: r3(rig?.behavior.zoomDistance ?? 0),
      fov: rig?.fov ?? 0,
      effectiveFov: r3(rig?.camera?.fov ?? 0),
      lastHit: rig?.lastHit == null ? null : r3(rig.lastHit),
      pos: rig?.camera ? arr(rig.camera.position) : ([0, 0, 0] as Vec3),
    },
    model: { uuid: game.model?.scene.uuid ?? '' },
    anim: { clip: currentClip(), mixerTime: r3(game.model?.mixer.time ?? 0) },
    simTime: r3(controller?.simTime ?? 0),
    worldClock: r3(game.motion.worldClock),
    frame: game.frame,
    platforms,
    audio: { ...audioSnapshot(), contextState: audioState() },
    render: {
      calls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      geometries: info?.memory.geometries ?? 0,
      textures: info?.memory.textures ?? 0,
      programs: info?.programs?.length ?? 0,
    },
    bvh: { buildMs: { ...game.bvh.buildMs }, tris: { ...game.bvh.tris } },
    events: game.events.slice(),
  }
}

let clipName: () => string | null = () => null

export function setClipReporter(fn: () => string | null): void {
  clipName = fn
}

function currentClip(): string | null {
  return clipName()
}

export function installGameGlobal(): void {
  const api: Record<string, unknown> = {}
  for (const key of Object.keys(snapshotGame())) {
    Object.defineProperty(api, key, { enumerable: true, get: () => (snapshotGame() as Record<string, unknown>)[key] })
  }
  Object.defineProperty(api, 'snapshot', { value: () => snapshotGame() })
  if (import.meta.env.DEV) {
    Object.defineProperty(api, '__debugTeleport', {
      value: (p: Vec3) => {
        game.port?.teleport(new Vector3(p[0], p[1], p[2]))
        game.controller?.jumps.clear()
        game.log('debugTeleport', { p })
      },
    })
    Object.defineProperty(api, '__debugSetVelocity', {
      value: (v: Vec3) => {
        game.port?.resetVelocity()
        game.port?.impulse(new Vector3(v[0], v[1], v[2]), Number.POSITIVE_INFINITY)
        game.log('debugSetVelocity', { v })
      },
    })
    Object.defineProperty(api, '__debugSetFocus', {
      value: (held: boolean) => {
        game.challenges.focusHeld = held
      },
    })
    Object.defineProperty(api, '__debugSetOdyssey', {
      value: (on: boolean) => {
        game.setOdysseyMode(on)
      },
    })
    Object.defineProperty(api, '__debugSetMode', {
      value: (mode: ChallengeMode, mods?: Partial<ChallengeModifiers>) => {
        game.setChallengeMode(mode)
        if (mods) game.setModifiers(mods)
      },
    })
  }
  Object.defineProperty(window, '__game', { value: Object.freeze(api), configurable: true })
}
