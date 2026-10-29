// G1 step 7 probe (DIRECTIVE §5 G1, D-012): "probe first, expect failure without carry".
// An idle player on a 2 m/s platform and on a 1 m/s lift, (a) raw physics + platform motion only (library behaviour),
// (b) the game's controller with the carry probe. Drift = player displacement minus platform displacement.
import { Vector3 } from 'three'
import { createHarness, round } from '/vitexec/lib/harness.ts'
import { FrameClock } from '/src/game/frame-clock.ts'
import { CharacterController, NO_INPUT } from '/src/controller/character-controller.ts'

const DT = 1 / 60
const FLOOR = { id: 'floor', size: [60, 1, 60] as [number, number, number], pos: [0, -10.5, 0] as [number, number, number] }

function scenario(kind: 'slide' | 'lift', withCarry: boolean) {
  const motion =
    kind === 'slide'
      ? { type: 'linear' as const, points: [[0, 0, 0], [24, 0, 0]] as [number, number, number][], periodS: 26, phaseS: 0, dwellS: 1 }
      : { type: 'linear' as const, points: [[0, 0, 0], [0, 8, 0]] as [number, number, number][], periodS: 18, phaseS: 0, dwellS: 1 }
  const h = createHarness([FLOOR, { id: 'p', size: [3, 0.5, 3], pos: [0, -0.25, 0], motion }], [0, 0.05, 0])
  const p = h.motion.platforms.get('p')!
  const clock = new FrameClock()
  const ctrl = new CharacterController(h.port, h.motion)
  clock.begin(DT, true) // the first delta after entering PLAYING is discarded
  // settle
  for (let i = 0; i < 30; i++) h.port.step(DT)
  const start = h.port.position
  const startPlat = new Vector3().setFromMatrixPosition(p.cur)
  let grounded = 0
  const frames = 180 // 3 s of constant velocity
  for (let i = 0; i < frames; i++) {
    if (withCarry) {
      const dt = clock.begin(DT, true)
      h.motion.beginFrame(dt)
      ctrl.stepFrame(dt, NO_INPUT, 0, 'toggle')
    } else {
      h.motion.advance(DT)
      h.port.step(DT)
    }
    if (h.port.isGroundedRaw) grounded++
  }
  const end = h.port.position
  const endPlat = new Vector3().setFromMatrixPosition(p.cur)
  const drift = end.clone().sub(start).sub(endPlat.clone().sub(startPlat))
  return { kind, withCarry, drift: round(drift.length(), 3), platformMoved: round(endPlat.distanceTo(startPlat), 3), groundedPct: round((100 * grounded) / frames, 1), feetY: round(end.y, 3), platTopY: round(endPlat.y + 0, 3) }
}

const rows = [scenario('slide', false), scenario('slide', true), scenario('lift', false), scenario('lift', true)]
console.log('carry-probe ' + JSON.stringify(rows))
