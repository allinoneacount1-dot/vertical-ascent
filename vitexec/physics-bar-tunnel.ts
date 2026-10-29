// TEST-34b (DIRECTIVE §7, physics, G2): a 0.5 m bar at 8 m/s vs an idle and a walking capsule at dt 1/60, 1/20 and
// 1/10 (with the D-011 frame split) → 0 pass-through. Harness: vitexec/lib/bar-harness.ts.
import { barRun, BAR } from '/vitexec/lib/bar-harness.ts'

const runs = []
for (const dt of [1 / 60, 1 / 20, 1 / 10]) for (const walking of [false, true]) runs.push(barRun(dt, walking, 15))
const tunnels = runs.reduce((n, r) => n + r.tunnels, 0)
const noContact = runs.filter((r) => r.contactS <= 0).length
const nonFinite = runs.reduce((n, r) => n + r.nonFinite, 0)
const numbers = { bar: BAR, tunnels, runs }
if (tunnels > 0 || noContact > 0 || nonFinite > 0) {
  console.log('TEST-34b numbers ' + JSON.stringify(numbers))
  throw new Error(`TEST-34b FAIL tunnels=${tunnels} runsWithoutContact=${noContact} nonFinite=${nonFinite}`)
}
console.log('TEST-34b PASS ' + JSON.stringify(numbers))
