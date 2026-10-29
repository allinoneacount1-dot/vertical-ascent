// TEST-07b (DIRECTIVE §7, physics, G2): idle and walking player vs a 0.5 m bar at 8 m/s → pushed out of its volume
// within 0.2 s; penetration ≤0.05 m during 60 s of contact. Harness: vitexec/lib/bar-harness.ts (dt 1/60, app frame path).
import { barRun, BAR } from '/vitexec/lib/bar-harness.ts'

const runs = [barRun(1 / 60, false, 60), barRun(1 / 60, true, 60)]
// control (validity): upstream behaviour without the vendored near-kinematic write-back must be caught by this measure
const control = barRun(1 / 60, false, 5, 40, true)
const controlDetected = control.maxPenetrationAfterPushS > 0.05 || control.maxPushOutS > 0.2 || control.tunnels > 0
const failures: string[] = []
for (const r of runs) {
  const who = r.walking ? 'walking' : 'idle'
  if (r.contactS < 60) failures.push(`${who}: only ${r.contactS} s of contact`)
  if (r.maxPushOutS > 0.2) failures.push(`${who}: pushed out after ${r.maxPushOutS} s (> 0.2)`)
  if (r.maxPenetrationAfterPushS > 0.05) failures.push(`${who}: penetration ${r.maxPenetrationAfterPushS} m during contact (> 0.05)`)
  if (r.nonFinite > 0) failures.push(`${who}: ${r.nonFinite} non-finite frames`)
}
if (!controlDetected) failures.push('validity: the library-behaviour control run was not detected')
const numbers = { bar: BAR, runs, control, controlDetected }
if (failures.length) {
  console.log('TEST-07b numbers ' + JSON.stringify(numbers))
  throw new Error('TEST-07b FAIL ' + failures.join('; '))
}
console.log('TEST-07b PASS ' + JSON.stringify(numbers))
