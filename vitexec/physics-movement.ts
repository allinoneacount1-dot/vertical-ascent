// G1 step 2 (ref/03 §Movement): measure jump apex, airtime and reach with the vendored physics at 240 updates/s.
// Takeoff: grounded on a 1×1 m pillar (top y = 0), then jump(8) with constant input velocity along +X.
// Reach(Δh) = horizontal feet distance from takeoff to the descending crossing of y = Δh (ballistic, no landing pad).
// Prints one "movement {...}" JSON line; scripts/write-movement.mjs turns it into level/movement.json.
import { createHarness, round } from '/vitexec/lib/harness.ts'
import { LOCOMOTION } from '/src/controller/locomotion.ts'

const DT = 1 / 240 // sample finely; the physics substeps at ≤1/240 anyway

function trajectory(speed: number, airJumpAtApex = false) {
  const h = createHarness([{ id: 'pillar', size: [1, 1, 1], pos: [0, -0.5, 0] }], [0, 0.02, 0])
  // settle on the pillar
  for (let i = 0; i < 240 && !h.port.isGroundedRaw; i++) h.port.step(DT)
  if (!h.port.isGroundedRaw) throw new Error('did not settle on the pillar')
  const start = h.port.position
  h.port.jump(LOCOMOTION.jumpSpeed)
  h.port.inputVelocity.set(speed, 0, 0)
  const samples: Array<{ t: number; x: number; y: number }> = [{ t: 0, x: 0, y: 0 }]
  let t = 0
  let airJumped = false
  while (t < 4) {
    h.port.step(DT)
    t += DT
    // double jump (D-038): the second jump fired at the apex of the first gives the maximum height
    if (airJumpAtApex && !airJumped && h.port.velocity.y <= 0) {
      h.port.jump(LOCOMOTION.jumpSpeed)
      airJumped = true
    }
    const p = h.port.position
    samples.push({ t, x: p.x - start.x, y: p.y - start.y })
    if (p.y - start.y < -2.5) break
  }
  return samples
}

function crossingDescending(samples: Array<{ t: number; x: number; y: number }>, dh: number) {
  let apexIndex = 0
  for (let i = 1; i < samples.length; i++) if (samples[i].y > samples[apexIndex].y) apexIndex = i
  for (let i = apexIndex + 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    if (a.y >= dh && b.y < dh) {
      const f = (a.y - dh) / (a.y - b.y)
      return { t: a.t + f * (b.t - a.t), x: a.x + f * (b.x - a.x) }
    }
  }
  throw new Error(`no descending crossing of ${dh}`)
}

const result: Record<string, unknown> = {}
const reach: Record<string, Record<string, number>> = {}
for (const [gait, speed] of [
  ['walk', LOCOMOTION.walkSpeed],
  ['run', LOCOMOTION.runSpeed],
] as const) {
  const s = trajectory(speed)
  const apex = Math.max(...s.map((p) => p.y))
  const flat = crossingDescending(s, 0)
  reach[gait] = {
    flat: round(flat.x, 3),
    up1m: round(crossingDescending(s, 1).x, 3),
    down2m: round(crossingDescending(s, -2).x, 3),
  }
  if (gait === 'run') {
    result.apexM = round(apex, 4)
    result.airtimeS = round(flat.t, 4)
  }
}
const doubleReach: Record<string, Record<string, number>> = {}
let doubleApex = 0
let doubleAirtime = 0
for (const [gait, speed] of [
  ['walk', LOCOMOTION.walkSpeed],
  ['run', LOCOMOTION.runSpeed],
] as const) {
  const s = trajectory(speed, true)
  const flat = crossingDescending(s, 0)
  doubleReach[gait] = {
    flat: round(flat.x, 3),
    up1m: round(crossingDescending(s, 1).x, 3),
    up2m: round(crossingDescending(s, 2).x, 3),
    down2m: round(crossingDescending(s, -2).x, 3),
  }
  if (gait === 'run') {
    doubleApex = round(Math.max(...s.map((p) => p.y)), 4)
    doubleAirtime = round(flat.t, 4)
  }
}
const movement = {
  ups: 240,
  apexM: result.apexM,
  airtimeS: result.airtimeS,
  reach,
  doubleJump: { apexM: doubleApex, airtimeS: doubleAirtime, reach: doubleReach, airJumpAt: 'apex of the first jump' },
  coyoteS: 0.12,
  definition:
    'apex = max feet rise above takeoff; airtime = takeoff to descending crossing of takeoff height; reach = horizontal feet distance to the descending crossing of takeoff + dh, ballistic, constant input velocity (instant air control)',
}
console.log('movement ' + JSON.stringify(movement))
