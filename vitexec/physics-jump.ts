// TEST-06, physics part (DIRECTIVE §7 row 06; ref/06 §Lapisan, physics row). Headless harness, no rendering.
//   (a) Apex = level/movement.json apexM ± 0.02 m (standing, walk and run jumps; rise of the feet above the takeoff point).
//   (b) Jump pressed 0.10 s after leaving a ledge → a takeoff happens and its rise ≥ 0.98 × apexM.
//   (c) Jump pressed 0.14 s after leaving a ledge → no takeoff.
// Drives the app frame path (ref/02 §Frame order): FrameClock.begin → PlatformMotion.beginFrame →
// CharacterController.stepFrame, with jumps through CharacterController.pressJump (buffer stamped with sim time).
// "Leaving the edge" = port.secondsSinceGrounded (time since the last grounded substep). Frames run at a constant dt;
// the frame that crosses the target is shortened so the press lands exactly on 0.10 s / 0.14 s.
import { createHarness, round } from '/vitexec/lib/harness.ts'
import type { HarnessBlock } from '/vitexec/lib/harness.ts'
import { FrameClock } from '/src/game/frame-clock.ts'
import { CharacterController, NO_INPUT } from '/src/controller/character-controller.ts'
import type { ControlInput } from '/src/controller/character-controller.ts'
import type { SprintMode } from '/src/controller/locomotion.ts'
import { Vector3 } from 'three'
import movement from '/level/movement.json'

const APEX_M: number = movement.apexM
const APEX_TOL = 0.02
const COYOTE_RATIO = 0.98
const FPS_LIST = [60, 144]

type Gait = 'stand' | 'walk' | 'run'
const GAIT: Record<Gait, { input: ControlInput; mode: SprintMode }> = {
  stand: { input: NO_INPUT, mode: 'hold' },
  // +X with camera yaw 0 (computeInputVelocity: right → +X)
  walk: { input: { forward: 0, backward: 0, left: 0, right: 1, run: false }, mode: 'hold' },
  run: { input: { forward: 0, backward: 0, left: 0, right: 1, run: false }, mode: 'always' },
}

function rig(blocks: HarnessBlock[]) {
  const h = createHarness(blocks, [0, 0, 0])
  const clock = new FrameClock()
  const takeoffs: Array<{ simTime: number; y: number }> = []
  const lands: Array<{ simTime: number; y: number }> = []
  const ctrl = new CharacterController(h.port, h.motion, {
    onTakeoff: (simTime) => takeoffs.push({ simTime, y: h.port.position.y }),
    onLand: (info) => lands.push({ simTime: info.simTime, y: h.port.position.y }),
  })
  // as the app: new run, then the transition into PLAYING; FrameClock discards the first delta
  ctrl.resetRun(new Vector3(0, 0, 0), 0, false)
  ctrl.onEnterPlaying()
  let maxY = Number.NEGATIVE_INFINITY
  let nonFinite = 0
  const frame = (rawDt: number, gait: Gait) => {
    const dt = clock.begin(rawDt, true)
    h.motion.beginFrame(dt)
    ctrl.stepFrame(dt, GAIT[gait].input, 0, GAIT[gait].mode)
    const p = h.port.position
    const v = h.port.velocity
    if (![p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)) nonFinite++
    if (p.y > maxY) maxY = p.y
  }
  const resetMax = () => {
    maxY = Number.NEGATIVE_INFINITY
  }
  return { h, ctrl, frame, takeoffs, lands, getMaxY: () => maxY, resetMax, nonFinite: () => nonFinite }
}

const FLOOR: HarnessBlock = { id: 'floor', size: [80, 1, 80], pos: [0, -0.5, 0] }

/** (a) one jump from the flat floor; rise = highest feet y while airborne minus feet y at takeoff. */
function apexCase(fps: number, gait: Gait) {
  const r = rig([FLOOR])
  const dt = 1 / fps
  r.frame(dt, 'stand') // discarded first delta
  for (let i = 0; i < fps / 2; i++) r.frame(dt, 'stand')
  if (!r.h.port.isGroundedRaw) throw new Error(`TEST-06 FAIL setup: not grounded on the floor (${fps} fps ${gait})`)
  // reach the gait's speed on the ground first (walk/run), then jump
  for (let i = 0; i < fps / 4; i++) r.frame(dt, gait)
  r.ctrl.pressJump()
  r.resetMax()
  const startLands = r.lands.length
  let frames = 0
  while (r.lands.length === startLands && frames < fps * 3) {
    r.frame(dt, gait)
    frames++
  }
  if (r.takeoffs.length !== 1) throw new Error(`TEST-06 FAIL setup: expected 1 takeoff, got ${r.takeoffs.length} (${fps} fps ${gait})`)
  if (r.lands.length === startLands) throw new Error(`TEST-06 FAIL setup: no landing within 3 s (${fps} fps ${gait})`)
  const t = r.takeoffs[0]
  const land = r.lands[r.lands.length - 1]
  return {
    fps,
    gait,
    takeoffY: round(t.y, 4),
    rise: round(r.getMaxY() - t.y, 4),
    airtime: round(land.simTime - t.simTime, 4),
    landY: round(land.y, 4),
    nonFinite: r.nonFinite(),
  }
}

/**
 * (b)/(c) walk or run off a ledge (top y = 0, edge at x = 2) over a lower floor (top y = -6) and press jump when
 * secondsSinceGrounded reaches delayS. Counts takeoffs from the press until 0.3 s after landing on the lower floor.
 */
function ledgeCase(fps: number, gait: Gait, delayS: number) {
  const r = rig([
    { id: 'ledge', size: [4, 1, 4], pos: [0, -0.5, 0] },
    { id: 'lower', size: [60, 1, 60], pos: [0, -6.5, 0] },
  ])
  const dt = 1 / fps
  r.frame(dt, 'stand') // discarded first delta
  for (let i = 0; i < fps / 2; i++) r.frame(dt, 'stand')
  if (!r.h.port.isGroundedRaw) throw new Error(`TEST-06 FAIL setup: not grounded on the ledge (${fps} fps ${gait})`)
  const takeoffsBefore = r.takeoffs.length
  let pressed = false
  let pressSince = Number.NaN
  let pressX = Number.NaN
  let pressY = Number.NaN
  let frames = 0
  let left = false
  while (!pressed && frames < fps * 5) {
    const since = r.h.port.secondsSinceGrounded
    const grounded = r.h.port.isGroundedRaw
    if (!grounded && since > 0) left = true
    if (left && !grounded && since >= delayS - 1e-9) {
      r.ctrl.pressJump()
      pressed = true
      pressSince = since
      pressX = r.h.port.position.x
      pressY = r.h.port.position.y
      break
    }
    let stepDt = dt
    if (left && !grounded) {
      const remaining = delayS - since
      if (remaining > 1e-7 && remaining < dt) stepDt = remaining
    }
    r.frame(stepDt, gait)
    frames++
  }
  if (!pressed) throw new Error(`TEST-06 FAIL setup: never left the ledge (${fps} fps ${gait} ${delayS} s)`)
  if (r.takeoffs.length !== takeoffsBefore) throw new Error(`TEST-06 FAIL setup: takeoff before the press (${fps} fps ${gait})`)
  r.resetMax()
  const landsBefore = r.lands.length
  let after = 0
  let landedAt = -1
  while (frames < fps * 10) {
    r.frame(dt, gait)
    frames++
    after++
    if (landedAt < 0 && r.lands.length > landsBefore && r.lands[r.lands.length - 1].y < -5) landedAt = after
    if (landedAt >= 0 && after - landedAt >= Math.ceil(0.3 * fps)) break
  }
  if (landedAt < 0) throw new Error(`TEST-06 FAIL setup: no landing on the lower floor (${fps} fps ${gait} ${delayS} s)`)
  const tk = r.takeoffs.slice(takeoffsBefore)
  return {
    fps,
    gait,
    delayS,
    secondsSinceGroundedAtPress: round(pressSince, 4),
    pressX: round(pressX, 3),
    pressY: round(pressY, 4),
    takeoffs: tk.length,
    takeoffY: tk.length > 0 ? round(tk[0].y, 4) : null,
    rise: tk.length > 0 ? round(r.getMaxY() - tk[0].y, 4) : null,
    nonFinite: r.nonFinite(),
  }
}

const apex = []
for (const fps of FPS_LIST) for (const gait of ['stand', 'walk', 'run'] as const) apex.push(apexCase(fps, gait))
const coyote = []
for (const fps of FPS_LIST) for (const gait of ['walk', 'run'] as const) for (const d of [0.1, 0.14]) coyote.push(ledgeCase(fps, gait, d))

const failures: string[] = []
for (const a of apex) {
  if (!(Math.abs(a.rise - APEX_M) <= APEX_TOL)) failures.push(`apex ${a.fps}fps ${a.gait}: rise ${a.rise} vs ${APEX_M} ± ${APEX_TOL}`)
  if (a.nonFinite > 0) failures.push(`apex ${a.fps}fps ${a.gait}: ${a.nonFinite} non-finite frames`)
}
for (const c of coyote) {
  if (c.delayS === 0.1) {
    if (c.takeoffs !== 1) failures.push(`coyote 0.10 ${c.fps}fps ${c.gait}: ${c.takeoffs} takeoffs (expected 1)`)
    else if (!(c.rise != null && c.rise >= COYOTE_RATIO * APEX_M)) failures.push(`coyote 0.10 ${c.fps}fps ${c.gait}: rise ${c.rise} < ${COYOTE_RATIO} × ${APEX_M}`)
  } else if (c.takeoffs !== 0) failures.push(`coyote 0.14 ${c.fps}fps ${c.gait}: ${c.takeoffs} takeoffs (expected 0)`)
  if (c.nonFinite > 0) failures.push(`coyote ${c.delayS} ${c.fps}fps ${c.gait}: ${c.nonFinite} non-finite frames`)
}

const numbers = {
  part: 'physics',
  apexM: APEX_M,
  apexTol: APEX_TOL,
  coyoteMinRise: round(COYOTE_RATIO * APEX_M, 4),
  maxApexError: round(Math.max(...apex.map((a) => Math.abs(a.rise - APEX_M))), 4),
  apex,
  coyote,
}
if (failures.length > 0) {
  console.log('TEST-06 numbers ' + JSON.stringify(numbers))
  throw new Error('TEST-06 FAIL ' + JSON.stringify(failures))
}
console.log('TEST-06 PASS ' + JSON.stringify(numbers))
