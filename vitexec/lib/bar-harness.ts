// Moving-bar harness for TEST-07b and TEST-34b (physics layer, headless, app frame path with frame splitting D-011).
// A 0.5 × 0.5 × 6 m bar at chest height sweeps ±10 m along X at 8 m/s (1.25 s travel each way after a 0.5 s dwell)
// over a large floor. Before every forward pass the player is placed at x = 0 (harness setup, not app input) either
// idle or walking toward the bar (−X, input forward with camera yaw π/2 → −X).
import { Vector3 } from 'three'
import { createHarness, round } from '/vitexec/lib/harness.ts'
import { FrameClock } from '/src/game/frame-clock.ts'
import { CharacterController } from '/src/controller/character-controller.ts'
import type { ControlInput } from '/src/controller/character-controller.ts'
import { evaluateMotion, linearSpeed } from '/src/level/motion.ts'
import type { Motion, Pose } from '/src/level/motion.ts'

export const BAR = { size: [0.5, 0.5, 6] as [number, number, number], y: 0.9, speed: 8 }
const TRAVEL = 20
const DWELL = 0.5
const HALF = TRAVEL / BAR.speed + DWELL
export const BAR_MOTION: Motion = { type: 'linear', points: [[-10, 0, 0], [10, 0, 0]], periodS: 2 * HALF, phaseS: 0, dwellS: DWELL }

const R = 0.4
const HEIGHT = 1.7

/** Distance from the capsule axis segment (feet + r … feet + h − r) to the bar box centred at (bx, BAR.y, 0). */
function segmentBoxDistance(feet: Vector3, bx: number): number {
  const hx = BAR.size[0] / 2
  const hy = BAR.size[1] / 2
  const hz = BAR.size[2] / 2
  let best = Infinity
  for (let i = 0; i <= 40; i++) {
    const y = feet.y + R + ((HEIGHT - 2 * R) * i) / 40
    const dx = Math.max(0, Math.abs(feet.x - bx) - hx)
    const dy = Math.max(0, Math.abs(y - BAR.y) - hy)
    const dz = Math.max(0, Math.abs(feet.z) - hz)
    best = Math.min(best, Math.hypot(dx, dy, dz))
  }
  return best
}

export type BarRun = {
  dt: number
  walking: boolean
  passes: number
  contactS: number
  maxPenetrationM: number
  maxPenetrationAfterPushS: number
  maxPushOutS: number
  tunnels: number
  nonFinite: number
}

/** Runs passes until `contactTarget` seconds of contact (or maxPasses) at a constant frame dt. */
export function barRun(dt: number, walking: boolean, contactTarget: number, maxPasses = 400, libraryControl = false): BarRun {
  if (Math.abs(linearSpeed(BAR_MOTION) - BAR.speed) > 1e-9) throw new Error('bar setup speed mismatch')
  const h = createHarness(
    [
      { id: 'floor', size: [80, 1, 80], pos: [0, -0.5, 0] },
      { id: 'bar', size: BAR.size, pos: [0, BAR.y, 0], motion: BAR_MOTION },
    ],
    [0, 0, 0],
    {},
    libraryControl ? () => false : undefined,
  )
  const clock = new FrameClock()
  const ctrl = new CharacterController(h.port, h.motion)
  const input: ControlInput = walking ? { forward: 1, backward: 0, left: 0, right: 0, run: false } : { forward: 0, backward: 0, left: 0, right: 0, run: false }
  const yaw = Math.PI / 2 // forward = −X, toward the oncoming bar
  const pose: Pose = { offset: new Vector3(), yaw: 0 }
  const barX = () => {
    evaluateMotion(BAR_MOTION, h.motion.worldClock, pose)
    return pose.offset.x
  }
  ctrl.onEnterPlaying()
  clock.begin(dt, true) // first delta discarded
  const out: BarRun = { dt, walking, passes: 0, contactS: 0, maxPenetrationM: 0, maxPenetrationAfterPushS: 0, maxPushOutS: 0, tunnels: 0, nonFinite: 0 }
  while (out.contactS < contactTarget && out.passes < maxPasses) {
    // wait for the start dwell (bar at x = −10), then place the player at x = 0
    let guard = 0
    while (!(barX() <= -9.999) && guard++ < 100000) {
      const d = clock.begin(dt, true)
      h.motion.beginFrame(d)
      ctrl.stepFrame(d, { forward: 0, backward: 0, left: 0, right: 0, run: false }, yaw, 'hold')
    }
    h.port.teleport(new Vector3(0, 0, 0))
    ctrl.onEnterPlaying()
    out.passes++
    let contactStart: number | null = null
    let pushedOut = true
    // one forward pass: until the bar reaches +10
    let t = 0
    while (t < TRAVEL / BAR.speed + 0.2) {
      const d = clock.begin(dt, true)
      h.motion.beginFrame(d)
      ctrl.stepFrame(d, input, yaw, 'hold')
      t += d
      const feet = h.port.position
      const v = h.port.velocity
      if (![feet.x, feet.y, feet.z, v.x, v.y, v.z].every(Number.isFinite)) out.nonFinite++
      const bx = barX()
      const dist = segmentBoxDistance(feet, bx)
      const pen = Math.max(0, R - dist)
      // tunnel: the player ends up behind the moving bar (bar went through the capsule)
      if (feet.x < bx - (BAR.size[0] / 2 + R - 0.05) && Math.abs(feet.z) < BAR.size[2] / 2) out.tunnels++
      // contact = touching or overlapping (after depenetration the capsule rests exactly on the bar face)
      if (dist <= R + 0.02) {
        out.contactS += d
        if (contactStart == null) {
          contactStart = t
          pushedOut = false
        }
        out.maxPenetrationM = Math.max(out.maxPenetrationM, pen)
        if (!pushedOut && pen <= 0.05) {
          pushedOut = true
          out.maxPushOutS = Math.max(out.maxPushOutS, t - contactStart)
        }
        if (pushedOut || t - contactStart > 0.2) out.maxPenetrationAfterPushS = Math.max(out.maxPenetrationAfterPushS, pen)
      } else {
        if (contactStart != null && !pushedOut) {
          pushedOut = true
          out.maxPushOutS = Math.max(out.maxPushOutS, t - contactStart)
        }
        contactStart = null
      }
    }
  }
  return {
    ...out,
    contactS: round(out.contactS, 3),
    maxPenetrationM: round(out.maxPenetrationM, 4),
    maxPenetrationAfterPushS: round(out.maxPenetrationAfterPushS, 4),
    maxPushOutS: round(out.maxPushOutS, 4),
  }
}
