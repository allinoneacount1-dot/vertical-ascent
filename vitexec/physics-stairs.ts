// TEST-33 (DIRECTIVE §7 row 33, physics, G3): every stair/ramp is climbed holding W within length / walk × 1.5 s;
// a capsule pushed into a wall steeper than 45° for 3 s rises < 0.5 m. Headless harness (ref/06 §Lapisan, physics
// row): vendored physics at 240 updates/s, app frame path (FrameClock → beginFrame → stepFrame) at dt 1/60, camera
// yaw 0 so W = -Z. Stairs are visual only over a ramp collider (D-013 "tangga visual non-collider + ramp collider
// ≤40°"; ref/03 §Movement: implicit step-up ≈0.12 m), so a stair of n steps (rise, run) is measured as the ramp
// collider the level builds for it (horizontal run n·run, rise n·rise); box-step colliders are reported as
// information only. Walls: slopes above atan(maxGroundSlope) = 45° (D-013) plus a vertical wall, at walk and run.
// length = surface path length of the ramp collider, hypot(horizontal run, rise); climb time = from the feet crossing
// the foot line (interpolated) to the first grounded frame with the feet within 0.05 m of the top height.
// Validity controls: the climb measure must reject a 60° slope, the push measure must detect a 30° ramp being walked up.
import { createHarness, round } from '/vitexec/lib/harness.ts'
import type { HarnessBlock } from '/vitexec/lib/harness.ts'
import { FrameClock } from '/src/game/frame-clock.ts'
import { CharacterController, NO_INPUT } from '/src/controller/character-controller.ts'
import type { ControlInput } from '/src/controller/character-controller.ts'
import { LOCOMOTION } from '/src/controller/locomotion.ts'
import { DEFAULT_PHYSICS_OPTIONS } from '/src/physics/character-physics.ts'

const DT = 1 / 60
const WALK = LOCOMOTION.walkSpeed
const RUN = LOCOMOTION.runSpeed
/** §7 row 33 */
const CLIMB_FACTOR = 1.5
const WALL_PUSH_S = 3
const WALL_RISE_MAX = 0.5
/** "feet within 0.05 m of the top" */
const TOP_TOLERANCE = 0.05
/** feet start on flat ground 1 m before the foot line (z = 0); everything rises toward -Z */
const APPROACH = 1
const WIDTH = 2
/** closed box thickness ≥0.5 m (D-013) */
const SLAB = 0.5
/** D-013: ramp collider ≤40° */
const RAMP_MAX_DEG = 40
const WALKABLE_MAX_DEG = (Math.atan(DEFAULT_PHYSICS_OPTIONS.maxGroundSlope) * 180) / Math.PI
const SETTLE_FRAMES = 30
/** feet further than this behind the foot line during a wall push = went through the wall */
const THROUGH_Z = -1.5

const WALK_W: ControlInput = { forward: 1, backward: 0, left: 0, right: 0, run: false }
const RUN_W: ControlInput = { forward: 1, backward: 0, left: 0, right: 0, run: true }
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

const FLOOR: HarnessBlock = { id: 'floor', size: [20, 1, 60], pos: [0, -0.5, 0] }

/** Ramp collider whose top face runs exactly from (z = 0, y = 0) to (z = -run, y = rise). */
function rampBlock(id: string, run: number, rise: number): HarnessBlock {
  const a = Math.atan2(rise, run)
  return {
    id,
    size: [WIDTH, SLAB, Math.hypot(run, rise)],
    pos: [0, rise / 2 - (SLAB / 2) * Math.cos(a), -run / 2 - (SLAB / 2) * Math.sin(a)],
    rotX: a,
  }
}

/** Solid landing from the floor up to the top height, its front face at z = -run. */
function landingBlock(run: number, rise: number): HarnessBlock {
  return { id: 'landing', size: [4, rise, 4], pos: [0, rise / 2, -run - 2] }
}

/** Box-step colliders (information only, D-013): step i is a solid from y = -SLAB to i·rise, front at -(i-1)·run. */
function boxStepBlocks(n: number, rise: number, run: number): HarnessBlock[] {
  const blocks: HarnessBlock[] = []
  const back = -n * run - 4
  for (let i = 1; i <= n; i++) {
    const front = -(i - 1) * run
    const top = i * rise
    blocks.push({ id: `step-${i}`, size: [WIDTH, top + SLAB, front - back], pos: [0, (top - SLAB) / 2, (front + back) / 2] })
  }
  return blocks
}

type Geometry = { id: string; kind: string; blocks: HarnessBlock[]; run: number; rise: number; angleDeg: number; steps?: { n: number; rise: number; run: number } }

function stairs(id: string, n: number, rise: number, run: number): Geometry {
  const r = n * run
  const h = n * rise
  return { id, kind: 'stairs (visual) over ramp collider', blocks: [FLOOR, rampBlock('ramp', r, h), landingBlock(r, h)], run: r, rise: h, angleDeg: toDeg(Math.atan2(h, r)), steps: { n, rise, run } }
}

function ramp(id: string, deg: number, surface: number, withLanding = true): Geometry {
  const r = surface * Math.cos(toRad(deg))
  const h = surface * Math.sin(toRad(deg))
  const blocks = [FLOOR, rampBlock('ramp', r, h)]
  if (withLanding) blocks.push(landingBlock(r, h))
  return { id, kind: 'ramp collider', blocks, run: r, rise: h, angleDeg: deg }
}

function boxStairs(id: string, n: number, rise: number, run: number): Geometry {
  return { id, kind: 'box-step colliders (not used in levels, D-013)', blocks: [FLOOR, ...boxStepBlocks(n, rise, run)], run: n * run, rise: n * rise, angleDeg: toDeg(Math.atan2(rise, run)), steps: { n, rise, run } }
}

function verticalWall(id: string): Geometry {
  return { id, kind: 'vertical wall', blocks: [FLOOR, { id: 'wall', size: [WIDTH, 4, SLAB], pos: [0, 2, -SLAB / 2] }], run: 0, rise: 4, angleDeg: 90 }
}

/** World + controller on the app frame path, feet settled on the floor 1 m before the foot line. */
function setup(g: Geometry) {
  const h = createHarness(g.blocks, [0, 0, APPROACH])
  const clock = new FrameClock()
  const ctrl = new CharacterController(h.port, h.motion)
  ctrl.onEnterPlaying()
  clock.begin(DT, true) // first delta after entering PLAYING is discarded (D-011)
  const frame = (input: ControlInput): number => {
    const d = clock.begin(DT, true)
    h.motion.beginFrame(d)
    ctrl.stepFrame(d, input, 0, 'hold')
    return d
  }
  for (let i = 0; i < SETTLE_FRAMES; i++) frame(NO_INPUT)
  return { h, frame, settled: h.port.isGroundedRaw }
}

type ClimbResult = {
  id: string
  kind: string
  angleDeg: number
  steps?: { n: number; rise: number; run: number }
  runM: number
  riseM: number
  lengthM: number
  settled: boolean
  footS: number | null
  topS: number | null
  climbS: number | null
  boundS: number
  /** information: topS counted from the first W frame against (1 m approach + length) / walk × 1.5 */
  fromStartBoundS: number
  meanSurfaceSpeed: number | null
  minFeetY: number
  maxAbsX: number
  nonFinite: number
  ok: boolean
}

/** Holds W at walk speed until the top is reached (or 3 × bound after the expected foot crossing). */
function climb(g: Geometry): ClimbResult {
  const { h, frame, settled } = setup(g)
  const length = Math.hypot(g.run, g.rise)
  const bound = (length / WALK) * CLIMB_FACTOR
  const limit = APPROACH / WALK + 3 * bound + 1
  let t = 0
  let prevZ = h.port.position.z
  let footS: number | null = null
  let topS: number | null = null
  let minFeetY = Infinity
  let maxAbsX = 0
  let nonFinite = 0
  while (topS == null && t < limit) {
    const d = frame(WALK_W)
    t += d
    const p = h.port.position
    if (![p.x, p.y, p.z].every(Number.isFinite)) {
      nonFinite++
      break
    }
    if (footS == null && p.z <= 0) footS = t - d + d * (prevZ / (prevZ - p.z))
    if (h.port.isGroundedRaw && Math.abs(p.y - g.rise) <= TOP_TOLERANCE) topS = t
    minFeetY = Math.min(minFeetY, p.y)
    maxAbsX = Math.max(maxAbsX, Math.abs(p.x))
    prevZ = p.z
  }
  const climbS = footS != null && topS != null ? topS - footS : null
  const ok = settled && nonFinite === 0 && climbS != null && climbS <= bound
  return {
    id: g.id,
    kind: g.kind,
    angleDeg: round(g.angleDeg, 3),
    ...(g.steps ? { steps: g.steps } : {}),
    runM: round(g.run, 4),
    riseM: round(g.rise, 4),
    lengthM: round(length, 4),
    settled,
    footS: footS == null ? null : round(footS, 4),
    topS: topS == null ? null : round(topS, 4),
    climbS: climbS == null ? null : round(climbS, 4),
    boundS: round(bound, 4),
    fromStartBoundS: round(((APPROACH + length) / WALK) * CLIMB_FACTOR, 4),
    meanSurfaceSpeed: climbS == null ? null : round(length / climbS, 4),
    minFeetY: round(minFeetY, 4),
    maxAbsX: round(maxAbsX, 4),
    nonFinite,
    ok,
  }
}

type PushResult = {
  id: string
  kind: string
  angleDeg: number
  gait: 'walk' | 'run'
  settled: boolean
  contactS: number | null
  pushS: number
  maxRiseM: number
  finalRiseM: number
  minFeetZ: number
  nonFinite: number
  ok: boolean
}

/**
 * Holds W (walk or run) into the geometry until 3 s after first contact. Contact = first frame whose -Z advance is
 * below 90 % of the input speed (detected at most a frame late, so the push lasts at least 3 s).
 */
function push(g: Geometry, gait: 'walk' | 'run'): PushResult {
  const { h, frame, settled } = setup(g)
  const input = gait === 'run' ? RUN_W : WALK_W
  const speed = gait === 'run' ? RUN : WALK
  const y0 = h.port.position.y
  const limit = (3 * APPROACH) / speed + WALL_PUSH_S + 1
  let t = 0
  let prevZ = h.port.position.z
  let contactS: number | null = null
  let maxRise = 0
  let minFeetZ = Infinity
  let nonFinite = 0
  while (t < limit) {
    const d = frame(input)
    t += d
    const p = h.port.position
    if (![p.x, p.y, p.z].every(Number.isFinite)) {
      nonFinite++
      break
    }
    if (contactS == null && prevZ - p.z < 0.9 * speed * d) contactS = t - d
    maxRise = Math.max(maxRise, p.y - y0)
    minFeetZ = Math.min(minFeetZ, p.z)
    prevZ = p.z
    if (contactS != null && t - contactS >= WALL_PUSH_S - 1e-9) break
  }
  const pushS = contactS == null ? 0 : t - contactS
  const ok = settled && nonFinite === 0 && contactS != null && pushS >= WALL_PUSH_S - 1e-9 && maxRise < WALL_RISE_MAX && minFeetZ > THROUGH_Z
  return {
    id: g.id,
    kind: g.kind,
    angleDeg: round(g.angleDeg, 3),
    gait,
    settled,
    contactS: contactS == null ? null : round(contactS, 4),
    pushS: round(pushS, 4),
    maxRiseM: round(maxRise, 4),
    finalRiseM: round(h.port.position.y - y0, 4),
    minFeetZ: round(minFeetZ, 4),
    nonFinite,
    ok,
  }
}

// ---- asserted climbs: the two stair shapes (as built: ramp collider), a 30° ramp 6 m long, the D-013 maximum 40°
// and the walkable limit 45° (maxGroundSlope 1.0) ----
const climbGeometries: Geometry[] = [
  stairs('stairs-8x0.20x0.35', 8, 0.2, 0.35),
  stairs('stairs-6x0.25x0.40', 6, 0.25, 0.4),
  ramp('ramp-30deg-6m', 30, 6),
  ramp(`ramp-${RAMP_MAX_DEG}deg-4m`, RAMP_MAX_DEG, 4),
  ramp('ramp-45deg-4m', 45, 4),
]
// ---- asserted walls: >45° slopes 4 m long and a vertical wall, walk and run ----
const wallGeometries: Geometry[] = [ramp('wall-50deg-4m', 50, 4, false), ramp('wall-60deg-4m', 60, 4, false), verticalWall('wall-90deg')]
// ---- information only: box-step colliders with the same step sizes (levels never build these, D-013) ----
const infoGeometries: Geometry[] = [boxStairs('boxsteps-8x0.20x0.35', 8, 0.2, 0.35), boxStairs('boxsteps-6x0.25x0.40', 6, 0.25, 0.4)]

const failures: string[] = []
const climbs: ClimbResult[] = []
for (const g of climbGeometries) {
  const r = climb(g)
  console.log('climb ' + JSON.stringify(r))
  climbs.push(r)
  if (!r.settled) failures.push(`${r.id}: did not settle on the floor`)
  if (r.nonFinite > 0) failures.push(`${r.id}: non-finite position`)
  if (r.climbS == null) failures.push(`${r.id}: top not reached (foot ${r.footS}, top ${r.topS})`)
  else if (r.climbS > r.boundS) failures.push(`${r.id}: climb ${r.climbS} s > ${r.boundS} s (length ${r.lengthM} m / ${WALK} × ${CLIMB_FACTOR})`)
}
const pushes: PushResult[] = []
for (const g of wallGeometries) {
  if (!(g.angleDeg > WALKABLE_MAX_DEG)) throw new Error(`${g.id}: wall setup is not steeper than ${WALKABLE_MAX_DEG}°`)
  for (const gait of ['walk', 'run'] as const) {
    const r = push(g, gait)
    console.log('push ' + JSON.stringify(r))
    pushes.push(r)
    if (!r.settled) failures.push(`${r.id} ${gait}: did not settle on the floor`)
    if (r.nonFinite > 0) failures.push(`${r.id} ${gait}: non-finite position`)
    if (r.contactS == null) failures.push(`${r.id} ${gait}: no contact`)
    else if (r.pushS < WALL_PUSH_S - 1e-9) failures.push(`${r.id} ${gait}: pushed only ${r.pushS} s`)
    if (r.maxRiseM >= WALL_RISE_MAX) failures.push(`${r.id} ${gait}: rose ${r.maxRiseM} m (≥ ${WALL_RISE_MAX})`)
    if (r.minFeetZ <= THROUGH_Z) failures.push(`${r.id} ${gait}: went through the wall (feet z ${r.minFeetZ})`)
  }
}
const info = infoGeometries.map((g) => {
  const r = climb(g)
  console.log('info ' + JSON.stringify(r))
  return r
})

// ---- validity controls: each measure must catch the opposite case ----
const controlClimb = climb(ramp('control-climb-60deg-4m', 60, 4))
const controlPush = push(ramp('control-push-30deg-6m', 30, 6), 'walk')
const controls = {
  climb60: { topS: controlClimb.topS, climbS: controlClimb.climbS, boundS: controlClimb.boundS, detected: !controlClimb.ok },
  push30: { maxRiseM: controlPush.maxRiseM, pushS: controlPush.pushS, detected: controlPush.maxRiseM >= WALL_RISE_MAX },
}
console.log('controls ' + JSON.stringify(controls))
if (!controls.climb60.detected) failures.push('validity: the climb measure accepted a 60° slope')
if (!controls.push30.detected) failures.push('validity: the push measure did not detect walking up a 30° ramp')

const numbers = {
  dt: DT,
  ups: DEFAULT_PHYSICS_OPTIONS.updatesPerSecond,
  walk: WALK,
  run: RUN,
  thresholds: { climbFactor: CLIMB_FACTOR, topToleranceM: TOP_TOLERANCE, wallPushS: WALL_PUSH_S, wallRiseMaxM: WALL_RISE_MAX, rampMaxDeg: RAMP_MAX_DEG, walkableMaxDeg: round(WALKABLE_MAX_DEG, 4) },
  definition:
    'length = hypot(horizontal run, rise) of the ramp collider surface; bound = length / walk × 1.5; climb = feet crossing the foot line (linear interpolation) → first grounded frame with |feetY - top| ≤ 0.05; stairs = visual over ramp collider (D-013); push rise = max feet y - settled feet y until 3 s after first contact',
  climbs: climbs.map((c) => ({ id: c.id, angleDeg: c.angleDeg, lengthM: c.lengthM, climbS: c.climbS, boundS: c.boundS, ok: c.ok })),
  pushes: pushes.map((p) => ({ id: p.id, gait: p.gait, pushS: p.pushS, maxRiseM: p.maxRiseM, ok: p.ok })),
  info: info.map((c) => ({ id: c.id, kind: c.kind, climbS: c.climbS, boundS: c.boundS, topS: c.topS, ok: c.ok })),
  controls,
}
if (failures.length) {
  console.log('TEST-33 numbers ' + JSON.stringify(numbers))
  throw new Error('TEST-33 FAIL ' + failures.join('; '))
}
console.log('TEST-33 PASS ' + JSON.stringify(numbers))
