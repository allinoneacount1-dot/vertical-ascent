// TEST-06, smoke part (DIRECTIVE §7 row 06; ref/06 §Lapisan smoke): live app, real keyboard input only.
//   latency press → leaving the ground ≤70 ms @60 fps: keydown event.timeStamp (capture listener) → the 'takeoff'
//     event the controller logs in the frame the jump fires (same performance.now() clock);
//   landing ≤150 ms: from the 'land' event until __game.anim.clip leaves 'jumpDown' (sampled every rAF);
//   input accepted ≤150 ms after landing: Space pressed as soon as a 'land' event is seen → 'land' to 'takeoff'.
// The measured frame rate is logged; the latency clause applies at ~60 fps.
import { keyboard } from 'vitexec'
import { Recorder, bootToPlaying, game, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Ev = { t: number; type: string; data?: { kind?: string } }
type Full = { events: Ev[]; anim: { clip: string | null } }
const full = () => (window as unknown as { __game: Full }).__game

const MAX_LATENCY_MS = 70
const MAX_LANDING_MS = 150
const MAX_ACCEPT_MS = 150
const TRIALS = 5

logRenderer()
await bootToPlaying()
const rec = new Recorder()
rec.start()

// frame rate over 1 s
const fpsStart = performance.now()
let fpsFrames = 0
while (performance.now() - fpsStart < 1000) {
  await nextFrame()
  fpsFrames++
}
const fps = r3((fpsFrames * 1000) / (performance.now() - fpsStart))

const nextEvent = async (type: string, after: number, timeoutMs: number): Promise<Ev> => {
  const deadline = performance.now() + timeoutMs
  for (;;) {
    const e = full().events.find((x) => x.type === type && x.t > after)
    if (e) return e
    if (performance.now() > deadline) throw new Error(`no '${type}' event within ${timeoutMs} ms`)
    await nextFrame()
  }
}

const waitGroundedIdle = async () => {
  for (let i = 0; i < 300; i++) {
    const s = game().snapshot().player
    if (s.groundedRaw) return
    await nextFrame()
  }
  throw new Error('not grounded within 300 frames')
}

const trials: Array<Record<string, unknown>> = []
for (let i = 0; i < TRIALS; i++) {
  await waitGroundedIdle()
  await sleep(400) // past the 0.30 s re-jump window and any landing clip
  // 1) latency: keydown → takeoff
  const down = await rec.tap('Space')
  const takeoff = await nextEvent('takeoff', down.t - 1, 1000)
  const latency = takeoff.t - down.t
  // 2) landing window: 'land' → clip leaves 'jumpDown'; 3) immediately press again → takeoff
  const land = await nextEvent('land', takeoff.t, 3000)
  const press = keyboard.press('Space') // issued right after the land event is seen
  const takeoff2 = await nextEvent('takeoff', land.t, 1000)
  await press
  // the second jump starts a new arc; the landing clip of the FIRST landing is measured on a separate jump below
  trials.push({ latencyMs: r3(latency), kind: takeoff.data?.kind, acceptAfterLandingMs: r3(takeoff2.t - land.t), kind2: takeoff2.data?.kind })
  await nextEvent('land', takeoff2.t, 3000)
}

// landing clip window, measured on plain jumps (no press after landing)
const landings: number[] = []
for (let i = 0; i < 3; i++) {
  await waitGroundedIdle()
  await sleep(400)
  const down = await rec.tap('Space')
  const takeoff = await nextEvent('takeoff', down.t - 1, 1000)
  const land = await nextEvent('land', takeoff.t, 3000)
  let sawJumpDown = false
  let leftAt = -1
  const deadline = performance.now() + 1500
  while (performance.now() < deadline) {
    const clip = full().anim.clip
    if (clip === 'jumpDown') sawJumpDown = true
    else if (sawJumpDown) {
      leftAt = performance.now()
      break
    }
    await nextFrame()
  }
  if (!sawJumpDown || leftAt < 0) throw new Error(`TEST-06 FAIL landing clip: sawJumpDown=${sawJumpDown} left=${leftAt >= 0}`)
  landings.push(r3(leftAt - land.t))
}
rec.stop()

const latencies = trials.map((t) => t.latencyMs as number)
const accepts = trials.map((t) => t.acceptAfterLandingMs as number)
const checks = {
  latency: Math.max(...latencies) <= MAX_LATENCY_MS,
  landing: Math.max(...landings) <= MAX_LANDING_MS,
  acceptAfterLanding: Math.max(...accepts) <= MAX_ACCEPT_MS,
  groundTakeoffs: trials.every((t) => t.kind === 'ground' && t.kind2 === 'ground'),
}
const numbers = { part: 'smoke', fps, maxLatencyMs: Math.max(...latencies), maxLandingMs: Math.max(...landings), maxAcceptMs: Math.max(...accepts), trials, landings, checks }
if (Object.values(checks).every(Boolean)) console.log('TEST-06 PASS ' + JSON.stringify(numbers))
else {
  console.log('TEST-06 FAIL ' + JSON.stringify(numbers))
  throw new Error('TEST-06 FAIL ' + JSON.stringify(checks))
}
