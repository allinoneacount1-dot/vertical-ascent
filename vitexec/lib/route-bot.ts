// Closed-loop route bot (ref/06 §Route bot, D-018): reads window.__game, presses human keys (W/Space/Shift) and turns
// the camera with relative mouse movement — no teleport, no position writes, no physics options, no __debug*.
// Route data is generated (scripts/build-routes.mjs → /vitexec/routes/<level>.json). createBot() is shared with the
// noisy diagnostic bot (vitexec/play-noisy.ts, TEST-38), which adds seeded human error and nothing else.
import { keyboard, mouse } from 'vitexec'
import { Vector3 } from 'three'
import { evaluateMotion } from '/src/level/motion.ts'
import type { Motion, Pose } from '/src/level/motion.ts'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep, wrap } from '/vitexec/lib/move-smoke.ts'
import { useUi } from '/src/game/store.ts'

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

/** Seeded human error (TEST-38 only): reaction delay before timed jumps, yaw jitter, takeoff point along the jump. */
export type Noise = { next(): number; reactionMs(): number; yawJitter(): number; takeoffShiftM(): number; doubleJumpDelayMs(): number }

export const snap = (): Snap => (window as unknown as { __game: { snapshot(): Snap } }).__game.snapshot()
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const yawTo = (p: number[], x: number, z: number) => Math.atan2(-(x - p[0]), -(z - p[2]))
/** Phase in the middle of a linear motion's end dwell (scripts/build-routes.mjs generates "off" takeoffs there). */
const endDwellU = (m: Motion | undefined) => (m ? (m.periodS / 2 - m.dwellS / 2) / m.periodS : 0.45)

/**
 * Zone screenshot (ref/06 §Route bot: screenshot on entering each zone): the canvas is read in a rAF callback after the
 * frame's render (the drawing buffer is presented only after all rAF callbacks), scaled to 960 px and logged as
 * "zoneshot {json}"; scripts/extract-zoneshots.mjs writes the files.
 */
export async function zoneShot(canvas: HTMLCanvasElement, zone: string, label: string): Promise<void> {
  await nextFrame()
  const url = await new Promise<string>((resolve) =>
    requestAnimationFrame(() => {
      const c = document.createElement('canvas')
      c.width = 960
      c.height = Math.round((960 * canvas.height) / canvas.width)
      c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.7))
    }),
  )
  console.log('zoneshot ' + JSON.stringify({ label, zone, t: r3(performance.now() / 1000), bytes: url.length, dataUrl: url }))
}

export type Bot = ReturnType<typeof createBot>

/** The bot's moves for one route on a booted page (canvas from bootToPlaying()). */
export function createBot(route: Route, levelEntries: LevelEntry[], canvas: HTMLCanvasElement, noise: Noise | null = null) {
  const H = canvas.getBoundingClientRect().height
  const wps = route.waypoints
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

  /** Walk to a point that may move with a platform (pointAt is re-evaluated every frame); timeout scales with distance. */
  const walkTo = async (pointAt: () => [number, number], tol = 0.15): Promise<boolean> => {
    await setSprint(false)
    const t0 = performance.now()
    const p0 = snap().player.pos
    const [x0, z0] = pointAt()
    const timeoutMs = 8000 + (Math.hypot(x0 - p0[0], z0 - p0[2]) / 2) * 1000
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
  const waitWindow = async (wp: Waypoint['waitPhase']): Promise<boolean> => {
    if (wp == null) return true
    // a full period of the platform plus 5 s (lifts run up to ~30 s per period)
    const timeoutMs = ((motions.get(wp.platform)?.periodS ?? 15) + 5) * 1000
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
    if (noise && wp.waitPhase) await sleep(noise.reactionMs())
    const [tx1, tz1] = target()
    await aim(yawTo(snap().player.pos, tx1, tz1) + (noise ? noise.yawJitter() : 0), 0.03)
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
        if (noise) await sleep(noise.doubleJumpDelayMs())
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
  /** Index of the route pad underfoot (highest index first), or -1. */
  const standingIndex = (): number => {
    for (let j = wps.length - 1; j >= 0; j--) if (onPad(wps[j])) return j
    return -1
  }

  /** One attempt at waypoint i from wherever the player stands (takeoff, jump, landing); true = landed on it. */
  const attempt = async (i: number): Promise<boolean> => {
    const wp = wps[i]
    const prev = i > 0 ? wps[i - 1] : null
    // takeoff point: on a moving pad it moves with the pad (generated for its end-dwell pose)
    const takeoffAt = (): [number, number] => {
      let x = wp.takeoff[0]
      let z = wp.takeoff[2]
      if (prev?.moving) {
        const now = moverOffset(prev.moving.platform)
        const gen = moverOffsetAt(prev.moving.platform, endDwellU(motions.get(prev.moving.platform)))
        x += now.x - gen.x
        z += now.z - gen.z
      }
      return [x, z]
    }
    const targetAt = (): [number, number] => {
      if (wp.moving) {
        const now = moverOffset(wp.moving.platform)
        const gen = moverOffsetAt(wp.moving.platform, 0.99)
        return [wp.target[0] - gen.x + now.x, wp.target[2] - gen.z + now.z]
      }
      return [wp.target[0], wp.target[2]]
    }
    let walkPoint = takeoffAt
    if (noise) {
      // a human takes off a little early or late along the jump direction
      const shift = noise.takeoffShiftM()
      walkPoint = () => {
        const [x, z] = takeoffAt()
        const [tx, tz] = targetAt()
        const len = Math.hypot(tx - x, tz - z) || 1
        return [x + ((tx - x) / len) * shift, z + ((tz - z) / len) * shift]
      }
    }
    if (prev != null && !prev.moving && !wp.moving && (prev.half[0] > 4 || prev.half[1] > 4)) {
      const p0 = snap().player.pos
      const [tx, tz] = walkPoint()
      const padX = wp.half[0] + 0.55
      const padZ = wp.half[1] + 0.55
      const inBox = (x: number, z: number) =>
        x >= wp.pos[0] - padX && x <= wp.pos[0] + padX && z >= wp.pos[2] - padZ && z <= wp.pos[2] + padZ
      const segHitsWp = (ax: number, az: number, bx: number, bz: number, skipStart = false): boolean => {
        for (let s = skipStart ? 4 : 0; s <= 20; s++) {
          const u = s / 20
          if (inBox(ax + (bx - ax) * u, az + (bz - az) * u)) return true
        }
        return false
      }
      const inDeck = (x: number, z: number) =>
        Math.abs(x - prev.pos[0]) <= prev.half[0] - 0.5 && Math.abs(z - prev.pos[2]) <= prev.half[1] - 0.5
      if (segHitsWp(p0[0], p0[2], tx, tz)) {
        const safeZ = clamp(p0[2], prev.pos[2] - prev.half[1] + 0.8, prev.pos[2] + prev.half[1] - 0.8)
        const safeX = clamp(p0[0], prev.pos[0] - prev.half[0] + 0.8, prev.pos[0] + prev.half[0] - 0.8)
        const sideZ = wp.pos[2] + (prev.pos[2] >= wp.pos[2] ? padZ + 1.2 : -(padZ + 1.2))
        const sideX = wp.pos[0] + (prev.pos[0] >= wp.pos[0] ? padX + 1.2 : -(padX + 1.2))
        const clearX = p0[0] <= wp.pos[0] ? Math.min(safeX, wp.pos[0] - padX - 0.6) : Math.max(safeX, wp.pos[0] + padX + 0.6)
        const clearZ = p0[2] <= wp.pos[2] ? Math.min(safeZ, wp.pos[2] - padZ - 0.6) : Math.max(safeZ, wp.pos[2] + padZ + 0.6)
        const candidates: Array<Array<[number, number]>> = [
          [[tx, safeZ]],
          [[safeX, tz]],
          [
            [clearX, safeZ],
            [clearX, sideZ],
            [tx, sideZ],
          ],
          [
            [safeX, clearZ],
            [sideX, clearZ],
            [sideX, tz],
          ],
        ]
        for (const path of candidates) {
          if (!path.every(([x, z]) => inDeck(x, z))) continue
          const pts: Array<[number, number]> = [[p0[0], p0[2]], ...path, [tx, tz]]
          let clear = true
          for (let k = 0; k < pts.length - 1; k++) {
            if (segHitsWp(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], k === 0)) clear = false
          }
          if (clear) {
            for (const [cx, cz] of path) await walkTo(() => [cx, cz], 0.35)
            break
          }
        }
      }
    }
    if (!(await walkTo(walkPoint, 0.15))) throw new Error(`${wp.id}: could not reach the takeoff point`)
    await jumpTo(targetAt, wp)
    return onPad(wp)
  }

  return { wps, attempt, onPad, standingIndex, setW }
}

export async function runRoute(route: Route, levelEntries: LevelEntry[], label: string, testId = '20a'): Promise<void> {
  const renderer = logRenderer()
  const canvas = await bootToPlaying()
  const bot = createBot(route, levelEntries, canvas)
  const wps = bot.wps
  const tStart = performance.now()
  const milestones: Array<Record<string, unknown>> = []
  const animSamples: Array<{ t: number; clip: string | null; groundedSpeed: number | null }> = []
  /** The first waypoint of a zone is reached only after the previous zone's last one. */
  const prevZoneDone = (idx: number) => idx > 0 && wps[idx - 1].zone !== wps[idx].zone
  const sampler = setInterval(() => {
    const s = snap()
    const v = s.player.vel
    animSamples.push({ t: r3((performance.now() - tStart) / 1000), clip: s.anim.clip, groundedSpeed: s.player.groundedRaw ? r3(Math.hypot(v[0], v[2])) : null })
  }, 100)
  const attempts = new Map<number, number>()
  const zonesShot = new Set<string>()
  let i = 0
  let retries = 0
  try {
    if (wps.length > 0) {
      zonesShot.add(wps[0].zone)
      await zoneShot(canvas, wps[0].zone, label)
    }
    while (i < wps.length) {
      const wp = wps[i]
      if (!zonesShot.has(wp.zone) && prevZoneDone(i)) {
        zonesShot.add(wp.zone)
        await zoneShot(canvas, wp.zone, label)
      }
      const n = (attempts.get(i) ?? 0) + 1
      attempts.set(i, n)
      if (n > 4) throw new Error(`${wp.id}: more than 3 retries`)
      if (await bot.attempt(i)) {
        milestones.push({ id: wp.id, zone: wp.zone, t: r3((performance.now() - tStart) / 1000), heightM: snap().run.heightM, feetY: r3(snap().player.pos[1]), attempt: n })
        console.log(`[${label}] milestone ${wp.id} t=${milestones[milestones.length - 1].t}`)
        i++
        continue
      }
      // missed: continue from the pad we are standing on (or the floor = start)
      retries++
      await sleep(300)
      const k = bot.standingIndex()
      console.log(`[${label}] missed ${wp.id}, standing on ${k >= 0 ? wps[k].id : 'floor'}`)
      // off the route entirely (no route pad underfoot) in a multi-deck world: a human would walk back; the bot stops
      if (k < 0 && route.level !== 'slice') throw new Error(`${wp.id}: fell off the route (feet ${JSON.stringify(snap().player.pos)})`)
      i = k + 1
    }
    // victory: finish sensor + grounded on the last pad
    const tv = performance.now()
    while (snap().state !== 'VICTORY' && performance.now() - tv < 3000) await nextFrame()
  } finally {
    clearInterval(sampler)
    await bot.setW(false)
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
    console.log(`TEST-${testId} numbers ` + JSON.stringify(result))
    throw new Error(`TEST-${testId} FAIL ` + JSON.stringify(result))
  }
  if (route.level !== 'slice') {
    // D-023 summary as the store holds it and as the victory screen shows it
    await sleep(500)
    await zoneShot(canvas, 'victory', label)
    const text = document.querySelector('[data-testid="panel-victory"]')?.textContent ?? document.body.innerText
    console.log('victory-summary ' + JSON.stringify({ store: useUi.getState().victory, screenText: text }))
  }
  console.log(`TEST-${testId} PASS ` + JSON.stringify(result))
}
