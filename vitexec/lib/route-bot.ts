// Closed-loop route bot (ref/06 §Route bot, D-018): reads window.__game, presses human keys (W/Space/Shift) and turns
// the camera with relative mouse movement — no teleport, no position writes, no physics options, no __debug*.
// Route data is generated (scripts/build-routes.mjs → /vitexec/routes/<level>.json).
import { keyboard, mouse } from 'vitexec'
import { Vector3 } from 'three'
import { evaluateMotion } from '/src/level/motion.ts'
import type { Motion, Pose } from '/src/level/motion.ts'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep, wrap } from '/vitexec/lib/move-smoke.ts'

type Window2 = [number, number]
export type Waypoint = {
  id: string
  zone: string
  pos: [number, number, number]
  half: [number, number]
  takeoff: [number, number, number]
  target: [number, number, number]
  needsJump: boolean
  needsSprint: boolean
  needsDoubleJump: boolean
  moving: { platform: string } | null
  waitPhase: { platform: string; window?: Window2; windows?: Window2[] } | null
}
export type Route = { level: string; waypoints: Waypoint[] }
type LevelEntry = { id: string; motion: Motion | null }
type Snap = {
  state: string
  player: { pos: number[]; vel: number[]; groundedRaw: boolean; sprintActive: boolean }
  camera: { yaw: number }
  platforms: Record<string, { phase: number }>
  anim: { clip: string | null }
  run: { timerMs: number; heightM: number }
}

const snap = (): Snap => (window as unknown as { __game: { snapshot(): Snap } }).__game.snapshot()
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const yawTo = (p: number[], x: number, z: number) => Math.atan2(-(x - p[0]), -(z - p[2]))

export async function runRoute(route: Route, levelEntries: LevelEntry[], label: string): Promise<void> {
  const renderer = logRenderer()
  const canvas = await bootToPlaying()
  const H = canvas.getBoundingClientRect().height
  const motions = new Map(levelEntries.filter((e) => e.motion).map((e) => [e.id, e.motion as Motion]))
  const pose: Pose = { offset: new Vector3(), yaw: 0 }
  /** Current world offset of a mover from its base pose (same law as the game, from its phase). */
  const moverOffset = (id: string): Vector3 => {
    const m = motions.get(id)
    const ph = snap().platforms[id]?.phase
    if (!m || ph == null) return new Vector3()
    evaluateMotion(m, ph * m.periodS - m.phaseS, pose)
    return pose.offset.clone()
  }
  /** Offset of a mover at the pose the route data was generated for (start dwell for "onto", end dwell for "off"). */
  const moverOffsetAt = (id: string, u: number): Vector3 => {
    const m = motions.get(id)
    if (!m) return new Vector3()
    evaluateMotion(m, u * m.periodS - m.phaseS, pose)
    return pose.offset.clone()
  }

  let wHeld = false
  const setW = async (on: boolean) => {
    if (on && !wHeld) {
      await keyboard.down('KeyW')
      wHeld = true
    } else if (!on && wHeld) {
      await keyboard.up('KeyW')
      wHeld = false
    }
  }
  const aim = async (want: number, tol = 0.04) => {
    for (let i = 0; i < 8; i++) {
      const err = wrap(want - snap().camera.yaw)
      if (Math.abs(err) <= tol) return
      await mouse.move(clamp(Math.round((-err * H) / 4), -700, 700), 0, { durationMs: 60 })
      await nextFrame()
    }
  }
  const setSprint = async (on: boolean) => {
    if (snap().player.sprintActive !== on) {
      await keyboard.press('ShiftLeft')
      await nextFrame()
    }
  }

  /** Walk to a point that may move with a platform (pointAt is re-evaluated every frame). */
  const walkTo = async (pointAt: () => [number, number], tol = 0.15, timeoutMs = 8000): Promise<boolean> => {
    await setSprint(false)
    const t0 = performance.now()
    for (;;) {
      const s = snap()
      const p = s.player.pos
      const [x, z] = pointAt()
      const d = Math.hypot(x - p[0], z - p[2])
      if (d <= tol) {
        await setW(false)
        return true
      }
      if (performance.now() - t0 > timeoutMs || s.state !== 'PLAYING') {
        await setW(false)
        return false
      }
      const want = yawTo(p, x, z)
      const err = wrap(want - s.camera.yaw)
      if (Math.abs(err) > 0.25) {
        await setW(false)
        await aim(want)
        continue
      }
      if (Math.abs(err) > 0.03) await mouse.move(clamp(Math.round((-err * H) / 4), -200, 200), 0, { durationMs: 40 })
      if (d < 0.6) {
        await setW(false)
        await keyboard.press('KeyW', { durationMs: Math.max(25, Math.round((d / 3) * 1000 * 0.7)) })
        await sleep(40)
      } else {
        await setW(true)
        await nextFrame()
      }
    }
  }

  const inWindow = (u: number, w: Window2) => (w[0] <= w[1] ? u >= w[0] && u <= w[1] : u >= w[0] || u <= w[1])
  const waitWindow = async (wp: Waypoint['waitPhase'], timeoutMs = 20000): Promise<boolean> => {
    if (wp == null) return true
    const windows = wp.windows ?? (wp.window ? [wp.window] : [])
    const t0 = performance.now()
    for (;;) {
      const u = snap().platforms[wp.platform]?.phase
      if (u != null && windows.some((w) => inWindow(u, w))) return true
      if (performance.now() - t0 > timeoutMs) return false
      await nextFrame()
    }
  }

  /** Jump toward target; steer in the air; release W above the target; return after landing. */
  const jumpTo = async (target: () => [number, number], wp: Waypoint): Promise<void> => {
    const s0 = snap()
    const [tx0, tz0] = target()
    await aim(yawTo(s0.player.pos, tx0, tz0))
    if (!(await waitWindow(wp.waitPhase))) throw new Error(`${wp.id}: phase window never came`)
    const [tx1, tz1] = target()
    await aim(yawTo(snap().player.pos, tx1, tz1), 0.03)
    await setSprint(wp.needsSprint)
    await setW(true)
    await keyboard.press('Space')
    let airborne = false
    const t0 = performance.now()
    let pressedSecond = false
    for (;;) {
      const s = snap()
      const p = s.player.pos
      const [tx, tz] = target()
      if (!s.player.groundedRaw) airborne = true
      const d = Math.hypot(tx - p[0], tz - p[2])
      if (wHeld && d < 0.3) await setW(false)
      if (airborne && s.player.groundedRaw) break
      if (performance.now() - t0 > 4000) break
      if (wp.needsDoubleJump && airborne && !pressedSecond && s.player.vel[1] < 0) {
        pressedSecond = true
        await keyboard.press('Space')
      }
      if (wHeld) {
        const err = wrap(yawTo(p, tx, tz) - s.camera.yaw)
        if (Math.abs(err) > 0.05) await mouse.move(clamp(Math.round((-err * H) / 4), -150, 150), 0, { durationMs: 30 })
        else await nextFrame()
      } else await nextFrame()
    }
    await setW(false)
    await setSprint(false)
    await sleep(120)
  }

  // pad tests ------------------------------------------------------------------------------------------------
  const padFootprint = (wp: Waypoint) => {
    const off = wp.moving ? moverOffset(wp.moving.platform) : new Vector3()
    return { cx: wp.pos[0] + off.x, cz: wp.pos[2] + off.z, top: wp.pos[1] + off.y, hx: wp.half[0], hz: wp.half[1] }
  }
  const onPad = (wp: Waypoint): boolean => {
    const s = snap()
    const p = s.player.pos
    const f = padFootprint(wp)
    return s.player.groundedRaw && Math.abs(p[0] - f.cx) <= f.hx && Math.abs(p[2] - f.cz) <= f.hz && Math.abs(p[1] - f.top) < 0.25
  }

  // run --------------------------------------------------------------------------------------------------------
  const wps = route.waypoints
  const tStart = performance.now()
  const milestones: Array<Record<string, unknown>> = []
  const animSamples: Array<{ t: number; clip: string | null; groundedSpeed: number | null }> = []
  const sampler = setInterval(() => {
    const s = snap()
    const v = s.player.vel
    animSamples.push({ t: r3((performance.now() - tStart) / 1000), clip: s.anim.clip, groundedSpeed: s.player.groundedRaw ? r3(Math.hypot(v[0], v[2])) : null })
  }, 100)
  const attempts = new Map<number, number>()
  let i = 0
  let retries = 0
  try {
    while (i < wps.length) {
      const wp = wps[i]
      const prev = i > 0 ? wps[i - 1] : null
      const n = (attempts.get(i) ?? 0) + 1
      attempts.set(i, n)
      if (n > 4) throw new Error(`${wp.id}: more than 3 retries`)
      // takeoff point: on a moving pad it moves with the pad (generated for its end-dwell pose)
      const takeoffAt = (): [number, number] => {
        if (prev?.moving) {
          const now = moverOffset(prev.moving.platform)
          const gen = moverOffsetAt(prev.moving.platform, 0.45)
          return [wp.takeoff[0] - gen.x + now.x, wp.takeoff[2] - gen.z + now.z]
        }
        return [wp.takeoff[0], wp.takeoff[2]]
      }
      const targetAt = (): [number, number] => {
        if (wp.moving) {
          const now = moverOffset(wp.moving.platform)
          const gen = moverOffsetAt(wp.moving.platform, 0.99)
          return [wp.target[0] - gen.x + now.x, wp.target[2] - gen.z + now.z]
        }
        return [wp.target[0], wp.target[2]]
      }
      if (!(await walkTo(takeoffAt, 0.15))) throw new Error(`${wp.id}: could not reach the takeoff point`)
      await jumpTo(targetAt, wp)
      if (onPad(wp)) {
        milestones.push({ id: wp.id, zone: wp.zone, t: r3((performance.now() - tStart) / 1000), heightM: snap().run.heightM, feetY: r3(snap().player.pos[1]), attempt: n })
        console.log(`[${label}] milestone ${wp.id} t=${milestones[milestones.length - 1].t}`)
        i++
        continue
      }
      // missed: continue from the pad we are standing on (or the floor = start)
      retries++
      await sleep(300)
      let k = -1
      for (let j = wps.length - 1; j >= 0; j--) if (onPad(wps[j])) {
        k = j
        break
      }
      console.log(`[${label}] missed ${wp.id}, standing on ${k >= 0 ? wps[k].id : 'floor'}`)
      i = k + 1
    }
    // victory: finish sensor + grounded on the last pad
    const tv = performance.now()
    while (snap().state !== 'VICTORY' && performance.now() - tv < 3000) await nextFrame()
  } finally {
    clearInterval(sampler)
    await setW(false)
  }
  const final = snap()
  const gameplayS = r3((performance.now() - tStart) / 1000)
  const movingIdle = animSamples.filter((a) => a.groundedSpeed != null && a.groundedSpeed > 0.5 && a.clip === 'idle').length
  const noClip = animSamples.filter((a) => a.clip == null).length
  const result = { label, renderer, victory: final.state === 'VICTORY', gameplayS, waypoints: wps.length, milestones: milestones.length, retries, timerMs: final.run.timerMs, animSamples: animSamples.length, animNoClip: noClip, animIdleWhileMoving: movingIdle }
  console.log('milestones ' + JSON.stringify(milestones))
  console.log('final ' + JSON.stringify({ state: final.state, pos: final.player.pos, run: final.run }))
  console.log('anim-samples ' + JSON.stringify(animSamples))
  if (!result.victory || result.milestones !== wps.length || result.gameplayS < 12) {
    console.log('TEST-20a numbers ' + JSON.stringify(result))
    throw new Error('TEST-20a FAIL ' + JSON.stringify(result))
  }
  console.log('TEST-20a PASS ' + JSON.stringify(result))
}
