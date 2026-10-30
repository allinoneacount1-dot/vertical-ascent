#!/usr/bin/env node
// Route generator (DIRECTIVE D-022, ref/03 §Data level, ref/06 §Route bot): builds the bot route from the ordered
// platforms tagged 'route'. Never edited by hand.
//   node scripts/build-routes.mjs [level=slice|main]   → vitexec/routes/<level>.json
// Waypoint per route pad: takeoff point on the previous pad (0.45 m inside its edge, or the level's takeoff hint for
// a pad standing above a deck), target point on the pad (0.8 m inside its near edge), whether the jump needs sprint
// (measured reach, level/movement.json), and phase windows for movers and lifts (land during their dwell) and for
// rotating hazards on the jump path (cross while clear). 'main' = level/z1..z4.json in order (D-055).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const levelId = process.argv[2] ?? 'slice'
const ZONES = ['z1', 'z2', 'z3', 'z4']
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const zoneById = new Map()
let level
if (levelId === 'main') {
  const zones = ZONES.map((z) => readJson(`level/${z}.json`))
  for (const z of zones) for (const e of z.platforms) zoneById.set(e.id, z.zone)
  level = { zone: 'main', seed: zones[0].seed, spawn: zones[0].spawn, finish: zones[zones.length - 1].finish, platforms: zones.flatMap((z) => z.platforms) }
} else level = readJson(`level/${levelId}.json`)
const prefabs = new Map(JSON.parse(readFileSync('level/prefabs.json', 'utf8')).map((p) => [p.id, p]))
const movement = JSON.parse(readFileSync('level/movement.json', 'utf8'))

const EDGE_IN = 0.45 // takeoff point inside the source pad edge (capsule radius 0.4 + 5 cm)
const TARGET_IN = 0.8 // landing target inside the destination pad's near edge
const FLOOR_OUT = 0.7 // from the floor: stand this far outside the first pad
const BODY_H = 1.7
const CAPSULE_R = 0.4
const SPRINT_MARGIN = 0.85 // walk is enough when the distance ≤ 0.85 × walk reach

const r3 = (v) => Math.round(v * 1000) / 1000
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const half = (p) => [(p.collider.size[0] * p.scale) / 2, (p.collider.size[2] * p.scale) / 2]

/** Linear motion pose offset at phase u in [0,1) (same law as src/level/motion.ts evaluateMotion). */
function linearOffset(m, u) {
  const P = m.periodS
  const t = u * P
  const halfP = P / 2
  const travel = halfP - m.dwellS
  const a = m.points[0]
  const b = m.points[m.points.length - 1]
  let f
  if (t < travel) f = t / travel
  else if (t < halfP) f = 1
  else if (t < halfP + travel) f = 1 - (t - halfP) / travel
  else f = 0
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/** Top-face footprint of a platform at a pose offset: centre xz, half extents, top y. */
function footprint(entry, offset = [0, 0, 0]) {
  const p = prefabs.get(entry.prefab)
  const [hx, hz] = half(p)
  const top = entry.pos[1] + offset[1] + p.collider.offset[1] * p.scale + (p.collider.size[1] * p.scale) / 2
  return { id: entry.id, cx: entry.pos[0] + offset[0], cz: entry.pos[2] + offset[2], hx, hz, top }
}

/** Point inside footprint f, `inset` from its edges, closest to (x, z). */
function insetClosest(f, x, z, inset) {
  return [clamp(x, f.cx - f.hx + inset, f.cx + f.hx - inset), clamp(z, f.cz - f.hz + inset, f.cz + f.hz - inset)]
}

/** Walk reach for a rise dh, interpolated from movement.json (flat, up1m). */
function walkReach(dh) {
  const w = movement.reach.walk
  if (dh <= 0) return w.flat
  return w.flat + (w.up1m - w.flat) * Math.min(1, dh)
}

/** World (x, z) in a hazard's yawed frame, relative to its hub (its spin axis is local X, the blade plane x = 0). */
function toLocal(h, x, z) {
  const dx = x - h.pos[0]
  const dz = z - h.pos[2]
  const c = Math.cos(h.rotY ?? 0)
  const s = Math.sin(h.rotY ?? 0)
  return [dx * c - dz * s, dx * s + dz * c]
}

/** Clear-phase windows of a rotating hazard for a body column at local lateral cz spanning [y0, y1] (blade = 0.5 m bar). */
function hazardClear(entry, cz, y0, y1) {
  const p = prefabs.get(entry.prefab)
  const len = p.collider.size[1] * p.scale
  const thick = (p.collider.size[2] * p.scale) / 2
  const [ax, ay, az] = entry.motion.axis ?? [0, 1, 0]
  if (!(ax === 1 && ay === 0 && az === 0)) throw new Error(`hazard ${entry.id}: only an X-axis windmill is supported`)
  const N = 720
  const clear = []
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2
    let blocked = false
    for (let s = -len / 2; s <= len / 2 + 1e-9; s += 0.05) {
      const y = entry.pos[1] + s * Math.cos(th)
      const z = s * Math.sin(th)
      if (Math.abs(z - cz) <= CAPSULE_R + thick + 0.1 && y + thick >= y0 && y - thick <= y1) {
        blocked = true
        break
      }
    }
    clear.push(!blocked)
  }
  // contiguous clear runs → [start, end] phase windows (phase = θ / 2π because the hazard's phaseS is applied in u)
  const windows = []
  for (let i = 0; i < N; i++) {
    if (clear[i] && !clear[(i - 1 + N) % N]) {
      let j = i
      while (clear[(j + 1) % N] && j - i < N) j++
      windows.push([i / N, (j + 1) / N])
    }
  }
  return windows
}

const route = level.platforms.filter((p) => p.tag === 'route')
const hazards = level.platforms.filter((p) => p.tag === 'hazard' && p.motion?.type === 'rotate')
const waypoints = []
let from = null // previous route entry (null = spawn floor)
for (const entry of route) {
  const prefab = prefabs.get(entry.prefab)
  if (prefab?.collider == null) throw new Error(`${entry.id}: route pad without collider`)
  const moving = entry.motion?.type === 'linear' ? entry.motion : null
  const fromMoving = from?.motion?.type === 'linear' ? from.motion : null
  // poses: onto a mover = at its start dwell; off a mover = at its end dwell
  const B = footprint(entry, moving ? linearOffset(moving, 0.99) : [0, 0, 0])
  const fromOffset = fromMoving ? linearOffset(fromMoving, 0.45) : [0, 0, 0]
  let takeoff
  let fromTop
  if (from == null) {
    // from the spawn floor: stand FLOOR_OUT outside the pad edge facing the spawn
    const sx = level.spawn[0]
    const sz = level.spawn[2]
    const near = insetClosest(B, sx, sz, 0)
    const dx = sx - near[0]
    const dz = sz - near[1]
    const len = Math.hypot(dx, dz) || 1
    takeoff = [near[0] + (dx / len) * FLOOR_OUT, level.spawn[1], near[1] + (dz / len) * FLOOR_OUT]
    fromTop = level.spawn[1]
  } else {
    const A = footprint(from, fromOffset)
    // a pad above the deck it starts from: the generator's takeoff hint (the nearest deck point would lie under it)
    const t = entry.takeoff && !fromMoving ? [entry.takeoff[0], entry.takeoff[2]] : insetClosest(A, B.cx, B.cz, EDGE_IN)
    takeoff = [t[0], A.top, t[1]]
    fromTop = A.top
  }
  const tgt = insetClosest(B, takeoff[0], takeoff[2], Math.min(TARGET_IN, Math.min(B.hx, B.hz) - 0.2))
  const target = [tgt[0], B.top, tgt[1]]
  const dist = Math.hypot(target[0] - takeoff[0], target[2] - takeoff[2])
  const dh = B.top - fromTop
  const needsJump = dh > 0.2 || from != null
  const needsSprint = dist > SPRINT_MARGIN * walkReach(dh)
  const airtime = movement.airtimeS
  let waitPhase = null
  if (moving) {
    // land during the start dwell: takeoff when u ∈ [(P/2 + travel)/P, 1 − airtime/P]
    const P = moving.periodS
    const travel = P / 2 - moving.dwellS
    waitPhase = { platform: entry.id, window: [r3((P / 2 + travel) / P), r3(1 - airtime / P)], repeatEvery: 1 }
  } else if (fromMoving) {
    // leave during the end dwell: takeoff when u ∈ [travel/P, 1/2 − 0.02] (the target pad is static)
    const P = fromMoving.periodS
    const travel = P / 2 - fromMoving.dwellS
    waitPhase = { platform: from.id, window: [r3(travel / P), r3(0.5 - 0.02)], repeatEvery: 1 }
  }
  // rotating hazards whose blade plane (local x = 0) lies between takeoff and target, within the blade's reach
  for (const h of hazards) {
    const [tx, tz] = toLocal(h, takeoff[0], takeoff[2])
    const [gx, gz] = toLocal(h, target[0], target[2])
    if (tx * gx >= 0) continue
    const f = (0 - tx) / (gx - tx)
    const cz = tz + f * (gz - tz)
    const hp = prefabs.get(h.prefab)
    const reach = (hp.collider.size[1] * hp.scale) / 2 + 1
    const y0 = fromTop
    const y1 = Math.max(fromTop, B.top) + BODY_H + movement.apexM
    if (Math.abs(cz) > reach || y1 < h.pos[1] - reach || y0 > h.pos[1] + reach) continue
    const windows = hazardClear(h, cz, y0, y1)
    const speed = 6 // sprint (needsSprint forced below)
    const delay = Math.abs(tx) / speed / h.motion.periodS
    const crossing = (2 * CAPSULE_R + 0.5) / speed / h.motion.periodS
    const take = windows
      .map(([a, b]) => [a - delay, b - delay - crossing])
      .filter(([a, b]) => b - a > 0.02)
      .map(([a, b]) => [r3(((a % 1) + 1) % 1), r3(((b % 1) + 1) % 1)])
    waitPhase = { platform: h.id, windows: take, repeatEvery: 1, clearWindows: windows.map(([a, b]) => [r3(a), r3(b)]) }
  }
  const forceSprint = waitPhase != null && hazards.some((h) => h.id === waitPhase.platform)
  waypoints.push({
    id: entry.id,
    zone: zoneById.get(entry.id) ?? level.zone,
    pos: [r3(B.cx), r3(B.top), r3(B.cz)],
    half: [r3(B.hx), r3(B.hz)],
    padRadius: r3(Math.min(B.hx, B.hz)),
    takeoff: takeoff.map(r3),
    target: target.map(r3),
    distM: r3(dist),
    riseM: r3(dh),
    needsJump,
    needsSprint: needsSprint || forceSprint,
    needsDoubleJump: entry.needsDoubleJump === true,
    moving: moving ? { platform: entry.id } : null,
    waitPhase,
    precision: entry.precision,
  })
  from = entry
}

const generatedFrom = levelId === 'main' ? ZONES.map((z) => `level/${z}.json`).join(' + ') : `level/${levelId}.json`
const out = { level: levelId, generatedFrom, generatedBy: 'scripts/build-routes.mjs', spawn: level.spawn, finish: level.finish, waypoints }
mkdirSync('vitexec/routes', { recursive: true })
writeFileSync(`vitexec/routes/${levelId}.json`, JSON.stringify(out, null, 2) + '\n')
console.log(`vitexec/routes/${levelId}.json: ${waypoints.length} waypoints`)
if (process.env.ROUTE_VERBOSE || levelId !== 'main') for (const w of waypoints) console.log(`  ${w.id} dist ${w.distM} rise ${w.riseM} sprint ${w.needsSprint} ${w.waitPhase ? 'wait ' + JSON.stringify(w.waitPhase.window ?? w.waitPhase.windows) : ''}`)
