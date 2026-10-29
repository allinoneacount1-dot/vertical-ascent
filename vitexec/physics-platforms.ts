// TEST-11a (DIRECTIVE §7, D-011, D-012, ref/04 §Carry): idle 5 s on a 2 m/s platform → drift ≤0.05 m and
// isGroundedRaw ≥95 %; riding up at 1 m/s for 3 s → feet-to-surface gap ∈ [-0.02, 0.05]; riding down at 2 m/s →
// grounded ≥95 %; jump from a 3 m/s platform → landing point shifted ≈ v_platform × airtime ±15 %.
// Layer physics (ref/06 §Lapisan): dedicated headless worlds built with createHarness motion blocks, never the
// running app. App frame path per frame (src/controller/GameLoop.tsx): FrameClock.begin → PlatformMotion.beginFrame →
// (dt > 0) CharacterController.stepFrame (carry probe → applyCarry → jump/impulse → port.step), no input except
// the jump press in clause 4. Every clause runs at dt 1/60, 1/144 and 1/30 and must pass at each.
//
// Platforms (3×0.5×3, as the blockout movers): each motion starts in its 1 s dwell (the character settles), then a
// constant-velocity segment long enough for its clause. Measurements are frame-end samples; the window of a clause
// is the frames whose end worldClock lies in (tStart, tEnd].
//   drift  = max |(feet − platform origin) − (same at the window start)| over the window (3D)
//   gap    = feet y − platform collider top (world AABB max y at the current pose)
//   shift  = (landing − takeoff)_moving − (landing − takeoff)_static along the platform velocity; takeoff = feet
//            in the slice the jump fires (onTakeoff), landing = feet after the first grounded slice (onLand);
//            expected = |platform linearVelocity at takeoff| × measured airtime of the moving jump.
import { createHarness, round } from '/vitexec/lib/harness.ts'
import type { Harness, HarnessBlock } from '/vitexec/lib/harness.ts'
import { FrameClock } from '/src/game/frame-clock.ts'
import { CharacterController, NO_INPUT } from '/src/controller/character-controller.ts'
import { linearSpeed } from '/src/level/motion.ts'
import type { Motion } from '/src/level/motion.ts'

const DTS: Array<[string, number]> = [
  ['1/60', 1 / 60],
  ['1/144', 1 / 144],
  ['1/30', 1 / 30],
]
const DWELL_S = 1
const MAX_DRIFT = 0.05
const MIN_GROUNDED = 0.95
const GAP_RANGE: [number, number] = [-0.02, 0.05]
const SHIFT_TOL = 0.15

const floor: HarnessBlock = { id: 'floor', size: [80, 1, 80], pos: [0, -5.5, 0] } // top y = -5, catches a fall
const SIZE: [number, number, number] = [3, 0.5, 3]

/** Linear ping-pong from base to base + d at `speed`, starting in the 1 s dwell at base (phase = half + travel). */
function segment(d: [number, number, number], speed: number): Motion {
  const travel = Math.hypot(...d) / speed
  const half = travel + DWELL_S
  const m: Motion = { type: 'linear', points: [[0, 0, 0], d], periodS: 2 * half, phaseS: half + travel, dwellS: DWELL_S }
  if (Math.abs(linearSpeed(m) - speed) > 1e-9) throw new Error(`setup: linearSpeed ${linearSpeed(m)} != ${speed}`)
  return m
}

type Sim = {
  h: Harness
  ctrl: CharacterController
  frame: () => void
  feet: () => { x: number; y: number; z: number }
}

function sim(blocks: HarnessBlock[], spawn: [number, number, number], dt: number, events: ConstructorParameters<typeof CharacterController>[2] = {}): Sim {
  const h = createHarness(blocks, spawn)
  const clock = new FrameClock()
  const ctrl = new CharacterController(h.port, h.motion, events)
  ctrl.onEnterPlaying()
  const frame = () => {
    const d = clock.begin(dt, true)
    h.motion.beginFrame(d)
    if (d > 0) ctrl.stepFrame(d, NO_INPUT, 0, 'toggle')
  }
  const feet = () => {
    const p = h.port.position
    return { x: p.x, y: p.y, z: p.z }
  }
  return { h, ctrl, frame, feet }
}

/** Frames until the dwell ends (worldClock > DWELL_S): the first window sample is the end of the first moving frame. */
function skipDwell(s: Sim): void {
  while (s.h.motion.worldClock <= DWELL_S + 1e-9) s.frame()
}

// ---- clause 1: idle 5 s on a 2 m/s horizontal platform -------------------------------------------------------
function idleSlide(dt: number) {
  const s = sim([floor, { id: 'p', size: SIZE, pos: [0, 0.75, 0], motion: segment([14, 0, 0], 2) }], [0, 1.01, 0], dt)
  const p = s.h.motion.platforms.get('p')!
  const rel = () => {
    const f = s.feet()
    return { x: f.x - p.mover.position.x, y: f.y - p.mover.position.y, z: f.z - p.mover.position.z }
  }
  skipDwell(s)
  const tStart = s.h.motion.worldClock
  const r0 = rel()
  const platStart = p.mover.position.x
  let maxDrift = 0
  let drift = 0
  let n = 1
  let grounded = s.h.port.isGroundedRaw ? 1 : 0
  while (s.h.motion.worldClock - tStart < 5 - 1e-9) {
    s.frame()
    const r = rel()
    drift = Math.hypot(r.x - r0.x, r.y - r0.y, r.z - r0.z)
    maxDrift = Math.max(maxDrift, drift)
    n++
    if (s.h.port.isGroundedRaw) grounded++
  }
  const groundedPct = grounded / n
  return {
    pass: maxDrift <= MAX_DRIFT && groundedPct >= MIN_GROUNDED,
    windowS: round(s.h.motion.worldClock - tStart, 4),
    frames: n,
    platformMovedM: round(p.mover.position.x - platStart, 4),
    maxDriftM: round(maxDrift, 5),
    finalDriftM: round(drift, 5),
    groundedPct: round(groundedPct * 100, 2),
    groundBody: s.ctrl.groundBody,
  }
}

// ---- clause 2: ride up at 1 m/s for 3 s ---------------------------------------------------------------------
function rideUp(dt: number) {
  const s = sim([floor, { id: 'p', size: SIZE, pos: [0, 0.75, 0], motion: segment([0, 4, 0], 1) }], [0, 1.01, 0], dt)
  const p = s.h.motion.platforms.get('p')!
  skipDwell(s)
  const tStart = s.h.motion.worldClock
  const topStart = p.worldAabb.max.y
  let minGap = Infinity
  let maxGap = -Infinity
  let grounded = 0
  let n = 0
  const measure = () => {
    const gap = s.feet().y - p.worldAabb.max.y
    minGap = Math.min(minGap, gap)
    maxGap = Math.max(maxGap, gap)
    n++
    if (s.h.port.isGroundedRaw) grounded++
  }
  measure()
  while (s.h.motion.worldClock - tStart < 3 - 1e-9) {
    s.frame()
    measure()
  }
  return {
    pass: minGap >= GAP_RANGE[0] && maxGap <= GAP_RANGE[1],
    windowS: round(s.h.motion.worldClock - tStart, 4),
    frames: n,
    platformRoseM: round(p.worldAabb.max.y - topStart, 4),
    minGapM: round(minGap, 5),
    maxGapM: round(maxGap, 5),
    groundedPct_info: round((grounded / n) * 100, 2),
  }
}

// ---- clause 3: ride down at 2 m/s (whole 4 s / 8 m segment) ------------------------------------------------
function rideDown(dt: number) {
  const travel = 4
  const s = sim([floor, { id: 'p', size: SIZE, pos: [0, 8.75, 0], motion: segment([0, -8, 0], 2) }], [0, 9.01, 0], dt)
  const p = s.h.motion.platforms.get('p')!
  skipDwell(s)
  const tStart = s.h.motion.worldClock
  const topStart = p.worldAabb.max.y
  let grounded = 0
  let n = 0
  let minGap = Infinity
  let maxGap = -Infinity
  const measure = () => {
    const gap = s.feet().y - p.worldAabb.max.y
    minGap = Math.min(minGap, gap)
    maxGap = Math.max(maxGap, gap)
    n++
    if (s.h.port.isGroundedRaw) grounded++
  }
  measure()
  // stay inside the descending segment: last sample at or before the end of travel
  while (s.h.motion.worldClock + dt <= DWELL_S + travel + 1e-9) {
    s.frame()
    measure()
  }
  const groundedPct = grounded / n
  return {
    pass: groundedPct >= MIN_GROUNDED,
    windowS: round(s.h.motion.worldClock - tStart, 4),
    frames: n,
    platformDescentM: round(topStart - p.worldAabb.max.y, 4),
    groundedPct: round(groundedPct * 100, 2),
    minGapM_info: round(minGap, 5),
    maxGapM_info: round(maxGap, 5),
  }
}

// ---- clause 4: jump from a 3 m/s platform vs the same jump from a static platform ---------------------------
function jumpFrom(dt: number, moving: boolean) {
  const block: HarnessBlock = moving
    ? { id: 'p', size: SIZE, pos: [0, 0.75, 0], motion: segment([12, 0, 0], 3) }
    : { id: 'p', size: SIZE, pos: [0, 0.75, 0] }
  let takeoff: { t: number; x: number; z: number; vPlat: number } | null = null
  let land: { t: number; x: number; z: number; clock: number } | null = null
  let sRef: Sim | null = null
  const s = sim([floor, block], [0, 1.01, 0], dt, {
    onTakeoff: (simTime) => {
      const f = sRef!.feet()
      const plat = sRef!.h.motion.platforms.get('p')
      takeoff = { t: simTime, x: f.x, z: f.z, vPlat: plat ? plat.linearVelocity.length() : 0 }
    },
    onLand: (info) => {
      if (takeoff == null || land != null) return
      const f = sRef!.feet()
      land = { t: info.simTime, x: f.x, z: f.z, clock: sRef!.h.motion.worldClock }
    },
  })
  sRef = s
  // carried at constant velocity for 1 s after the dwell, then press jump
  while (s.h.motion.worldClock < 2 - 1e-9) s.frame()
  const pressedAt = s.ctrl.simTime
  s.ctrl.pressJump()
  let guard = 0
  while (land == null) {
    s.frame()
    if (++guard > 2000) throw new Error(`clause 4 (${moving ? 'moving' : 'static'}): no landing`)
  }
  for (let i = 0; i < 3; i++) s.frame()
  const t = takeoff as unknown as { t: number; x: number; z: number; vPlat: number }
  const l = land as unknown as { t: number; x: number; z: number; clock: number }
  return { pressedAt, takeoff: t, land: l, landedOn: s.ctrl.groundBody, groundedAfter: s.h.port.isGroundedRaw }
}

function jumpShift(dt: number) {
  const mv = jumpFrom(dt, true)
  const st = jumpFrom(dt, false)
  const airtime = mv.land.t - mv.takeoff.t
  const shiftX = mv.land.x - mv.takeoff.x - (st.land.x - st.takeoff.x)
  const shiftZ = mv.land.z - mv.takeoff.z - (st.land.z - st.takeoff.z)
  const expected = mv.takeoff.vPlat * airtime
  const ratio = shiftX / expected
  return {
    pass: Math.abs(ratio - 1) <= SHIFT_TOL && mv.land.clock < DWELL_S + 4 && mv.groundedAfter && st.groundedAfter,
    vPlatform: round(mv.takeoff.vPlat, 4),
    airtimeS: round(airtime, 4),
    airtimeStaticS: round(st.land.t - st.takeoff.t, 4),
    shiftAlongM: round(shiftX, 4),
    shiftLateralM: round(shiftZ, 4),
    expectedM: round(expected, 4),
    ratio: round(ratio, 4),
    movingTakeoffLand: [round(mv.takeoff.x, 3), round(mv.land.x, 3)],
    staticTakeoffLand: [round(st.takeoff.x, 3), round(st.land.x, 3)],
    landedOn: mv.landedOn,
  }
}

const results: Record<string, unknown> = {
  thresholds: { maxDriftM: MAX_DRIFT, minGrounded: MIN_GROUNDED, gapRangeM: GAP_RANGE, shiftTol: SHIFT_TOL },
}
let ok = true
for (const [label, dt] of DTS) {
  const row = { idle2mps5s: idleSlide(dt), up1mps3s: rideUp(dt), down2mps: rideDown(dt), jump3mps: jumpShift(dt) }
  const pass = row.idle2mps5s.pass && row.up1mps3s.pass && row.down2mps.pass && row.jump3mps.pass
  ok &&= pass
  results[`dt ${label}`] = { pass, ...row }
  console.log(`TEST-11a dt ${label} ` + JSON.stringify(results[`dt ${label}`]))
}
if (!ok) {
  console.log('TEST-11a FAIL ' + JSON.stringify(results))
  throw new Error('TEST-11a FAIL ' + JSON.stringify(results))
}
console.log('TEST-11a PASS ' + JSON.stringify(results))
