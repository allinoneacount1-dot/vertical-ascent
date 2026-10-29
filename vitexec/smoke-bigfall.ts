// TEST-12a, smoke part (DIRECTIVE §7 row 12a, G2): a 200 m fall in the running slice (setup by __debugTeleport,
// allowlist "debug-setup" for 12a) → __game.player.bigFall is set after vy < -12 m/s for more than 0.6 s and the
// 'bigFall' event is logged; the landing is a big fall and run.bigFalls counts it.
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Ev = { t: number; type: string; data?: Record<string, unknown> }
type Full = { state: string; player: { pos: number[]; vel: number[]; groundedRaw: boolean; bigFall: boolean }; run: { bigFalls: number; metersLost: number }; events: Ev[] }
type G = { snapshot(): Full; __debugTeleport(p: [number, number, number]): void }
const g = () => (window as unknown as { __game: G }).__game

logRenderer()
await bootToPlaying()
await sleep(300)
console.log('debug-setup: __debugTeleport([0, 200, 15])')
const t0 = performance.now()
g().__debugTeleport([0, 200, 15])
let below12At: number | null = null
let flagAt: number | null = null
let landed = false
const deadline = performance.now() + 15000
while (!landed && performance.now() < deadline) {
  const s = g().snapshot()
  if (below12At == null && s.player.vel[1] < -12) below12At = performance.now()
  if (flagAt == null && s.player.bigFall) flagAt = performance.now()
  if (s.events.some((e) => e.type === 'land' && e.t > t0 && (e.data?.bigFall as boolean))) landed = true
  await nextFrame()
}
await sleep(300)
const s = g().snapshot()
const bigFallEvents = s.events.filter((e) => e.type === 'bigFall' && e.t > t0)
const landEvents = s.events.filter((e) => e.type === 'land' && e.t > t0)
const numbers = {
  observedFlagDelayAfterVy12Ms: below12At != null && flagAt != null ? r3(flagAt - below12At) : null,
  bigFallEvents: bigFallEvents.length,
  landBigFall: landEvents.map((e) => e.data?.bigFall),
  fallMeters: landEvents.map((e) => e.data?.fallMeters),
  runBigFalls: s.run.bigFalls,
  metersLost: r3(s.run.metersLost),
  state: s.state,
}
const failures: string[] = []
if (flagAt == null) failures.push('bigFall flag never observed')
// frame-sampled: the flag can only be observed at ≥ (0.6 s − one frame) after vy < -12 was first observed
if (numbers.observedFlagDelayAfterVy12Ms != null && numbers.observedFlagDelayAfterVy12Ms < 600 - 34) failures.push(`bigFall observed only ${numbers.observedFlagDelayAfterVy12Ms} ms after vy < -12`)
if (bigFallEvents.length !== 1) failures.push(`${bigFallEvents.length} bigFall events (expected 1)`)
if (!landed) failures.push('no landing marked bigFall')
if (s.run.bigFalls !== 1) failures.push(`run.bigFalls ${s.run.bigFalls} (expected 1)`)
if (failures.length) {
  console.log('TEST-12a numbers ' + JSON.stringify(numbers))
  throw new Error('TEST-12a FAIL ' + failures.join('; '))
}
console.log('TEST-12a PASS ' + JSON.stringify({ part: 'smoke', ...numbers }))
