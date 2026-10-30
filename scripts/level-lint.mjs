#!/usr/bin/env node
// Level lint (TEST-36, ref/03 §Lint): every static rule of ref/03 over the 500 m world (level/z1..z4.json + prefabs.json,
// D-055), one result per rule in evidence/G3/TEST-36-lint.json. Exit 1 when a rule fails or a route pair is
// ROUTE-UNPROVEN (passed the formulas but neither the sim test nor a bot run crossed it).
//   node scripts/level-lint.mjs [--sim evidence/G3/TEST-36-sim.json] [--bot <milestones.json> ...] [--out <json>]
// Shared code: src/level/schema.ts (validateLevel, platformAabb, floorAabb, topArea) and src/level/motion.ts
// (evaluateMotion), imported as TypeScript by Node 24 type stripping.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Vector3 } from 'three'
import { floorAabb, platformAabb, topArea, validateLevel } from '../src/level/schema.ts'
import { evaluateMotion } from '../src/level/motion.ts'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const botFiles = args.flatMap((a, i) => (args[i - 1] === '--bot' ? [a] : []))
const simFile = opt('--sim', 'evidence/G3/TEST-36-sim.json')
const outFile = opt('--out', 'evidence/G3/TEST-36-lint.json')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const ZONES = ['z1', 'z2', 'z3', 'z4']
const zoneFiles = ZONES.map((z) => readJson(`level/${z}.json`))
const prefabList = readJson('level/prefabs.json')
const prefabs = new Map(prefabList.map((p) => [p.id, p]))
const movement = readJson('level/movement.json')
const beats = new Map(readJson('level/beats.json').beats.map((b) => [b.zone, b]))
const route = readJson('vitexec/routes/main.json')
const level = { zone: 'main', seed: zoneFiles[0].seed, spawn: zoneFiles[0].spawn, finish: zoneFiles[3].finish, platforms: zoneFiles.flatMap((z) => z.platforms) }
const zoneOf = new Map(zoneFiles.flatMap((z) => z.platforms.map((e) => [e.id, z.zone])))
const byId = new Map(level.platforms.map((e) => [e.id, e]))

// ref/03 §Aturan desain
const BUDGET = { z1: 10, z2: 30, z3: 80, z4: 120 }
const EXCEPTIONS = { z1: 0, z2: 0, z3: 3, z4: 3 }
const MARGIN = { z1: 0.8, z2: 0.88, z3: 0.93, z4: 0.95 }
const PRECISION_MARGIN = 0.95
const RISE_RATIO = 0.85
const MISS_M = 0.5
const LANDING_WINDOW_S = 0.6
const PHASE_STEP_S = 0.05
const MIN_PERIOD_S = 3
const MIN_DWELL_S = 0.5
const SWEEP_V = 2.0
const SWEEP_H = 1.1
const SWEEP_MAX_SPEED = 8
const CUE_EVERY_M = 15
const MAX_TRIS = 300_000
const TRIS_PER_BOX = 12
const REST_MIN = 3
const REST_HAZARD_M = 3
/** A sideways miss is modelled only for landing pads whose side edge is this close to the landing point. */
const LATERAL_EDGE_MAX_M = 2
/** A non-walkable collider standing this high over the walking surface blocks a walk-off (railing 1.1 m). */
const RAIL_BLOCK_M = 0.9

const r3 = (v) => Math.round(v * 1000) / 1000
const results = []
const rule = (id, ok, details) => {
  results.push({ rule: id, ok, ...details })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${details.summary ? ' — ' + details.summary : ''}`)
}

// ballistic reach from the measured apex and airtime (same model as tools/level-gen.mjs; matches movement.json)
const V0 = (4 * movement.apexM) / movement.airtimeS
const G = (2 * V0) / movement.airtimeS
const RUN = 6
const fallTime = (dh) => {
  const disc = V0 * V0 - 2 * G * dh
  return disc < 0 ? null : (V0 + Math.sqrt(disc)) / G
}
const reachRun = (dh) => (fallTime(dh) ?? 0) * RUN
const reachDj = (dh) => {
  const disc = V0 * V0 - 2 * G * (dh - movement.apexM)
  return disc < 0 ? 0 : RUN * (V0 / G + (V0 + Math.sqrt(disc)) / G)
}
const reachChecks = { runUp1m: [r3(reachRun(1)), movement.reach.run.up1m], runDown2m: [r3(reachRun(-2)), movement.reach.run.down2m], djFlat: [r3(reachDj(0)), movement.doubleJump.reach.run.flat] }

const pose = { offset: new Vector3(), yaw: 0 }
/** Top footprint of a collider entry at time t (null = base pose): AABB min/max with top y. */
function aabbAt(e, t = null) {
  const p = prefabs.get(e.prefab)
  const a = platformAabb(e, p)
  if (a == null) return null
  if (t == null || e.motion == null || e.motion.type === 'rotate') return a
  evaluateMotion(e.motion, t, pose)
  const o = pose.offset
  return { min: [a.min[0] + o.x, a.min[1] + o.y, a.min[2] + o.z], max: [a.max[0] + o.x, a.max[1] + o.y, a.max[2] + o.z] }
}
const phaseTime = (e, u) => u * e.motion.periodS - e.motion.phaseS
const contains = (a, x, z, pad = 0) => x >= a.min[0] - pad && x <= a.max[0] + pad && z >= a.min[2] - pad && z <= a.max[2] + pad
const walkable = level.platforms.filter((e) => prefabs.get(e.prefab)?.walkable && prefabs.get(e.prefab)?.collider)

// ---- 1. schema, prefabs, walkable colliders, tag coverage -------------------------------------------------------------
{
  const errors = validateLevel(level, prefabList)
  const untagged = level.platforms.filter((e) => e.tag == null)
  const surfaces = level.platforms.filter((e) => prefabs.get(e.prefab)?.walkable && topArea(prefabs.get(e.prefab)) > 1)
  rule('schema-prefabs-tags', errors.length === 0 && untagged.length === 0, {
    summary: `${level.platforms.length} entries, ${surfaces.length} walkable surfaces > 1 m², ${errors.length} schema errors`,
    errors: errors.slice(0, 50),
  })
}

// ---- 2. route pairs: rise, margin vs measured reach -------------------------------------------------------------------
const wps = route.waypoints
const pairs = []
for (let i = 1; i < wps.length; i++) {
  const w = wps[i]
  const zone = w.zone
  const dj = w.needsDoubleJump === true
  const reach = dj ? reachDj(w.riseM) : reachRun(w.riseM)
  const ratio = reach > 0 ? w.distM / reach : Infinity
  const maxRise = RISE_RATIO * (dj ? movement.doubleJump.apexM : movement.apexM)
  const limit = byId.get(w.id)?.precision ? Math.max(MARGIN[zone], PRECISION_MARGIN) : MARGIN[zone]
  pairs.push({ from: wps[i - 1].id, to: w.id, zone, dist: w.distM, rise: w.riseM, dj, ratio: r3(ratio), limit, riseOk: w.riseM <= maxRise + 1e-6, marginOk: ratio <= limit + 1e-6 })
}
{
  const bad = pairs.filter((p) => !p.riseOk || !p.marginOk)
  const worst = ZONES.map((z) => {
    const zp = pairs.filter((p) => p.zone === z)
    return { zone: z, pairs: zp.length, maxRatio: Math.max(...zp.map((p) => p.ratio)), maxRise: Math.max(...zp.map((p) => p.rise)) }
  })
  rule('jump-margin-and-rise', bad.length === 0, { summary: `${pairs.length} pairs, ${bad.length} over the zone margin or 0.85 apex`, reachModelVsMeasured: reachChecks, perZone: worst, failures: bad.slice(0, 50) })
}

// ---- 3. fall cost per zone, landing surfaces lead back to the route ----------------------------------------------------
/** Highest walkable surface top at (x, z) not above `below` (+5 cm), excluding `skip`; null = nothing (kill plane). */
function landingAt(x, z, below, skip) {
  let best = null
  for (const e of walkable) {
    if (e.id === skip) continue
    const a = aabbAt(e)
    if (!contains(a, x, z)) continue
    const top = a.max[1]
    if (top > below + 0.05) continue
    if (best == null || top > best.top) best = { id: e.id, tag: e.tag, top }
  }
  return best
}
const routeIds = new Set(wps.map((w) => w.id))
const blockers = level.platforms.filter((e) => e.motion == null && prefabs.get(e.prefab)?.collider && !prefabs.get(e.prefab).walkable).map((e) => platformAabb(e, prefabs.get(e.prefab)))
/** Walking from the inside of footprint a to (x, z): does a railing-like collider stand in the way? */
function railingBetween(a, x, z) {
  const cx = Math.min(Math.max(x, a.min[0]), a.max[0])
  const cz = Math.min(Math.max(z, a.min[2]), a.max[2])
  const top = a.max[1]
  for (let f = -0.6; f <= 1.0001; f += 0.1) {
    const px = cx + (x - cx) * Math.max(0, f) - (f < 0 ? Math.sign(x - cx) * -f : 0)
    const pz = cz + (z - cz) * Math.max(0, f) - (f < 0 ? Math.sign(z - cz) * -f : 0)
    if (blockers.some((r) => contains(r, px, pz) && r.max[1] >= top + RAIL_BLOCK_M && r.min[1] <= top + 0.3)) return true
  }
  return false
}
/** A non-route landing surface needs a route surface within two jumps (single-jump reach, rise ≤ 0.85 apex). */
function routeWithinTwo(id) {
  if (routeIds.has(id)) return true
  const hop = (fromId) => {
    const a = aabbAt(byId.get(fromId))
    const out = []
    for (const e of walkable) {
      if (e.id === fromId) continue
      const b = aabbAt(e)
      const dh = b.max[1] - a.max[1]
      if (dh > RISE_RATIO * movement.apexM) continue
      const gx = Math.max(0, b.min[0] - a.max[0], a.min[0] - b.max[0])
      const gz = Math.max(0, b.min[2] - a.max[2], a.min[2] - b.max[2])
      if (Math.hypot(gx, gz) <= 0.8 * reachRun(dh)) out.push(e.id)
    }
    return out
  }
  const first = hop(id)
  if (first.some((x) => routeIds.has(x))) return true
  return first.some((x) => hop(x).some((y) => routeIds.has(y)))
}
{
  const falls = []
  const noRoute = new Set()
  const checkedSurfaces = new Map()
  for (let i = 1; i < wps.length; i++) {
    const A = byId.get(wps[i - 1].id)
    const B = byId.get(wps[i].id)
    // movers and lifts at the poses the route uses: leaving in the middle of the end dwell, landing at the start dwell
    const endU = (e) => (e.motion.periodS / 2 - e.motion.dwellS / 2) / e.motion.periodS
    const a = A.motion?.type === 'linear' ? aabbAt(A, phaseTime(A, endU(A))) : aabbAt(A)
    const b = B.motion?.type === 'linear' ? aabbAt(B, phaseTime(B, 0.99)) : aabbAt(B)
    const zone = zoneOf.get(A.id)
    const w = wps[i]
    const dx = w.target[0] - w.takeoff[0]
    const dz = w.target[2] - w.takeoff[2]
    const len = Math.hypot(dx, dz) || 1
    const d = [dx / len, dz / len]
    const n = [-d[1], d[0]]
    const misses = []
    // short: 0.5 m before the near edge of B along the jump
    let s = 0
    while (s < len && !contains(b, w.takeoff[0] + d[0] * s, w.takeoff[2] + d[1] * s)) s += 0.02
    if (s > 0) misses.push(['short', w.takeoff[0] + d[0] * (s - MISS_M), w.takeoff[2] + d[1] * (s - MISS_M)])
    // lateral ±0.5 m past B's side
    for (const sign of [1, -1]) {
      let k = 0
      while (contains(b, w.target[0] + n[0] * sign * k, w.target[2] + n[1] * sign * k) && k < 400) k += 0.02
      if (k > LATERAL_EDGE_MAX_M) continue
      misses.push([sign > 0 ? 'lateral+' : 'lateral-', w.target[0] + n[0] * sign * (k + MISS_M), w.target[2] + n[1] * sign * (k + MISS_M)])
    }
    // walking off each of the 4 edges of the source pad
    const cx = (a.min[0] + a.max[0]) / 2
    const cz = (a.min[2] + a.max[2]) / 2
    for (const [kind, x, z] of [['off+x', a.max[0] + MISS_M, cz], ['off-x', a.min[0] - MISS_M, cz], ['off+z', cx, a.max[2] + MISS_M], ['off-z', cx, a.min[2] - MISS_M]]) {
      if (!railingBetween(a, x, z)) misses.push([kind, x, z])
    }
    for (const [kind, x, z] of misses) {
      const land = landingAt(x, z, a.max[1], kind.startsWith('off') ? A.id : B.id)
      const cost = land == null ? Infinity : a.max[1] - land.top
      falls.push({ from: A.id, to: B.id, zone, kind, cost: r3(cost), landing: land?.id ?? null, landingTag: land?.tag ?? null })
      if (land && !checkedSurfaces.has(land.id)) checkedSurfaces.set(land.id, routeWithinTwo(land.id))
      if (land && !checkedSurfaces.get(land.id)) noRoute.add(land.id)
    }
  }
  const perZone = ZONES.map((z) => {
    const zf = falls.filter((f) => f.zone === z)
    const over = zf.filter((f) => f.cost > BUDGET[z] + 1e-6)
    const overPairs = [...new Set(over.map((f) => f.from + '→' + f.to))]
    return { zone: z, budgetM: BUDGET[z], misses: zf.length, maxCostM: Math.max(...zf.map((f) => f.cost)), overBudgetPairs: overPairs.length, exceptionsAllowed: EXCEPTIONS[z], examples: over.slice(0, 8) }
  })
  const ok = perZone.every((z) => z.overBudgetPairs <= z.exceptionsAllowed && Number.isFinite(z.maxCostM)) && noRoute.size === 0
  rule('fall-cost', ok, { summary: perZone.map((z) => `${z.zone} max ${z.maxCostM} m / ${z.budgetM}, over ${z.overBudgetPairs}`).join('; ') + `; landings without route ≤2 jumps: ${noRoute.size}`, perZone, landingsWithoutRoute: [...noRoute] })
}

// ---- 4. moving platforms: period, dwell, landing window -----------------------------------------------------------------
{
  const movers = level.platforms.filter((e) => e.motion && e.motion.type !== 'rotate')
  const bad = movers.filter((e) => e.motion.periodS < MIN_PERIOD_S || (e.motion.type === 'linear' && e.motion.dwellS < MIN_DWELL_S))
  const windows = []
  for (let i = 1; i < wps.length; i++) {
    const A = byId.get(wps[i - 1].id)
    const B = byId.get(wps[i].id)
    if (!(A.motion?.type === 'linear' || B.motion?.type === 'linear')) continue
    const w = wps[i]
    const zone = w.zone
    const P = (B.motion ?? A.motion).periodS
    let best = 0
    let run = 0
    // takeoff at t, landing at t + airtime: the jump fits when the distance from the takeoff point (riding A) to B's
    // footprint (0.4 m inside) at landing time is within the zone margin of the reach for that height
    const samples = Math.ceil((2 * P) / PHASE_STEP_S)
    for (let k = 0; k < samples; k++) {
      const t = k * PHASE_STEP_S
      const aT = aabbAt(A, A.motion ? t : null)
      const fromTop = aT.max[1]
      const toff = A.motion ? aabbAt(A, t) : null
      const genA = A.motion ? aabbAt(A, phaseTime(A, (A.motion.periodS / 2 - A.motion.dwellS / 2) / A.motion.periodS)) : null
      const tx = w.takeoff[0] + (toff ? toff.min[0] - genA.min[0] : 0)
      const tz = w.takeoff[2] + (toff ? toff.min[2] - genA.min[2] : 0)
      const bNow = aabbAt(B, B.motion ? t : null)
      const dh0 = bNow.max[1] - fromTop
      const air = fallTime(Math.max(dh0, -2)) ?? movement.airtimeS
      const bLand = aabbAt(B, B.motion ? t + air : null)
      const dh = bLand.max[1] - fromTop
      const nx = Math.min(Math.max(tx, bLand.min[0] + 0.4), bLand.max[0] - 0.4)
      const nz = Math.min(Math.max(tz, bLand.min[2] + 0.4), bLand.max[2] - 0.4)
      const dist = Math.hypot(nx - tx, nz - tz)
      const okNow = dh <= RISE_RATIO * movement.apexM && dist <= MARGIN[zone] * reachRun(dh)
      run = okNow ? run + PHASE_STEP_S : 0
      best = Math.max(best, Math.min(run, P))
    }
    windows.push({ from: A.id, to: B.id, zone, windowS: r3(best) })
  }
  const short = windows.filter((w) => w.windowS < LANDING_WINDOW_S)
  rule('movers-period-dwell-window', bad.length === 0 && short.length === 0, {
    summary: `${movers.length} movers/lifts, ${bad.length} below period ${MIN_PERIOD_S} s / dwell ${MIN_DWELL_S} s; ${windows.length} mover jumps, min window ${Math.min(...windows.map((w) => w.windowS))} s`,
    periodDwellFailures: bad.map((e) => ({ id: e.id, periodS: e.motion.periodS, dwellS: e.motion.dwellS })),
    shortWindows: short,
  })
}

// ---- 5. sweep clearance of hazards ------------------------------------------------------------------------------------------
{
  const statics = level.platforms.filter((e) => e.motion == null && prefabs.get(e.prefab)?.collider && e.tag !== 'hazard')
  const hazards = level.platforms.filter((e) => e.tag === 'hazard')
  const problems = []
  for (const h of hazards) {
    const p = prefabs.get(h.prefab)
    const len = p.collider.size[1] * p.scale
    const thick = Math.max(p.collider.size[0], p.collider.size[2]) * p.scale
    const R = len / 2 + thick / 2
    const speed = h.motion ? (2 * Math.PI * (len / 2)) / h.motion.periodS : 0
    if (thick < 0.5 - 1e-9) problems.push({ id: h.id, problem: `thickness ${thick} < 0.5` })
    if (speed > SWEEP_MAX_SPEED) problems.push({ id: h.id, problem: `tip speed ${r3(speed)} > ${SWEEP_MAX_SPEED} m/s` })
    // swept disc: plane ⟂ local X (spin axis), centre at the hub; its footprint is a 2R × thick strip along local Z
    const c = Math.cos(h.rotY)
    const s = Math.sin(h.rotY)
    const ax = [c, -s] // local X in world xz
    const az = [s, c] // local Z in world xz
    for (const e of statics) {
      const a = platformAabb(e, prefabs.get(e.prefab))
      // horizontal distance between the strip and the AABB (sampled along the strip)
      let horiz = Infinity
      for (let k = -R; k <= R + 1e-9; k += 0.1) {
        for (const off of [-thick / 2, thick / 2]) {
          const x = h.pos[0] + az[0] * k + ax[0] * off
          const z = h.pos[2] + az[1] * k + ax[1] * off
          const gx = Math.max(0, a.min[0] - x, x - a.max[0])
          const gz = Math.max(0, a.min[2] - z, z - a.max[2])
          horiz = Math.min(horiz, Math.hypot(gx, gz))
        }
      }
      const vertOverlap = a.max[1] > h.pos[1] - R - SWEEP_V && a.min[1] < h.pos[1] + R + SWEEP_V
      if (horiz <= 1e-9 && vertOverlap) problems.push({ id: h.id, near: e.id, problem: `vertical clearance ${r3(h.pos[1] - R - a.max[1])} m < ${SWEEP_V}` })
      else if (horiz > 1e-9 && horiz < SWEEP_H - 1e-6 && a.max[1] > h.pos[1] - R && a.min[1] < h.pos[1] + R) problems.push({ id: h.id, near: e.id, problem: `horizontal clearance ${r3(horiz)} m < ${SWEEP_H}` })
    }
  }
  rule('hazard-sweep-clearance', problems.length === 0, { summary: `${hazards.length} hazards, ${problems.length} problems`, problems: problems.slice(0, 40) })
}

// ---- 6. rest density and chains vs beats.json; discovery ≤ 3 per zone --------------------------------------------------------
{
  const hazards = level.platforms.filter((e) => e.tag === 'hazard')
  const isRest = (e) => {
    if (e.motion) return false
    const a = aabbAt(e)
    if (a.max[0] - a.min[0] < REST_MIN - 1e-6 || a.max[2] - a.min[2] < REST_MIN - 1e-6) return false
    return !hazards.some((h) => contains(a, h.pos[0], h.pos[2], REST_HAZARD_M) && Math.abs(h.pos[1] - a.max[1]) < 6)
  }
  const perZone = []
  for (const z of ZONES) {
    const zw = wps.filter((w) => w.zone === z)
    let chain = 0
    let maxChain = 0
    let rests = 0
    for (const w of zw) {
      if (isRest(byId.get(w.id))) {
        rests++
        chain = 0
      } else maxChain = Math.max(maxChain, ++chain)
    }
    const b = beats.get(z)
    const every = rests ? r3(zw.length / rests) : Infinity
    const discovery = level.platforms.filter((e) => zoneOf.get(e.id) === z && e.tag === 'discovery').length
    perZone.push({ zone: z, jumps: zw.length, beatsJumps: b.jumps, rests, jumpsPerRest: every, restEveryJumps: b.restEveryJumps, maxChain, beatsMaxChain: b.maxChain, discovery, ok: maxChain <= b.maxChain && every <= b.restEveryJumps && discovery <= 3 && zw.length >= b.jumps[0] && zw.length <= b.jumps[1] })
  }
  rule('rest-chain-discovery', perZone.every((z) => z.ok), { summary: perZone.map((z) => `${z.zone} chain ${z.maxChain}/${z.beatsMaxChain}, 1 rest per ${z.jumpsPerRest}/${z.restEveryJumps}`).join('; '), perZone })
}

// ---- 7. one fake summit, one marked trap with exactly one safe option -----------------------------------------------------
{
  const fakes = level.platforms.filter((e) => e.fakeSummit)
  const traps = level.platforms.filter((e) => e.trap)
  const forks = [...new Set(traps.map((e) => e.trap.fork))]
  // options = lanes: trap entries chained by ≤ 5 m between centres with the same safe flag
  const lanes = []
  for (const e of traps) {
    let lane = lanes.find((l) => l.safe === e.trap.safe && l.members.some((m) => Math.hypot(m.pos[0] - e.pos[0], m.pos[2] - e.pos[2]) <= 5))
    if (!lane) lanes.push((lane = { safe: e.trap.safe, members: [] }))
    lane.members.push(e)
  }
  const safeLanes = lanes.filter((l) => l.safe)
  const safeOnRoute = traps.filter((e) => e.trap.safe).every((e) => routeIds.has(e.id))
  const decoysCatch = traps.filter((e) => !e.trap.safe).every((e) => e.tag === 'catch')
  const ok = fakes.length === 1 && forks.length === 1 && lanes.length >= 2 && lanes.length <= 3 && safeLanes.length === 1 && safeOnRoute && decoysCatch
  rule('fake-summit-and-trap', ok, {
    summary: `${fakes.length} fake summit, ${forks.length} fork, ${lanes.length} options (${safeLanes.length} safe)`,
    fakeSummit: fakes.map((e) => ({ id: e.id, top: aabbAt(e).max[1] })),
    options: lanes.map((l) => ({ safe: l.safe, pads: l.members.map((m) => m.id) })),
    safeOnRoute,
    decoysCatch,
  })
}

// ---- 8. scale cues every ≤ 15 m; kit scales; invisible blockers --------------------------------------------------------------
{
  const summit = aabbAt(byId.get(level.finish)).max[1]
  const ys = [0, ...level.platforms.filter((e) => prefabs.get(e.prefab)?.scaleCue).map((e) => e.pos[1])].sort((a, b) => a - b)
  const gaps = []
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > CUE_EVERY_M + 1e-6) gaps.push([r3(ys[i - 1]), r3(ys[i])])
  const lastGap = summit - ys[ys.length - 1]
  if (lastGap > CUE_EVERY_M + 1e-6) gaps.push([r3(ys[ys.length - 1]), r3(summit)])
  rule('scale-cues', gaps.length === 0, { summary: `${ys.length - 1} cues up to ${r3(summit)} m, ${gaps.length} gaps > ${CUE_EVERY_M} m`, gaps })
  const kits = new Map()
  for (const p of prefabList) {
    if (!kits.has(p.kit)) kits.set(p.kit, new Set())
    if (p.scaleCue) kits.get(p.kit).add(p.scale)
  }
  const mixed = [...kits.entries()].filter(([, s]) => s.size > 1).map(([k, s]) => ({ kit: k, scales: [...s] }))
  rule('kit-scale', mixed.length === 0, { summary: `${kits.size} kits, scale cues use one scale per kit`, kits: [...kits.entries()].map(([k, s]) => ({ kit: k, cueScales: [...s] })), mixed })
  const invisible = level.platforms.filter((e) => {
    const p = prefabs.get(e.prefab)
    return p?.collider && p.glb == null && (p.visual == null || (p.visual.kind === 'composite' && (p.visual.parts ?? []).length === 0))
  })
  const design = existsSync('GAME_DESIGN.md') ? readFileSync('GAME_DESIGN.md', 'utf8') : ''
  const unrecorded = invisible.filter((e) => !design.includes(e.id))
  rule('invisible-blockers-recorded', unrecorded.length === 0, { summary: `${invisible.length} invisible colliders, ${unrecorded.length} not in GAME_DESIGN.md`, invisible: invisible.map((e) => e.id) })
}

// ---- 9. floorAABB and collision triangles ---------------------------------------------------------------------------------
{
  const f = floorAabb(level, prefabs)
  const outside = level.platforms
    .filter((e) => prefabs.get(e.prefab)?.collider)
    .filter((e) => {
      const a = platformAabb(e, prefabs.get(e.prefab))
      return a.min[0] < f.min[0] - 1e-6 || a.max[0] > f.max[0] + 1e-6 || a.min[2] < f.min[2] - 1e-6 || a.max[2] > f.max[2] + 1e-6
    })
    .map((e) => e.id)
  rule('inside-floor-aabb', outside.length === 0, { summary: `floorAABB x [${r3(f.min[0])}, ${r3(f.max[0])}] z [${r3(f.min[2])}, ${r3(f.max[2])}], ${outside.length} colliders outside`, floorAabb: f, outside })
  const colliders = level.platforms.filter((e) => prefabs.get(e.prefab)?.collider)
  const cameraBlockers = colliders.filter((e) => e.motion == null && (e.cameraBlocker ?? (prefabs.get(e.prefab).walkable && e.tag !== 'hazard')))
  const tris = (colliders.length + cameraBlockers.length) * TRIS_PER_BOX
  rule('collision-triangles', tris <= MAX_TRIS, { summary: `${tris} triangles (physics ${colliders.length} boxes + camera ${cameraBlockers.length} boxes) ≤ ${MAX_TRIS}`, tris })
}

// ---- 10. ROUTE-UNPROVEN: pairs neither the sim test nor a bot run crossed -------------------------------------------------------
{
  const proven = new Set()
  const sources = []
  if (existsSync(simFile)) {
    const sim = readJson(simFile)
    for (const r of sim.results) if (r.ok) proven.add(`${r.from}→${r.to}`)
    sources.push(`${simFile}: ${sim.results.filter((r) => r.ok).length}/${sim.results.length}`)
  }
  for (const f of botFiles) {
    const ms = readJson(f)
    const ids = new Set(ms.map((m) => m.id))
    let n = 0
    for (let i = 1; i < wps.length; i++) if (ids.has(wps[i].id) && ids.has(wps[i - 1].id)) {
      proven.add(`${wps[i - 1].id}→${wps[i].id}`)
      n++
    }
    sources.push(`${f}: ${n} pairs`)
  }
  const unproven = pairs.filter((p) => !proven.has(`${p.from}→${p.to}`)).map((p) => `${p.from}→${p.to}`)
  rule('route-proven', unproven.length === 0, { summary: `${pairs.length - unproven.length}/${pairs.length} pairs proven (${sources.join('; ') || 'no sources'})`, ROUTE_UNPROVEN: unproven.slice(0, 100) })
}

const failed = results.filter((r) => !r.ok)
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify({ test: 'TEST-36', level: 'main', seed: level.seed, rules: results.length, failed: failed.length, results }, null, 2) + '\n')
console.log(`${outFile}: ${results.length - failed.length}/${results.length} rules pass`)
process.exit(failed.length ? 1 : 0)
