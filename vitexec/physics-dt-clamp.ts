// TEST-28b (DIRECTIVE §7, D-011): harness — a dt = 5.0 frame advances physics by ≤0.1 s; the first delta after
// resume is discarded. Layer physics (ref/06 §Lapisan): own headless world, never the running app.
// App frame path per frame, exactly as src/controller/GameLoop.tsx: FrameClock.begin(raw, playing) →
// PlatformMotion.beginFrame(dt) → (dt > 0) CharacterController.stepFrame(dt, …). Resume = what Game.afterEnterPlaying
// does: frameClock.armDiscard() + controller.onEnterPlaying().
//
// "Physics advance" is measured four independent ways per frame:
//   simTime   — CharacterController.simTime delta (advances only with port.step)
//   world     — PlatformMotion.worldClock delta
//   xz        — |Δ feet XZ| / walk speed (free fall with forward held: XZ moves only by the constant input velocity)
//   platform  — |Δ mover position| / platform speed (2 m/s constant-velocity segment)
// A control run steps the raw port with step(5.0) (no app clamp) to show the probe detects an advance > 0.1 s.
import { createHarness, round } from '/vitexec/lib/harness.ts'
import type { Harness } from '/vitexec/lib/harness.ts'
import { FrameClock, FRAME_DT_CLAMP } from '/src/game/frame-clock.ts'
import { CharacterController } from '/src/controller/character-controller.ts'
import type { ControlInput } from '/src/controller/character-controller.ts'
import { LOCOMOTION } from '/src/controller/locomotion.ts'
import { linearSpeed } from '/src/level/motion.ts'
import type { Motion } from '/src/level/motion.ts'

const MAX_ADVANCE_S = 0.1
const EPS = 1e-9 // floating-point noise on sums of seconds
const PLATFORM_SPEED = 2
// 2 m/s constant-velocity segment for 9 s starting at worldClock 0 (|d| = 18 m, half period 10 s, dwell 1 s)
const MOTION: Motion = { type: 'linear', points: [[0, 0, 0], [18, 0, 0]], periodS: 20, phaseS: 0, dwellS: 1 }
const forward: ControlInput = { forward: 1, backward: 0, left: 0, right: 0, run: false }

function build(): Harness {
  return createHarness(
    [
      { id: 'floor', size: [80, 1, 80], pos: [0, -0.5, 0] },
      { id: 'mover', size: [3, 0.5, 3], pos: [20, 5, 20], motion: MOTION },
    ],
    [0, 50, 0], // free fall far above the floor during the whole script
  )
}

type State = { sim: number; world: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; mx: number; mz: number }

function snap(h: Harness, ctrl: CharacterController | null): State {
  const p = h.port.position
  const v = h.port.velocity
  const m = h.motion.platforms.get('mover')!.mover.position
  return { sim: ctrl?.simTime ?? 0, world: h.motion.worldClock, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, mx: m.x, mz: m.z }
}

function advance(a: State, b: State) {
  return {
    simTime: b.sim - a.sim,
    world: b.world - a.world,
    xz: Math.hypot(b.x - a.x, b.z - a.z) / LOCOMOTION.walkSpeed,
    platform: Math.hypot(b.mx - a.mx, b.mz - a.mz) / PLATFORM_SPEED,
    dPos: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
    dVel: Math.hypot(b.vx - a.vx, b.vy - a.vy, b.vz - a.vz),
  }
}

const r4 = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v, 6)]))

if (linearSpeed(MOTION) !== PLATFORM_SPEED) throw new Error(`setup: platform speed ${linearSpeed(MOTION)} != ${PLATFORM_SPEED}`)

// ---- app path -------------------------------------------------------------------------------------------
const h = build()
const clock = new FrameClock()
const ctrl = new CharacterController(h.port, h.motion)
const frame = (rawDt: number, playing: boolean, input: ControlInput = forward): number => {
  const dt = clock.begin(rawDt, playing)
  h.motion.beginFrame(dt)
  if (dt > 0) ctrl.stepFrame(dt, input, 0, 'toggle')
  return dt
}
ctrl.onEnterPlaying()
frame(1 / 60, true) // first delta after entering PLAYING (discarded)
for (let i = 0; i < 5; i++) frame(1 / 60, true)

// clause 1: one 5.0 s frame
const before5 = snap(h, ctrl)
const dt5 = frame(5.0, true)
const after5 = snap(h, ctrl)
const adv5 = advance(before5, after5)
const clause1 = {
  rawDt: 5.0,
  clampedDt: dt5,
  clamp: FRAME_DT_CLAMP,
  advanceS: r4({ simTime: adv5.simTime, world: adv5.world, xz: adv5.xz, platform: adv5.platform }),
  fallVyDelta: round(after5.vy - before5.vy, 4),
}
const pass1 =
  dt5 <= MAX_ADVANCE_S &&
  adv5.simTime <= MAX_ADVANCE_S + EPS &&
  adv5.world <= MAX_ADVANCE_S + EPS &&
  adv5.xz <= MAX_ADVANCE_S + 1e-6 &&
  adv5.platform <= MAX_ADVANCE_S + 1e-6 &&
  adv5.simTime > 0 // the frame does run (clamped, not skipped)

// clause 2: pause, then resume; the first frame after resume carries a large raw delta (time spent paused)
for (let i = 0; i < 5; i++) frame(1 / 60, true)
const beforePause = snap(h, ctrl)
for (let i = 0; i < 120; i++) frame(1 / 60, false) // PAUSED: FrameClock.begin(…, false) → 0
const afterPause = snap(h, ctrl)
const resumes: Array<Record<string, unknown>> = []
let pass2 = true
for (const firstRaw of [5.0, 1 / 60]) {
  clock.armDiscard() // Game.afterEnterPlaying
  ctrl.onEnterPlaying()
  const s0 = snap(h, ctrl)
  const d1 = frame(firstRaw, true)
  const s1 = snap(h, ctrl)
  const d2 = frame(1 / 60, true)
  const s2 = snap(h, ctrl)
  const a1 = advance(s0, s1)
  const a2 = advance(s1, s2)
  const discarded = d1 === 0 && a1.simTime === 0 && a1.world === 0 && a1.dPos === 0 && a1.dVel === 0 && a1.platform === 0
  const secondRuns = Math.abs(d2 - 1 / 60) <= EPS && Math.abs(a2.simTime - 1 / 60) <= EPS && Math.abs(a2.world - 1 / 60) <= EPS
  pass2 &&= discarded && secondRuns
  resumes.push({
    firstRawDt: round(firstRaw, 6),
    first: { dt: d1, ...r4({ simTime: a1.simTime, world: a1.world, dPos: a1.dPos, dVel: a1.dVel, platform: a1.platform }) },
    second: { dt: round(d2, 6), ...r4({ simTime: a2.simTime, world: a2.world, xz: a2.xz }) },
    discarded,
    secondRuns,
  })
  // stay "paused" between the two resume episodes
  for (let i = 0; i < 30; i++) frame(1 / 60, false)
}
const pausedAdvance = advance(beforePause, afterPause)

// ---- control: raw port.step(5.0), no app clamp (library caps at 1 s) ------------------------------------------
const hc = build()
hc.port.inputVelocity.set(0, 0, -LOCOMOTION.walkSpeed)
hc.port.step(1 / 60)
const c0 = snap(hc, null)
hc.port.step(5.0)
const c1 = snap(hc, null)
const control = { rawStep5xzAdvanceS: round(advance(c0, c1).xz, 6), fallVyDelta: round(c1.vy - c0.vy, 4) }
if (!(advance(c0, c1).xz > MAX_ADVANCE_S)) throw new Error('TEST-28b FAIL probe invalid: raw step(5.0) shows no advance > 0.1 s ' + JSON.stringify(control))

const results = {
  clause1_dt5: { pass: pass1, ...clause1 },
  clause2_firstDeltaAfterResume: { pass: pass2, resumes },
  info_pausedFrames120: r4({ simTime: pausedAdvance.simTime, world: pausedAdvance.world, dPos: pausedAdvance.dPos }),
  control,
}
if (!(pass1 && pass2)) {
  console.log('TEST-28b FAIL ' + JSON.stringify(results))
  throw new Error('TEST-28b FAIL ' + JSON.stringify(results))
}
console.log('TEST-28b PASS ' + JSON.stringify(results))
