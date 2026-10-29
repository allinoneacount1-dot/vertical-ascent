// TEST-08, physics part (DIRECTIVE §7 row 08; ref/06 §Lapisan, physics row). Headless harness, no rendering.
// 100 standing jumps on a flat floor (80 × 1 × 80, top y = 0) → final feet y within 1 cm of the settled start,
// no NaN/Infinity in position or velocity on any frame, grounded at the end.
// Drives the app frame path (ref/02 §Frame order): FrameClock.begin → PlatformMotion.beginFrame →
// CharacterController.stepFrame; each jump is pressed through CharacterController.pressJump on the frame after
// the previous landing. Two frame-delta schedules: constant 1/60 s and seeded random 8–50 ms (TEST-31 range).
// The "hold Space 2 s → exactly one takeoff" half needs real keyboard input: vitexec/smoke-hold-jump.ts.
import { createHarness, round } from '/vitexec/lib/harness.ts'
import { FrameClock } from '/src/game/frame-clock.ts'
import { CharacterController, NO_INPUT } from '/src/controller/character-controller.ts'
import { Vector3 } from 'three'

const JUMPS = 100
const Y_TOL = 0.01
const SETTLE_S = 1

/** mulberry32, fixed seed: the random schedule is the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function run(name: string, nextDt: () => number) {
  const h = createHarness([{ id: 'floor', size: [80, 1, 80], pos: [0, -0.5, 0] }], [0, 0, 0])
  const clock = new FrameClock()
  let takeoffs = 0
  let lands = 0
  /** land events with no takeoff since the previous one (an idle landing that leaves the feet above the floor
   *  is not written back, falls again for a few substeps and lands a second time) — reported, not asserted */
  let relands = 0
  let inJump = false
  let landedThisFrame = false
  const landY: number[] = []
  const rise: number[] = []
  let takeoffY = 0
  let maxY = Number.NEGATIVE_INFINITY
  const ctrl = new CharacterController(h.port, h.motion, {
    onTakeoff: () => {
      takeoffs++
      inJump = true
      takeoffY = h.port.position.y
      maxY = takeoffY
    },
    onLand: () => {
      if (!inJump) {
        relands++
        return
      }
      inJump = false
      lands++
      landedThisFrame = true
      landY.push(h.port.position.y)
      rise.push(maxY - takeoffY)
    },
  })
  ctrl.resetRun(new Vector3(0, 0, 0), 0, false)
  ctrl.onEnterPlaying()
  let frames = 0
  let simS = 0
  let nonFinite = 0
  let firstNonFinite: unknown = null
  const frame = () => {
    const dt = clock.begin(nextDt(), true)
    h.motion.beginFrame(dt)
    ctrl.stepFrame(dt, NO_INPUT, 0, 'toggle')
    frames++
    simS += dt
    const p = h.port.position
    const v = h.port.velocity
    if (![p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)) {
      nonFinite++
      if (firstNonFinite == null) firstNonFinite = { frame: frames, p: p.toArray(), v: v.toArray() }
    }
    if (p.y > maxY) maxY = p.y
  }

  frame() // first delta discarded by FrameClock, as on entering PLAYING
  while (simS < SETTLE_S) frame()
  if (!h.port.isGroundedRaw) throw new Error(`TEST-08 FAIL setup: not grounded after settling (${name})`)
  const y0 = h.port.position.y
  // the spawn settle lands once (teleport leaves vy = 0, so the first substep is airborne); count from here
  takeoffs = 0
  lands = 0
  relands = 0
  landY.length = 0
  rise.length = 0

  ctrl.pressJump()
  while (lands < JUMPS && frames < 100000) {
    landedThisFrame = false
    frame()
    if (landedThisFrame && takeoffs < JUMPS) ctrl.pressJump()
  }
  const endSim = simS + SETTLE_S
  while (simS < endSim) frame()

  const end = h.port.position
  return {
    schedule: name,
    takeoffs,
    lands,
    relands,
    frames,
    simS: round(simS, 3),
    y0: round(y0, 5),
    yEnd: round(end.y, 5),
    dy: round(end.y - y0, 5),
    xzDrift: round(Math.hypot(end.x, end.z), 5),
    groundedEnd: h.port.isGroundedRaw,
    nonFinite,
    firstNonFinite,
    riseMin: round(Math.min(...rise), 4),
    riseMax: round(Math.max(...rise), 4),
    landYMin: round(Math.min(...landY), 4),
    landYMax: round(Math.max(...landY), 4),
  }
}

const r = rng(0x5eed08)
const results = [run('dt=1/60', () => 1 / 60), run('dt=rand[8,50]ms seed=0x5eed08', () => 0.008 + 0.042 * r())]

const failures: string[] = []
for (const x of results) {
  if (x.takeoffs !== JUMPS || x.lands !== JUMPS) failures.push(`${x.schedule}: ${x.takeoffs} takeoffs / ${x.lands} landings (expected ${JUMPS})`)
  if (!(Math.abs(x.dy) <= Y_TOL)) failures.push(`${x.schedule}: final y ${x.yEnd} vs start ${x.y0} (|dy| ${Math.abs(x.dy)} > ${Y_TOL})`)
  if (x.nonFinite > 0) failures.push(`${x.schedule}: ${x.nonFinite} frames with NaN/Infinity, first ${JSON.stringify(x.firstNonFinite)}`)
  if (!x.groundedEnd) failures.push(`${x.schedule}: not grounded at the end`)
}

const numbers = { part: 'physics', jumps: JUMPS, yTol: Y_TOL, results }
if (failures.length > 0) {
  console.log('TEST-08 numbers ' + JSON.stringify(numbers))
  throw new Error('TEST-08 FAIL ' + JSON.stringify(failures))
}
console.log('TEST-08 PASS ' + JSON.stringify(numbers))
