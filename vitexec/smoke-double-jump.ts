// D-038 evidence (owner request "double spasi bisa double lompat"), smoke layer: live app, real keyboard input only.
// A single Space press → one ground takeoff, rise ≈ movement.json apex; a double tap → ground + air takeoff and a
// higher rise; the air jump is available again after landing; a triple tap still gives only one air jump.
import { keyboard } from 'vitexec'
import { bootToPlaying, game, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'
import movement from '/level/movement.json'

type Ev = { t: number; type: string; data?: { kind?: string } }
const events = () => (window as unknown as { __game: { events: Ev[] } }).__game.events

logRenderer()
await bootToPlaying()

async function trial(name: string, taps: number, gapMs: number) {
  // wait until standing still on the ground
  for (let i = 0; i < 240 && !game().snapshot().player.groundedRaw; i++) await nextFrame()
  const y0 = game().snapshot().player.pos[1]
  const tStart = performance.now()
  let maxY = y0
  let sampling = true
  const sample = () => {
    if (!sampling) return
    maxY = Math.max(maxY, game().snapshot().player.pos[1])
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
  for (let i = 0; i < taps; i++) {
    await keyboard.press('Space')
    if (i < taps - 1) await sleep(gapMs)
  }
  // wait for landing: grounded again after being airborne, at most 3 s
  const deadline = performance.now() + 3000
  let wasAirborne = false
  for (;;) {
    const s = game().snapshot().player
    if (!s.groundedRaw) wasAirborne = true
    if (wasAirborne && s.groundedRaw) break
    if (performance.now() > deadline) throw new Error(`${name}: no landing within 3 s`)
    await nextFrame()
  }
  await sleep(150)
  sampling = false
  const takeoffs = events().filter((e) => e.type === 'takeoff' && e.t >= tStart).map((e) => e.data?.kind ?? '?')
  return { name, taps, gapMs, takeoffs, riseM: r3(maxY - y0) }
}

const single = await trial('single press', 1, 0)
const double1 = await trial('double tap', 2, 250)
const double2 = await trial('double tap after landing', 2, 250)
const triple = await trial('triple tap', 3, 200)
const apex = movement.apexM
const checks = {
  singleOneGroundTakeoff: single.takeoffs.join(',') === 'ground',
  singleRiseIsApex: Math.abs(single.riseM - apex) <= 0.05,
  doubleGroundThenAir: double1.takeoffs.join(',') === 'ground,air',
  doubleHigher: double1.riseM >= apex + 0.5,
  resetAfterLanding: double2.takeoffs.join(',') === 'ground,air',
  tripleOnlyOneAirJump: triple.takeoffs.join(',') === 'ground,air',
}
const numbers = { apexM: apex, single, double1, double2, triple, checks }
if (Object.values(checks).every(Boolean)) console.log('D-038 double-jump PASS ' + JSON.stringify(numbers))
else {
  console.log('D-038 double-jump FAIL ' + JSON.stringify(numbers))
  throw new Error('D-038 double-jump FAIL ' + JSON.stringify(checks))
}
