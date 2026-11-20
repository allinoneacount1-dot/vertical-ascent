#!/usr/bin/env node
// Offline, deterministic level generator (DIRECTIVE D-022, D-055; ref/03 §Data level, §Aturan desain). Writes
// level/beats.json, level/z1.json … level/z4.json and the main-world prefabs into level/prefabs.json (the G2 slice
// prefabs are kept unchanged). src/ never imports this file; its output is committed and may be edited by hand.
//   node tools/level-gen.mjs [seed]
//
// Layout: a square spiral of decks around a central tower. Each zone is one ring of axis-aligned decks (Z1 rooftops,
// Z2 scaffold decks, Z3 sky islands, Z4 summit ridges); deck k+1 is S_z higher than deck k and shares an edge with it.
// The climb from deck k to deck k+1 stays above deck k (a loop path inside the deck, margin 2.5 m), so every missed
// jump lands on deck k or on a lower pad of the same climb: fall cost ≤ S_z ≤ the zone budget by construction.
// Deck edges that are not shared with the previous deck carry railings (collider 0.5 m thick, 1.1 m tall).
import { readFileSync, writeFileSync } from 'node:fs'

const SEED = Number(process.argv[2] ?? 20261030)
const movement = JSON.parse(readFileSync('level/movement.json', 'utf8'))

// ---- seeded rng --------------------------------------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(SEED)
const _pick = (arr) => arr[Math.floor(rng() * arr.length)]
const r3 = (v) => Math.round(v * 1000) / 1000

// ---- movement limits (level/movement.json; ref/03 §Aturan desain margins) ----------------------------------------------
const APEX = movement.apexM
const APEX_DJ = movement.doubleJump.apexM
const MAX_RISE = 0.85 * APEX
const MAX_RISE_DJ = 0.85 * APEX_DJ
const EDGE_IN = 0.45 // takeoff inset (capsule 0.4 + 5 cm), same as scripts/build-routes.mjs
const TARGET_IN = 0.8
const MARGIN = 0.8 // a jump uses at most 80 % of the matching reach (Z1 rule, applied to every zone for the bot)
const MARGIN_DJ = 0.8

// Ballistic reach from the measured apex and airtime (level/movement.json): v0 = 4·apex/airtime, g = 2·v0/airtime.
// It reproduces every measured reach (run up1m 3.82 vs 3.812, down2m 5.97 vs 5.99, double jump flat 8.13 vs 8.142).
const V0 = (4 * APEX) / movement.airtimeS
const G = (2 * V0) / movement.airtimeS
const RUN = 6
/** Time from takeoff until the feet come down through takeoff + dh (single jump), or null above the apex. */
function fallTime(dh) {
  const disc = V0 * V0 - 2 * G * dh
  return disc < 0 ? null : (V0 + Math.sqrt(disc)) / G
}
function reachRun(dh) {
  const t = fallTime(dh)
  return t == null ? 0 : RUN * t
}
/** Double jump: the air jump at the first apex (movement.json airJumpAt), same vertical speed again. */
function reachDj(dh) {
  const t1 = V0 / G
  const disc = V0 * V0 - 2 * G * (dh - APEX)
  return disc < 0 ? 0 : RUN * (t1 + (V0 + Math.sqrt(disc)) / G)
}

// ---- prefabs -----------------------------------------------------------------------------------------------------------
const TRIM = '#8a6d36' // shared walkable cue: warm trim around every route surface (ref/03 grammar)
const SAND = '#d8b56a'
const prefabs = new Map()
const box = (id, size, visual, extra = {}) => {
  prefabs.set(id, {
    id,
    glb: null,
    node: null,
    kit: 'procedural',
    scale: 1,
    collider: { type: 'box', size, offset: [0, -size[1] / 2, 0] },
    walkable: true,
    surface: 'concrete',
    scaleCue: false,
    visual,
    ...extra,
  })
  return id
}
const visualOnly = (id, parts, extra = {}) => {
  prefabs.set(id, { id, glb: null, node: null, kit: 'procedural', scale: 1, collider: null, walkable: false, surface: 'none', scaleCue: false, visual: { kind: 'composite', color: '#ffffff', parts }, ...extra })
  return id
}

// route pads (the G2 slice prefabs pad-m, pad-l, mover-m, blade-5, finish-pad are reused unchanged)
box('pad-prec', [1.2, 1, 1.2], { kind: 'box', color: '#e6c98a', accent: TRIM })
box('pad-rest', [3.6, 1, 3.6], { kind: 'box', color: SAND, accent: TRIM })
box('pad-run', [3, 1, 6], { kind: 'box', color: SAND, accent: TRIM })
box('lift-l', [4, 0.5, 4], { kind: 'box', color: '#4f8fb8', accent: '#f2f4f8' }, { surface: 'metal' })
const SLICE_IDS = ['floor-60', 'pad-l', 'pad-m', 'pad-s', 'mover-m', 'blade-5', 'finish-pad']
const HALF = { 'pad-m': [1.5, 1.5], 'pad-l': [2, 2], 'pad-prec': [0.6, 0.6], 'pad-rest': [1.8, 1.8], 'pad-run': [1.5, 3], 'mover-m': [1.5, 1.5], 'lift-l': [2, 2], 'finish-pad': [2, 2] }

// scale cues (ref/03 §Isyarat ketinggian): a rooftop door hut (door 2.1 m) and railings (1.1 m)
prefabs.set('hut', {
  id: 'hut',
  glb: null,
  node: null,
  kit: 'procedural',
  scale: 1,
  collider: { type: 'box', size: [2.6, 2.6, 2.6], offset: [0, 1.3, 0] },
  walkable: false,
  surface: 'concrete',
  scaleCue: true,
  visual: {
    kind: 'composite',
    color: '#a39282',
    parts: [
      { shape: 'box', size: [2.6, 2.6, 2.6], pos: [0, 1.3, 0], color: '#a39282' },
      { shape: 'box', size: [1.0, 2.1, 0.06], pos: [0, 1.05, 1.32], color: '#5b4636' },
      { shape: 'box', size: [2.8, 0.15, 2.8], pos: [0, 2.68, 0], color: '#7d6f62' },
    ],
  },
})
function railing(len, axis) {
  const id = `rail-${axis}-${len}`
  if (prefabs.has(id)) return id
  const n = Math.max(2, Math.round(len / 2) + 1)
  const parts = []
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (len * i) / (n - 1)
    parts.push({ shape: 'box', size: axis === 'x' ? [0.08, 1.1, 0.08] : [0.08, 1.1, 0.08], pos: axis === 'x' ? [t, 0.55, 0] : [0, 0.55, t], color: '#dfe3e8' })
  }
  parts.push({ shape: 'box', size: axis === 'x' ? [len, 0.08, 0.08] : [0.08, 0.08, len], pos: [0, 1.06, 0], color: '#dfe3e8' })
  parts.push({ shape: 'box', size: axis === 'x' ? [len, 0.06, 0.06] : [0.06, 0.06, len], pos: [0, 0.55, 0], color: '#dfe3e8' })
  prefabs.set(id, {
    id,
    glb: null,
    node: null,
    kit: 'procedural',
    scale: 1,
    collider: { type: 'box', size: axis === 'x' ? [len, 1.1, 0.5] : [0.5, 1.1, len], offset: [0, 0.55, 0] },
    walkable: false,
    surface: 'metal',
    scaleCue: true,
    visual: { kind: 'composite', color: '#dfe3e8', parts },
  })
  return id
}
visualOnly('lamp', [
  { shape: 'cylinder', size: [0.06, 2.6, 0.06], pos: [0, 1.3, 0], color: '#3d4650', segments: 8 },
  { shape: 'box', size: [0.5, 0.2, 0.3], pos: [0.2, 2.6, 0], color: '#3d4650' },
  { shape: 'box', size: [0.36, 0.06, 0.2], pos: [0.2, 2.48, 0], color: '#fff3c4', emissive: '#ffe08a' },
], { scaleCue: true })

// ---- world frame: a square spiral of rings around the centre (D-055) ---------------------------------------------------
const A0 = 14 // core half-size
const RINGS = [
  { zone: 'z1', w: 16, decks: 8, S: 10, Svec: [7, 6, 10, 7, 10, 6, 10, 8], base: 0, palette: ['#c9b8a6', '#b8c4cc', '#d4c3a2', '#a9b4bf', '#cbbfae', '#bcc7c2', '#d1c7b7', '#b3bcc5'], kind: 'building' },
  { zone: 'z2', w: 18, decks: 8, S: 18, base: 64, palette: ['#8d969e'], kind: 'scaffold' },
  { zone: 'z3', w: 24, decks: 4, S: 40, base: 208, palette: ['#9fb7a3'], kind: 'island' },
  { zone: 'z4', w: 24, decks: 4, S: 33, base: 368, palette: ['#e9eef2'], kind: 'ridge' },
]
const SUMMIT_Y = 500
let a = A0
for (const r of RINGS) {
  r.aIn = a
  r.aOut = a + r.w
  a = r.aOut
}
const C = [0, 0, -(RINGS[0].aIn + RINGS[0].aOut) / 2] // the spawn plaza (first Z1 deck) is centred on the origin (D-007)

/** Axis-aligned deck rectangles of a ring in clockwise order starting with the south side (z+ = south). */
function ringRects(r) {
  const i = r.aIn
  const o = r.aOut
  if (r.decks === 8) {
    return [
      { x0: -i, x1: i, z0: i, z1: o, side: 'S' },
      { x0: -o, x1: -i, z0: i, z1: o, side: 'SW' },
      { x0: -o, x1: -i, z0: -i, z1: i, side: 'W' },
      { x0: -o, x1: -i, z0: -o, z1: -i, side: 'NW' },
      { x0: -i, x1: i, z0: -o, z1: -i, side: 'N' },
      { x0: i, x1: o, z0: -o, z1: -i, side: 'NE' },
      { x0: i, x1: o, z0: -i, z1: i, side: 'E' },
      { x0: i, x1: o, z0: i, z1: o, side: 'SE' },
    ]
  }
  // pinwheel: four rectangles, each one side plus one corner
  return [
    { x0: -o, x1: i, z0: i, z1: o, side: 'S' },
    { x0: -o, x1: -i, z0: -o, z1: i, side: 'W' },
    { x0: -i, x1: o, z0: -o, z1: -i, side: 'N' },
    { x0: i, x1: o, z0: -i, z1: o, side: 'E' },
  ]
}
const toWorld = (rect) => ({ x0: rect.x0 + C[0], x1: rect.x1 + C[0], z0: rect.z0 + C[2], z1: rect.z1 + C[2], side: rect.side })

/** Shared edge segment between two touching rectangles (or null). */
function sharedEdge(a, b) {
  const eps = 1e-6
  const ox0 = Math.max(a.x0, b.x0)
  const ox1 = Math.min(a.x1, b.x1)
  const oz0 = Math.max(a.z0, b.z0)
  const oz1 = Math.min(a.z1, b.z1)
  if (Math.abs(a.x1 - b.x0) < eps || Math.abs(a.x0 - b.x1) < eps) {
    if (oz1 - oz0 > eps) return { axis: 'x', at: Math.abs(a.x1 - b.x0) < eps ? a.x1 : a.x0, from: oz0, to: oz1 }
  }
  if (Math.abs(a.z1 - b.z0) < eps || Math.abs(a.z0 - b.z1) < eps) {
    if (ox1 - ox0 > eps) return { axis: 'z', at: Math.abs(a.z1 - b.z0) < eps ? a.z1 : a.z0, from: ox0, to: ox1 }
  }
  return null
}

// ---- output state ------------------------------------------------------------------------------------------------------
const zones = new Map(RINGS.map((r) => [r.zone, []]))
const errors = []
let idSeq = 0
const nid = (zone, kind) => `${zone}-${kind}${String(++idSeq).padStart(3, '0')}`
function add(zone, entry) {
  zones.get(zone).push({ id: entry.id, prefab: entry.prefab, pos: entry.pos.map(r3), rotY: r3(entry.rotY ?? 0), tag: entry.tag, precision: entry.precision ?? false, landmark: entry.landmark ?? false, fakeSummit: entry.fakeSummit ?? false, trap: entry.trap ?? null, motion: entry.motion ?? null, ...(entry.needsDoubleJump ? { needsDoubleJump: true } : {}), ...(entry.takeoff ? { takeoff: entry.takeoff.map(r3) } : {}), ...(entry.beacon ? { beacon: entry.beacon } : {}), ...(entry.cameraBlocker != null ? { cameraBlocker: entry.cameraBlocker } : {}) })
  return entry.id
}
/** Static colliders for clearance checks: { min, max } world AABBs. */
const _solids = []
function aabbOf(pos, prefabId, rotY = 0) {
  const p = prefabs.get(prefabId) ?? baseSlicePrefab(prefabId)
  if (!p?.collider) return null
  const swap = Math.abs(Math.sin(rotY)) > 0.5
  const [sx, sy, sz] = p.collider.size
  const hx = (swap ? sz : sx) / 2
  const hz = (swap ? sx : sz) / 2
  const cy = pos[1] + p.collider.offset[1]
  return { min: [pos[0] - hx, cy - sy / 2, pos[2] - hz], max: [pos[0] + hx, cy + sy / 2, pos[2] + hz] }
}
const slicePrefabs = new Map(JSON.parse(readFileSync('level/prefabs.json', 'utf8')).filter((p) => SLICE_IDS.includes(p.id)).map((p) => [p.id, p]))
function baseSlicePrefab(id) {
  return slicePrefabs.get(id)
}

// ---- jump checks -------------------------------------------------------------------------------------------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
function footprintOf(pos, prefabId) {
  const [hx, hz] = HALF[prefabId]
  return { cx: pos[0], cz: pos[2], hx, hz, top: pos[1] }
}
function insetClosest(f, x, z, inset) {
  return [clamp(x, f.cx - f.hx + inset, f.cx + f.hx - inset), clamp(z, f.cz - f.hz + inset, f.cz + f.hz - inset)]
}
/** Same construction as build-routes: takeoff inside A toward B, target inside B's near edge. */
function jumpGeometry(A, B, takeoffHint) {
  let takeoff
  if (takeoffHint) takeoff = takeoffHint
  else {
    const t0 = insetClosest(B, A.cx, A.cz, Math.min(TARGET_IN, Math.min(B.hx, B.hz) - 0.2))
    const t = insetClosest(A, t0[0], t0[1], EDGE_IN)
    takeoff = [t[0], A.top, t[1]]
  }
  const tgt = insetClosest(B, takeoff[0], takeoff[2], Math.min(TARGET_IN, Math.min(B.hx, B.hz) - 0.2))
  const dist = Math.hypot(tgt[0] - takeoff[0], tgt[1] - takeoff[2])
  return { takeoff, target: [tgt[0], B.top, tgt[1]], dist, dh: B.top - (takeoffHint ? takeoffHint[1] : A.top) }
}
function checkJump(label, A, B, opts = {}) {
  const g = jumpGeometry(A, B, opts.takeoff)
  const dj = opts.doubleJump === true
  if (g.dh > (dj ? MAX_RISE_DJ : MAX_RISE) + 1e-6) errors.push(`${label}: rise ${r3(g.dh)} > ${r3(dj ? MAX_RISE_DJ : MAX_RISE)}`)
  const reach = dj ? reachDj(g.dh) : reachRun(g.dh)
  const margin = opts.margin ?? (dj ? MARGIN_DJ : MARGIN)
  if (g.dist > margin * reach + 1e-6) errors.push(`${label}: distance ${r3(g.dist)} > ${margin} × reach ${r3(reach)} (dh ${r3(g.dh)})`)
  return g
}

// ---- climb path inside a deck ------------------------------------------------------------------------------------------
const MARGIN_IN = 2.5
/** Perimeter loop of the inner rectangle: corners clockwise NW → NE → SE → SW. */
function loopOf(rect) {
  const x0 = rect.x0 + MARGIN_IN
  const x1 = rect.x1 - MARGIN_IN
  const z0 = rect.z0 + MARGIN_IN
  const z1 = rect.z1 - MARGIN_IN
  const corners = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ]
  const lens = [x1 - x0, z1 - z0, x1 - x0, z1 - z0]
  const P = lens.reduce((s, l) => s + l, 0)
  const at = (s) => {
    s = ((s % P) + P) % P
    for (let k = 0; k < 4; k++) {
      if (s <= lens[k] || k === 3) {
        const a = corners[k]
        const b = corners[(k + 1) % 4]
        const f = lens[k] === 0 ? 0 : Math.min(1, s / lens[k])
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
      }
      s -= lens[k]
    }
    return corners[0]
  }
  const paramOf = (x, z) => {
    // closest point on the loop
    let best = 0
    let bd = Infinity
    for (let s = 0; s < P; s += 0.05) {
      const p = at(s)
      const d = Math.hypot(p[0] - x, p[1] - z)
      if (d < bd) {
        bd = d
        best = s
      }
    }
    return best
  }
  return { at, paramOf, P, inner: { x0, x1, z0, z1 } }
}

// ---- move catalogue ----------------------------------------------------------------------------------------------------
// gap = edge gap between the two pads; rise = fixed rise (null = filler, rise chosen by the planner)
const MOVES = {
  walkgap: { gap: 0.6, rise: 0, pad: 'pad-m' },
  stepup: { gap: 0.4, rise: 0.9, pad: 'pad-l' },
  climb: { gap: 1.2, rise: null, pad: 'pad-m' },
  climbLow: { gap: 1.4, rise: 0.7, pad: 'pad-m' },
  sprint: { gap: 2.2, rise: 0.2, pad: 'pad-m' },
  runup: { gap: 0.6, rise: 0.3, pad: 'pad-run' },
  drop: { gap: 2.2, rise: -1.2, pad: 'pad-m' },
  precision: { gap: 1.0, rise: 0.4, pad: 'pad-prec' },
  afterPrecision: { gap: 1.0, rise: 0.5, pad: 'pad-m' },
  dj: { gap: 3.4, rise: 1.7, pad: 'pad-m', doubleJump: true, straight: true },
  rest: { gap: 0.8, rise: 0.8, pad: 'pad-rest' },
  hazard: { gap: 2.8, rise: 0, pad: 'pad-m', hazard: true, straight: true },
  mover: { gap: 1.0, rise: 0.7, pad: 'pad-m', mover: true, straight: true },
}
const MAX_FILL_RISE = 1.3
const TRAVEL = 6

function pathDir(loop, s, dir) {
  const a = loop.at(s)
  const b = loop.at(s + dir * 0.5)
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
}
/** True when the loop runs straight between parameters s0 and s1 (no corner in between). */
function straightBetween(loop, s0, s1, dir) {
  const d0 = pathDir(loop, s0, dir)
  const n = Math.ceil(Math.abs(s1 - s0) / 0.25)
  for (let i = 1; i <= n; i++) {
    const d = pathDir(loop, s0 + ((s1 - s0) * i) / n, dir)
    if (Math.abs(d[0] - d0[0]) > 1e-3 || Math.abs(d[1] - d0[1]) > 1e-3) return false
  }
  return true
}
const flatFoot = (x, z, prefabId) => footprintOf([x, 0, z], prefabId)
/** Edge gap (Chebyshev) between two pad footprints, ≥ 0.3 keeps them apart with clearance. */
const chebGap = (A, B) => Math.max(Math.abs(A.cx - B.cx) - (A.hx + B.hx), Math.abs(A.cz - B.cz) - (A.hz + B.hz))

/**
 * Phase A: positions along the loop (XZ only). Returns null when the path is used up.
 * The next pad goes to the first point where the real jump distance reaches the move's nominal distance and the
 * pads are at least 0.3 m apart (corners give a shorter diagonal, never a longer one).
 */
function nextSpot(loop, from, s0, dir, m, sEnd) {
  const A = flatFoot(from.x, from.z, from.prefab)
  const half = HALF[m.pad]
  const dNom = m.gap + EDGE_IN + Math.min(TARGET_IN, Math.min(half[0], half[1]) - 0.2)
  for (let s = s0 + dir * 0.1; dir > 0 ? s <= sEnd : s >= sEnd; s += dir * 0.1) {
    const p = loop.at(s)
    const B = flatFoot(p[0], p[1], m.pad)
    if (chebGap(A, B) < 0.3) continue
    const g = jumpGeometry({ ...A, top: 0 }, { ...B, top: 0 })
    if (g.dist + 1e-6 >= dNom) {
      if (m.straight && !straightBetween(loop, from.s, s, dir)) return { corner: true }
      return { s, x: p[0], z: p[1] }
    }
  }
  return null
}

/**
 * Builds the climb of one tier: from deck k (top y0, entered at `entryPoint`) to the edge shared with deck k+1 (top y1).
 * script = skill-ladder moves (fixed rises); fillers ('climb') share the remaining rise evenly; lifts carry L metres.
 */
function buildClimb(zone, tierIndex, rect, nextRect, entryPoint, y0, y1, script, lifts, allowLaps = true, quiet = false) {
  const loop = loopOf(rect)
  const exitEdge = sharedEdge(rect, nextRect)
  if (!exitEdge) {
    errors.push(`${zone} tier ${tierIndex}: decks do not touch`)
    return { ids: [] }
  }
  const exitPoint = exitEdge.axis === 'x' ? [exitEdge.at, (exitEdge.from + exitEdge.to) / 2] : [(exitEdge.from + exitEdge.to) / 2, exitEdge.at]
  const sE = loop.paramOf(entryPoint[0], entryPoint[1])
  const sX = loop.paramOf(exitPoint[0], exitPoint[1])
  const fixedRise = script.reduce((s, n) => s + (MOVES[n].rise ?? 0), 0) + lifts.reduce((s, L) => s + L + 0.8, 0)
  const FIRST = 1.0
  const FINAL = 1.1
  const _fillRise = y1 - y0 - FIRST - FINAL - fixedRise
  const cw = (((sX - sE) % loop.P) + loop.P) % loop.P
  // spans without an extra lap first (stacked laps need ≥6 m between them), then with one extra lap
  const options = [
    { dir: 1, span: cw },
    { dir: -1, span: loop.P - cw },
    { dir: 1, span: cw + loop.P },
    { dir: -1, span: 2 * loop.P - cw },
  ].filter((o) => o.span > 6)
  options.sort((p, q) => p.span - q.span)
  if (!allowLaps) for (let i = options.length - 1; i >= 0; i--) if (options[i].span > loop.P) options.splice(i, 1)
  if (process.env.GEN_DEBUG) console.error(JSON.stringify({ zone, tierIndex, P: r3(loop.P), sE: r3(sE), sX: r3(sX), options }))
  for (const o of options) {
    const res = planClimb(zone, tierIndex, loop, rect, nextRect, sE, o.dir, o.span, y0, y1, script, lifts, FIRST, FINAL)
    if (res) return res
  }
  if (!quiet) errors.push(`${zone} tier ${tierIndex}: no climb fits (rise ${r3(y1 - y0)}, loop ${r3(loop.P)} m)`)
  return null
}

function planClimb(zone, tierIndex, loop, rect, nextRect, sE, dir, span, y0, y1, script, lifts, FIRST, FINAL) {
  const sEnd = sE + dir * span
  const steps = [] // { kind, prefab, x, z, s, rise } and lift/mover records
  const p0 = loop.at(sE)
  let cur = { x: p0[0], z: p0[1], s: sE, prefab: 'pad-l' }
  steps.push({ kind: 'first', ...cur, rise: FIRST })
  const queue = [...script]
  const liftSlots = lifts.map((L, i) => ({ L, at: ((i + 1) / (lifts.length + 1)) * span }))
  let guard = 0
  for (;;) {
    if (++guard > 400) return null
    const progressed = Math.abs(cur.s - sE)
    // lift when its slot comes up: lift inward of the current pad, the next pad back on the loop
    if (liftSlots.length && progressed >= liftSlots[0].at) {
      const { L } = liftSlots.shift()
      const d = pathDir(loop, cur.s, dir)
      const cx = (loop.inner.x0 + loop.inner.x1) / 2
      const cz = (loop.inner.z0 + loop.inner.z1) / 2
      let n = [-d[1], d[0]]
      if ((cx - cur.x) * n[0] + (cz - cur.z) * n[1] < 0) n = [-n[0], -n[1]]
      const off = HALF['lift-l'][0] + 1.0 + HALF[cur.prefab][0]
      const lift = { kind: 'lift', prefab: 'lift-l', x: cur.x + n[0] * off, z: cur.z + n[1] * off, s: cur.s, L }
      if (!insideInner(loop, [lift.x, lift.z])) return null
      steps.push(lift)
      const spot = nextSpot(loop, { ...lift, s: cur.s }, cur.s, dir, MOVES.climb, sEnd)
      if (!spot || spot.corner) return null
      cur = { x: spot.x, z: spot.z, s: spot.s, prefab: 'pad-m' }
      steps.push({ kind: 'afterLift', ...cur })
      continue
    }
    const name = queue.length ? queue[0] : 'climb'
    const m = MOVES[name]
    if (m.mover) {
      const start = nextSpot(loop, cur, cur.s, dir, { gap: 1.0, pad: 'mover-m' }, sEnd)
      if (!start || start.corner) {
        if (!start) break
        steps.push(...placeFiller(loop, cur, dir, sEnd, (c) => (cur = c)))
        continue
      }
      const sTravelEnd = start.s + dir * TRAVEL
      if (!straightBetween(loop, start.s, sTravelEnd, dir) || (dir > 0 ? sTravelEnd > sEnd - 4 : sTravelEnd < sEnd + 4)) {
        steps.push(...placeFiller(loop, cur, dir, sEnd, (c) => (cur = c)))
        continue
      }
      const end = loop.at(sTravelEnd)
      const mover = { kind: 'mover', prefab: 'mover-m', x: start.x, z: start.z, s: start.s, ex: end[0], ez: end[1] }
      steps.push(mover)
      const after = nextSpot(loop, { x: end[0], z: end[1], s: sTravelEnd, prefab: 'mover-m' }, sTravelEnd, dir, MOVES.climb, sEnd)
      if (!after || after.corner) return null
      cur = { x: after.x, z: after.z, s: after.s, prefab: 'pad-m' }
      steps.push({ kind: 'afterMover', ...cur })
      queue.shift()
      continue
    }
    const spot = nextSpot(loop, cur, cur.s, dir, m, sEnd)
    if (spot == null) break
    if (spot.corner) {
      // a straight-only move meets a corner: put a filler first
      steps.push(...placeFiller(loop, cur, dir, sEnd, (c) => (cur = c)))
      continue
    }
    cur = { x: spot.x, z: spot.z, s: spot.s, prefab: m.pad }
    steps.push({ kind: name, ...cur, rise: m.rise })
    if (queue.length) queue.shift()
  }
  if (process.env.GEN_DEBUG) console.error("  plan", zone, tierIndex, "dir", dir, "span", r3(span), "steps", steps.map((st) => st.kind + "@" + r3(st.s) + "(" + r3(st.x) + "," + r3(st.z) + ")").join(" "))
  if (queue.length || liftSlots.length) return null
  // the last pad must face the next deck within jump range: drop trailing pads that stop short of the exit
  // heights: fixed rises, fillers share the rest
  const fillers = steps.filter((st) => st.kind === 'climb')
  const fixed = steps.reduce((sum, st) => sum + (st.kind === 'climb' ? 0 : st.kind === 'lift' ? st.L + 0.3 : st.kind === 'afterLift' ? 0.5 : st.kind === 'mover' ? 0.3 : st.kind === 'afterMover' ? 0.4 : (st.rise ?? 0)), 0)
  const fillRise = y1 - y0 - FINAL - fixed
  if (fillers.length === 0 ? Math.abs(fillRise) > 0.3 : fillRise / fillers.length > MAX_FILL_RISE || fillRise < 0) return null
  const each = fillers.length ? fillRise / fillers.length : 0
  // emit (a lamp post as a scale cue on a pad every ~12 m of height, ref/03 §Isyarat ketinggian)
  const ids = []
  let lastCueY = y0
  let y = y0
  let prevFoot = null
  let prevTop = y0
  for (const st of steps) {
    if (st.kind === 'lift') {
      const bottom = y + 0.3
      const motion = { type: 'linear', points: [[0, 0, 0], [0, r3(st.L), 0]], periodS: r3(2 * (st.L / 1.0 + 1.5)), phaseS: r3(rng() * 10), dwellS: 1.5 }
      const id = add(zone, { id: nid(zone, 'lift'), prefab: 'lift-l', pos: [st.x, bottom, st.z], tag: 'route', motion })
      checkJump(`${id} (onto lift)`, prevFoot, footprintOf([st.x, bottom, st.z], 'lift-l'))
      railsFor(zone, [st.x, st.z], bottom, st.L)
      ids.push(id)
      y = bottom + st.L
      prevFoot = footprintOf([st.x, y, st.z], 'lift-l')
      continue
    }
    if (st.kind === 'mover') {
      const top = y + 0.3
      const motion = { type: 'linear', points: [[0, 0, 0], [r3(st.ex - st.x), 0, r3(st.ez - st.z)]], periodS: 12, phaseS: r3(rng() * 6), dwellS: 1.5 }
      const id = add(zone, { id: nid(zone, 'm'), prefab: 'mover-m', pos: [st.x, top, st.z], tag: 'route', motion })
      checkJump(`${id} (onto mover)`, prevFoot, footprintOf([st.x, top, st.z], 'mover-m'))
      ids.push(id)
      y = top
      prevFoot = footprintOf([st.ex, top, st.ez], 'mover-m')
      continue
    }
    const rise = st.kind === 'climb' ? each : st.kind === 'afterLift' ? 0.5 : st.kind === 'afterMover' ? 0.4 : (st.rise ?? 0)
    y += rise
    const isFirst = st.kind === 'first'
    const back = isFirst ? loop.at(st.s - dir * 3.4) : null
    const m = MOVES[st.kind]
    const id = add(zone, {
      id: nid(zone, st.kind === 'rest' ? 'rest' : 'r'),
      prefab: st.prefab,
      pos: [st.x, y, st.z],
      tag: 'route',
      precision: st.prefab === 'pad-prec',
      needsDoubleJump: m?.doubleJump === true,
      ...(isFirst ? { takeoff: [back[0], y0, back[1]] } : {}),
    })
    const B = footprintOf([st.x, y, st.z], st.prefab)
    if (isFirst) {
      if (back[0] < rect.x0 + 1 || back[0] > rect.x1 - 1 || back[1] < rect.z0 + 1 || back[1] > rect.z1 - 1) errors.push(`${zone} tier ${tierIndex}: first takeoff outside the deck`)
      checkJump(`${id} (first)`, { cx: back[0], cz: back[1], hx: 0.5, hz: 0.5, top: y0 }, B, { takeoff: [back[0], y0, back[1]] })
    } else checkJump(`${id} (${st.kind})`, prevFoot, B, { doubleJump: m?.doubleJump === true, margin: m?.hazard ? 0.88 : undefined })
    if (m?.hazard) {
      const mid = [(prevFoot.cx + st.x) / 2, (prevFoot.cz + st.z) / 2]
      const dx = st.x - prevFoot.cx
      const dz = st.z - prevFoot.cz
      const len = Math.hypot(dx, dz)
      const rotY = Math.atan2(-dz / len, dx / len)
      // hub above the jump's body column (takeoff top + 1.7 m body + measured apex + 0.75 m): only the lower blade
      // tip sweeps through the jump, so clear windows exist each half turn; the deck below stays ≥2.0 m under the tip
      const hub = Math.max(prevTop + HAZARD_HUB_ABOVE, y0 + 2.0 + 2.75)
      const hz = add(zone, { id: nid(zone, 'h'), prefab: 'blade-5', pos: [mid[0], hub, mid[1]], rotY, tag: 'hazard', motion: { type: 'rotate', points: [[0, 0, 0]], axis: [1, 0, 0], periodS: 6, phaseS: r3(rng() * 6), dwellS: 0 } })
      hazards.push({ id: hz, zone, mid, hub, rotY, below: prevTop })
    }
    const beforeLift = steps[steps.indexOf(st) + 1]?.kind === 'lift'
    if ((y - lastCueY >= 6 || st.kind === 'afterLift' || beforeLift) && st.prefab !== 'pad-prec') {
      const [hx, hz] = HALF[st.prefab]
      add(zone, { id: nid(zone, 'lamp'), prefab: 'lamp', pos: [st.x - hx + 0.25, y, st.z - hz + 0.25], tag: 'decor' })
      lastCueY = y
    }
    ids.push(id)
    prevFoot = B
    prevTop = y
  }
  const nextFoot = { cx: (nextRect.x0 + nextRect.x1) / 2, cz: (nextRect.z0 + nextRect.z1) / 2, hx: (nextRect.x1 - nextRect.x0) / 2, hz: (nextRect.z1 - nextRect.z0) / 2, top: y1 }
  checkJump(`${zone} tier ${tierIndex} final jump`, prevFoot, nextFoot)
  return { ids, laps: span / loop.P }
}

function placeFiller(loop, cur, dir, sEnd, setCur) {
  const spot = nextSpot(loop, cur, cur.s, dir, MOVES.climb, sEnd)
  if (!spot || spot.corner) return []
  const st = { kind: 'climb', prefab: 'pad-m', x: spot.x, z: spot.z, s: spot.s, rise: null }
  setCur({ x: spot.x, z: spot.z, s: spot.s, prefab: 'pad-m' })
  return [st]
}

function overlaps(a, b, pad = 0) {
  return a.min[0] < b.max[0] + pad && a.max[0] > b.min[0] - pad && a.min[2] < b.max[2] + pad && a.max[2] > b.min[2] - pad
}
const hazards = []
/** Windmill hub height above the takeoff pad top (blade-5: 2.5 m half length, 0.25 m half thickness). */
const HAZARD_HUB_ABOVE = 4.2
function insideInner(loop, p) {
  const i = loop.inner
  return p[0] >= i.x0 - 0.01 && p[0] <= i.x1 + 0.01 && p[1] >= i.z0 - 0.01 && p[1] <= i.z1 + 0.01
}
function railsFor(zone, lp, bottom, L) {
  const id = visualOnly(`lift-rails-${Math.round(L * 10)}`, [
    { shape: 'box', size: [0.15, L + 3, 0.15], pos: [2.25, (L + 3) / 2 - 0.5, 2.25], color: '#2f3640' },
    { shape: 'box', size: [0.15, L + 3, 0.15], pos: [-2.25, (L + 3) / 2 - 0.5, -2.25], color: '#2f3640' },
    { shape: 'box', size: [0.15, L + 3, 0.15], pos: [2.25, (L + 3) / 2 - 0.5, -2.25], color: '#2f3640' },
    { shape: 'box', size: [0.15, L + 3, 0.15], pos: [-2.25, (L + 3) / 2 - 0.5, 2.25], color: '#2f3640' },
  ])
  add(zone, { id: nid(zone, 'rails'), prefab: id, pos: [lp[0], bottom, lp[1]], tag: 'decor' })
}

// ---- decks, buildings, railings, cues -----------------------------------------------------------------------------------
function deckPrefab(ring, rect, k, height) {
  const w = r3(rect.x1 - rect.x0)
  const l = r3(rect.z1 - rect.z0)
  const color = ring.palette[k % ring.palette.length]
  if (ring.kind === 'building') {
    const h = Math.max(1, height)
    const id = `bldg-${w}x${l}-${h}`
    prefabs.set(id, {
      id,
      glb: null,
      node: null,
      kit: 'procedural',
      scale: 1,
      collider: { type: 'box', size: [w, h, l], offset: [0, -h / 2, 0] },
      walkable: true,
      surface: 'concrete',
      scaleCue: false,
      visual: { kind: 'box', color, accent: TRIM },
    })
    return id
  }
  const thick = ring.kind === 'scaffold' ? 1 : 2
  const id = `deck-${ring.zone}-${w}x${l}`
  if (!prefabs.has(id)) {
    prefabs.set(id, {
      id,
      glb: null,
      node: null,
      kit: 'procedural',
      scale: 1,
      collider: { type: 'box', size: [w, thick, l], offset: [0, -thick / 2, 0] },
      walkable: true,
      surface: ring.kind === 'scaffold' ? 'metal' : 'stone',
      scaleCue: false,
      visual: { kind: 'box', color, accent: TRIM },
    })
  }
  return id
}

function supportsFor(zone, ring, rect, height) {
  // visual-only supports under scaffold decks and islands (no colliders: unreachable)
  const parts = []
  const w = rect.x1 - rect.x0
  const l = rect.z1 - rect.z0
  if (ring.kind === 'scaffold') {
    const h = height - 1
    for (const fx of [-0.42, 0.42])
      for (const fz of [-0.42, 0.42]) parts.push({ shape: 'box', size: [0.6, h, 0.6], pos: [fx * w, -1 - h / 2, fz * l], color: '#5f6873' })
  } else if (ring.kind === 'island') {
    parts.push({ shape: 'cone', size: [Math.min(w, l) * 0.55, 14], pos: [0, -2 - 7, 0], rot: [Math.PI, 0, 0], color: '#7f8f7e', segments: 7 })
  } else if (ring.kind === 'ridge') {
    parts.push({ shape: 'cone', size: [Math.min(w, l) * 0.6, 18], pos: [0, -2 - 9, 0], rot: [Math.PI, 0, 0], color: '#b9c3cc', segments: 6 })
  }
  if (parts.length === 0) return
  const id = visualOnly(`support-${ring.zone}-${r3(w)}x${r3(l)}`, parts)
  add(zone, { id: nid(zone, 'sup'), prefab: id, pos: [(rect.x0 + rect.x1) / 2, height, (rect.z0 + rect.z1) / 2], tag: 'decor' })
}

/** Railings on every deck edge except the edge shared with the previous (lower) deck: walking off there drops S. */
function railingsFor(zone, rect, height, prevRect, _nextRect) {
  const edges = [
    { axis: 'x', at: rect.z0, from: rect.x0, to: rect.x1, inward: 1 },
    { axis: 'x', at: rect.z1, from: rect.x0, to: rect.x1, inward: -1 },
    { axis: 'z', at: rect.x0, from: rect.z0, to: rect.z1, inward: 1 },
    { axis: 'z', at: rect.x1, from: rect.z0, to: rect.z1, inward: -1 },
  ]
  const shared = [prevRect && sharedEdge(rect, prevRect)].filter(Boolean)
  for (const e of edges) {
    // split the edge into segments not covered by a shared edge with the previous or next deck
    let segs = [[e.from, e.to]]
    for (const s of shared) {
      const sameLine = (s.axis === 'z' && e.axis === 'x' && Math.abs(s.at - e.at) < 1e-6) || (s.axis === 'x' && e.axis === 'z' && Math.abs(s.at - e.at) < 1e-6)
      // sharedEdge axis 'z' means the boundary is a line of constant z (edges along x)
      if (!sameLine) continue
      segs = segs.flatMap(([a0, a1]) => {
        const out = []
        if (s.from > a0) out.push([a0, Math.min(a1, s.from)])
        if (s.to < a1) out.push([Math.max(a0, s.to), a1])
        return out.filter(([p, q]) => q - p > 0.6)
      })
    }
    for (const [a0, a1] of segs) {
      const len = r3(a1 - a0)
      const mid = (a0 + a1) / 2
      const pos = e.axis === 'x' ? [mid, height, e.at + e.inward * 0.25] : [e.at + e.inward * 0.25, height, mid]
      const id = railing(len, e.axis)
      add(zone, { id: nid(zone, 'rail'), prefab: id, pos, tag: 'decor' })
    }
  }
}

// ---- landmarks and the core ---------------------------------------------------------------------------------------------
function coreAndLandmarks() {
  const cx = C[0]
  const cz = C[2]
  // the trunk: one collider through the zones (blocks the player and the camera)
  const trunkH = 420
  prefabs.set('core-trunk', {
    id: 'core-trunk',
    glb: null,
    node: null,
    kit: 'procedural',
    scale: 1,
    collider: { type: 'box', size: [12, trunkH, 12], offset: [0, trunkH / 2, 0] },
    walkable: false,
    surface: 'concrete',
    scaleCue: false,
    visual: { kind: 'composite', color: '#6d7782', parts: [{ shape: 'box', size: [12, trunkH, 12], pos: [0, trunkH / 2, 0], color: '#6d7782' }] },
  })
  add('z1', { id: 'core-trunk', prefab: 'core-trunk', pos: [cx, 0, cz], tag: 'decor', cameraBlocker: true })
  // Z1 landmark: a red-and-white radio mast on the trunk (64 → 110 m), seen from the spawn plaza
  const mast = []
  for (let i = 0; i < 6; i++) mast.push({ shape: 'box', size: [4, 7, 4], pos: [0, 64 + i * 7 + 3.5, 0], color: i % 2 ? '#f2f4f8' : '#d9534f' })
  mast.push({ shape: 'cone', size: [3, 10, 0], pos: [0, 111, 0], color: '#d9534f', segments: 8 })
  visualOnly('lm-z1-mast', mast)
  add('z1', { id: 'lm-z1', prefab: 'lm-z1-mast', pos: [cx, 0, cz + 7.5], tag: 'decor', landmark: true })
  // Z2 landmark: a tower crane on the trunk (200 → 236 m) with a jib over the city block
  visualOnly('lm-z2-crane', [
    { shape: 'box', size: [3, 36, 3], pos: [0, 218, 0], color: '#f2c94c' },
    { shape: 'box', size: [30, 2, 2], pos: [9, 236, 0], color: '#f2c94c' },
    { shape: 'box', size: [8, 2, 2], pos: [-8, 236, 0], color: '#f2c94c' },
    { shape: 'box', size: [4, 4, 4], pos: [-10, 233, 0], color: '#5f6873' },
    { shape: 'box', size: [3, 3, 4], pos: [0, 233, 2.5], color: '#5f6873' },
  ])
  add('z2', { id: 'lm-z2', prefab: 'lm-z2-crane', pos: [cx, 0, cz - 7.5], tag: 'decor', landmark: true })
  // Z3 landmark: two halo rings around the trunk (300 → 345 m)
  const halo = []
  for (const [y, r] of [[300, 19], [330, 15]]) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    halo.push({ shape: 'box', size: [7.6, 1.6, 1.6], pos: [Math.cos(a) * r, y + (y === 300 ? 0 : 15), Math.sin(a) * r], rot: [0, -a + Math.PI / 2, 0], color: '#a7d3e8', emissive: '#4fa3c8' })
  }
  visualOnly('lm-z3-halo', halo)
  add('z3', { id: 'lm-z3', prefab: 'lm-z3-halo', pos: [cx, 0, cz], tag: 'decor', landmark: true })
  // Z4 landmark: the crown on top of the trunk (420 → 450 m)
  visualOnly('lm-z4-crown', [
    { shape: 'cylinder', size: [9, 6, 7], pos: [0, 423, 0], color: '#d9dee4', segments: 8 },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ shape: 'cone', size: [1.4, 18, 0], pos: [Math.cos((k / 8) * Math.PI * 2) * 7, 435, Math.sin((k / 8) * Math.PI * 2) * 7], color: '#f4e3a1', segments: 6 })),
  ])
  add('z4', { id: 'lm-z4', prefab: 'lm-z4-crown', pos: [cx, 0, cz], tag: 'decor', landmark: true })
}

// ---- generate ----------------------------------------------------------------------------------------------------------
const beats = []
const deckRects = []
for (const ring of RINGS) for (const [k, rect] of ringRects(ring).entries()) deckRects.push({ ring, k, rect: toWorld(rect), y: null })
deckRects[0].y = 0
/** Fall-cost budgets per zone (ref/03): the deck spacing never exceeds them. */
const BUDGET = { z1: 10, z2: 30, z3: 80, z4: 120 }
const FAKE_SUMMIT_Y = 467
// the deck after the last deck of a ring is the first deck of the next ring; check that they touch
for (let i = 0; i + 1 < deckRects.length; i++) if (!sharedEdge(deckRects[i].rect, deckRects[i + 1].rect)) errors.push(`deck ${i} (${deckRects[i].ring.zone} ${deckRects[i].rect.side}) does not touch deck ${i + 1} (${deckRects[i + 1].ring.zone} ${deckRects[i + 1].rect.side})`)

// skill ladder (ref/03): each skill alone first with a fall cost ≤ 10 m, then combined
const SCRIPTS = {
  z1: [
    ['walkgap', 'stepup', 'runup', 'sprint', 'drop'], // walk-gap ≤1.5 m → step-up ≤1.2 → sprint-gap with a visible run-up → drop-down
    ['precision', 'afterPrecision', 'precision', 'afterPrecision'], // precision ×2, a miss costs ≤2 m (corner deck)
    [],
    ['mover'], // first moving platform, low, wide landing (corner deck: 6 m tier leaves room for the ride)
    ['climbLow'],
    [],
    ['rest'],
    [],
  ],
  z2: [['hazard'], ['dj'], ['mover'], ['rest', 'hazard'], ['dj', 'rest'], ['mover', 'rest'], ['hazard', 'rest'], ['dj']],
  z3: [['hazard', 'rest', 'dj', 'mover', 'rest'], ['mover', 'rest', 'hazard', 'rest', 'dj'], ['dj', 'rest', 'hazard', 'mover', 'rest'], ['hazard', 'rest', 'dj', 'rest', 'mover']],
  z4: [['dj', 'rest', 'hazard', 'mover', 'rest'], ['hazard', 'rest', 'dj', 'rest', 'mover'], ['mover', 'rest', 'dj', 'hazard', 'rest'], []],
}
const LIFTS = { z1: [], z2: [6], z3: [10, 10], z4: [10] }

coreAndLandmarks()
const routeOrder = []
for (let i = 0; i < deckRects.length; i++) {
  const { ring, k, rect, y } = deckRects[i]
  const zone = ring.zone
  const prev = deckRects[i - 1] ?? null
  const next = deckRects[i + 1] ?? null
  const deckId = add(zone, { id: nid(zone, `deck${rect.side}`), prefab: deckPrefab(ring, rect, k, y), pos: [(rect.x0 + rect.x1) / 2, y, (rect.z0 + rect.z1) / 2], tag: i === 0 ? 'route' : 'route' })
  routeOrder.push(deckId)
  supportsFor(zone, ring, rect, y)
  railingsFor(zone, rect, y, prev?.rect, next?.rect)
  // scale cue on every deck: a door hut (Z1 rooftops) or a lamp post
  const corner = [rect.x0 + 1.6, rect.z0 + 1.6]
  if (ring.kind === 'building' && i > 0) add(zone, { id: nid(zone, 'hut'), prefab: 'hut', pos: [corner[0], y, corner[1]], tag: 'decor' })
  else add(zone, { id: nid(zone, 'lamp'), prefab: 'lamp', pos: [corner[0], y, corner[1]], tag: 'decor' })
  if (next == null) break
  // entry point: where the player arrives (shared edge with the previous deck) or the spawn
  let entry = [0, 0]
  if (prev) {
    const e = sharedEdge(rect, prev.rect)
    entry = e.axis === 'x' ? [e.at, (e.from + e.to) / 2] : [(e.from + e.to) / 2, e.at]
  }
  const isLastZ4 = zone === 'z4' && k === RINGS[3].decks - 1
  if (isLastZ4) break
  // spacing to the next deck: the zone's plan, but never above its budget; Z4 lands the plateau at FAKE_SUMMIT_Y.
  // Try the planned spacing, then smaller ones, without stacked laps; stacked laps only as the last resort.
  const decksLeftInZone = RINGS.find((r) => r.zone === zone).decks - k - 1
  let want = ring.Svec ? ring.Svec[k] : ring.S
  if (zone === 'z4') want = (FAKE_SUMMIT_Y - y) / decksLeftInZone
  want = Math.min(want, BUDGET[zone])
  let climb = null
  let S = want
  for (const allowLaps of [false, true]) {
    for (S = want; S >= want * 0.55 && climb == null; S -= 0.25) {
      climb = buildClimb(zone, k, rect, next.rect, entry, y, r3(y + S), SCRIPTS[zone][k] ?? [], LIFTS[zone] ?? [], allowLaps, true)
      if (climb) break
    }
    if (climb) break
  }
  if (!climb) {
    errors.push(`${zone} tier ${k}: no climb fits for spacing ${r3(want * 0.55)} … ${r3(want)} m`)
    break
  }
  next.y = r3(y + S)
  if (process.env.GEN_DEBUG) console.error(`deck ${zone} ${k} y ${y} → ${next.y} (want ${r3(want)}, laps ${r3(climb.laps ?? 0)})`)
  routeOrder.push(...climb.ids)
}

// ---- Z4: fake summit plateau (last deck), trap fork, real summit -------------------------------------------------------
const last = deckRects[deckRects.length - 1]
const lastDeckId = routeOrder[routeOrder.length - 1]
{
  const zone = 'z4'
  const rect = last.rect
  const y = last.y // fake summit height
  // mark the plateau as the fake summit, with a sign and the first beacon
  const plateau = zones.get(zone).find((e) => e.id === lastDeckId)
  plateau.fakeSummit = true
  const cxr = (rect.x0 + rect.x1) / 2
  visualOnly('fake-sign', [
    { shape: 'box', size: [0.2, 2.4, 0.2], pos: [-1.6, 1.2, 0], color: '#5b4636' },
    { shape: 'box', size: [0.2, 2.4, 0.2], pos: [1.6, 1.2, 0], color: '#5b4636' },
    { shape: 'box', size: [4, 1.6, 0.15], pos: [0, 2.6, 0], color: '#f2f4f8' },
  ])
  add(zone, { id: 'z4-fake-sign', prefab: 'fake-sign', pos: [cxr - 4, y, rect.z0 + 9], tag: 'decor' })
  visualOnly('beacon', [
    { shape: 'cylinder', size: [0.6, 3, 0.6], pos: [0, 1.5, 0], color: '#2f3640', segments: 10 },
    { shape: 'sphere', size: [1.1, 1.1, 1.1], pos: [0, 3.6, 0], color: '#fff3c4', emissive: '#ffd36a', segments: 10 },
  ])
  const fakeBeaconPos = [cxr + 4, y, rect.z0 + 9]
  add(zone, { id: 'z4-beacon-fake', prefab: 'beacon', pos: fakeBeaconPos, tag: 'decor', beacon: 'fake' })
  globalThis.fakeBeaconPos = fakeBeaconPos
  // trap fork: three similar pads leave the plateau toward the north end; only the one with visible support struts
  // continues (documented mark, GAME_DESIGN.md); the decoys end after three pads, a drop back to the plateau
  const forkZ = rect.z0 + 22
  const xs = [rect.x0 + 6, cxr, rect.x1 - 6]
  const safeIndex = 1 + Math.floor(rng() * 2) - 1 // 0, 1 → shuffled below
  const order = [0, 1, 2].sort(() => rng() - 0.5)
  const safe = order[safeIndex]
  const fork = 'z4-trap-a'
  const struts = visualOnly('strut', [{ shape: 'box', size: [0.25, 3, 0.25], pos: [-1.2, -2.5, -1.2], color: '#b07d3a' }, { shape: 'box', size: [0.25, 3, 0.25], pos: [1.2, -2.5, 1.2], color: '#b07d3a' }, { shape: 'box', size: [0.25, 3, 0.25], pos: [1.2, -2.5, -1.2], color: '#b07d3a' }, { shape: 'box', size: [0.25, 3, 0.25], pos: [-1.2, -2.5, 1.2], color: '#b07d3a' }])
  let safeLast = null
  for (const [i, x] of xs.entries()) {
    let top = y + 0.9
    let z = forkZ
    const isSafe = i === safe
    const n = 3
    for (let j = 0; j < n; j++) {
      const id = add(zone, { id: nid(zone, isSafe ? 'r' : 'trap'), prefab: 'pad-m', pos: [x, top, z], tag: isSafe ? 'route' : 'catch', trap: { fork, safe: isSafe } })
      if (isSafe) {
        routeOrder.push(id)
        add(zone, { id: nid(zone, 'strut'), prefab: struts, pos: [x, top, z], tag: 'decor' })
        if (j === 0) zones.get(zone).find((e) => e.id === id).takeoff = [x, y, z - 3.4].map(r3)
        safeLast = { pos: [x, top, z], prefab: 'pad-m' }
      }
      top += 1.0
      z += 4.3
    }
  }
  // the safe branch continues north along the deck to the summit: climbs, a lift, and the finish at 500 m
  let prev = safeLast
  let zc = prev.pos[2]
  let xc = prev.pos[0]
  const route = []
  const step = (rise, gap = 1.2, prefabId = 'pad-m') => {
    zc += HALF[prev.prefab][1] + gap + HALF[prefabId][1]
    const top = prev.pos[1] + rise
    const id = add(zone, { id: nid(zone, 'r'), prefab: prefabId, pos: [xc, top, zc], tag: 'route' })
    checkJump(`${id} (summit)`, footprintOf(prev.pos, prev.prefab), footprintOf([xc, top, zc], prefabId))
    prev = { pos: [xc, top, zc], prefab: prefabId }
    route.push(id)
    return id
  }
  for (let j = 0; j < 4; j++) step(1.1)
  // two lifts to the summit ridge with a pad between them (each lift period ≤ 30 s, a lamp on every pad stop)
  const summitLift = (L) => {
    const liftBottom = prev.pos[1] + 0.3
    zc += HALF[prev.prefab][1] + 1.0 + 2
    const liftId = add(zone, { id: nid(zone, 'lift'), prefab: 'lift-l', pos: [xc, liftBottom, zc], tag: 'route', motion: { type: 'linear', points: [[0, 0, 0], [0, r3(L), 0]], periodS: r3(2 * (L + 1.5)), phaseS: 0, dwellS: 1.5 } })
    checkJump(`${liftId} (summit lift)`, footprintOf(prev.pos, prev.prefab), footprintOf([xc, liftBottom, zc], 'lift-l'))
    railsFor(zone, [xc, zc], liftBottom, L)
    route.push(liftId)
    prev = { pos: [xc, liftBottom + L, zc], prefab: 'lift-l' }
  }
  const lampOn = (pos) => add(zone, { id: nid(zone, 'lamp'), prefab: 'lamp', pos: [pos[0] - 1.25, pos[1], pos[2] - 1.25], tag: 'decor' })
  lampOn(prev.pos)
  const liftsRise = SUMMIT_Y - 1.0 - 5 * 1.0 - (prev.pos[1] + 0.3) - (0.5 + 0.3)
  summitLift(r3(liftsRise / 2))
  step(0.5)
  lampOn(prev.pos)
  summitLift(r3(SUMMIT_Y - 1.0 - 5 * 1.0 - (prev.pos[1] + 0.3)))
  for (let j = 0; j < 5; j++) step(1.0)
  lampOn(prev.pos)
  const finishTop = SUMMIT_Y
  zc += HALF[prev.prefab][1] + 1.2 + 2
  const finishId = add(zone, { id: 'z4-summit', prefab: 'finish-pad', pos: [xc, finishTop, zc], tag: 'route', landmark: true })
  checkJump(`z4-summit (finish)`, footprintOf(prev.pos, prev.prefab), footprintOf([xc, finishTop, zc], 'finish-pad'))
  add(zone, { id: 'z4-beacon-true', prefab: 'beacon', pos: [xc + 1.2, finishTop, zc + 1.2], tag: 'decor', beacon: 'true' })
  globalThis.summitPos = [xc, finishTop, zc]
  route.push(finishId)
  routeOrder.push(...route)
  if (zc > rect.z1 - 4) errors.push(`summit leaves the plateau: z ${r3(zc)} > ${r3(rect.z1 - 4)}`)
  // a high cloud band hides the real summit until the reveal (ref/03 Puncak palsu)
  const band = []
  for (let k = 0; k < 14; k++) band.push({ shape: 'sphere', size: [9 + rng() * 6, 3 + rng() * 2, 9 + rng() * 6], pos: [(rng() - 0.5) * 40, 478 + rng() * 10, (rng() - 0.5) * 40], color: '#f7f9fb', segments: 7 })
  visualOnly('summit-band', band)
  add(zone, { id: 'z4-summit-band', prefab: 'summit-band', pos: [xc + 26, 0, zc + 10], tag: 'decor' })
}

// ---- ground, floor and the gapped cloud layer --------------------------------------------------------------------------
{
  // the real floor spans floorAABB exactly (D-007): route and rest footprints ± 120 m
  const lo = [Infinity, Infinity]
  const hi = [-Infinity, -Infinity]
  for (const z of zones.keys()) for (const e of zones.get(z)) {
    if (e.tag !== 'route' && e.tag !== 'rest') continue
    const a = aabbOf(e.pos, e.prefab, e.rotY)
    if (a == null) continue
    lo[0] = Math.min(lo[0], a.min[0])
    lo[1] = Math.min(lo[1], a.min[2])
    hi[0] = Math.max(hi[0], a.max[0])
    hi[1] = Math.max(hi[1], a.max[2])
  }
  const size = [r3(hi[0] - lo[0] + 240), 1, r3(hi[1] - lo[1] + 240)]
  box('ground-floor', size, { kind: 'box', color: '#5b6876' }, { surface: 'concrete' })
  add('z1', { id: 'z1-floor', prefab: 'ground-floor', pos: [r3((lo[0] + hi[0]) / 2), -0.02, r3((lo[1] + hi[1]) / 2)], tag: 'floor', cameraBlocker: true })
}
visualOnly('ground-far', [{ shape: 'box', size: [4000, 0.1, 4000], pos: [0, -0.6, 0], color: '#6f7d6a' }])
add('z1', { id: 'z1-ground-far', prefab: 'ground-far', pos: [C[0], 0, C[2]], tag: 'decor' })
{
  // puffs at 40–55 % of the summit height, outside the ring footprints (radius > aOut of ring 4 + 8) and over the
  // inner rings above their tops, with holes; removed near the spawn → fake-beacon and summit → city sight lines
  const lines = [
    [[0, 1.5, 0], [globalThis.fakeBeaconPos[0], last.y + 4, globalThis.fakeBeaconPos[2]]],
    [[globalThis.summitPos[0], SUMMIT_Y + 1.5, globalThis.summitPos[2]], [C[0], 0, C[2]]],
  ]
  const nearLine = (p, [a, b], r) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
    const t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2), 0, 1)
    const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < r
  }
  const puffs = []
  const outer = RINGS[3].aOut + 10
  for (let gx = -6; gx <= 6; gx++)
    for (let gz = -6; gz <= 6; gz++) {
      if (rng() < 0.45) continue // the gaps
      const x = gx * 26 + (rng() - 0.5) * 10
      const z = gz * 26 + (rng() - 0.5) * 10
      const rr = Math.max(Math.abs(x), Math.abs(z))
      const inner = rr < RINGS[1].aOut - 4 && rr > A0 + 6 // over rings 1–2 (their tops end at 208 m)
      if (!(rr > outer || inner)) continue
      const y = 200 + rng() * 75
      const p = [x + C[0], y, z + C[2]]
      if (lines.some((l) => nearLine(p, l, 16))) continue
      puffs.push({ shape: 'sphere', size: [8 + rng() * 8, 3 + rng() * 2.5, 8 + rng() * 8], pos: [x, y, z], color: '#f7f9fb', segments: 7 })
    }
  visualOnly('cloud-layer', puffs)
  add('z3', { id: 'z3-cloud-layer', prefab: 'cloud-layer', pos: [C[0], 0, C[2]], tag: 'decor' })
}

// ---- self-checks: clearance between stacked surfaces, hazards, budgets, cues ------------------------------------------
const all = [...zones.values()].flat()
const getPrefab = (id) => prefabs.get(id) ?? baseSlicePrefab(id)
const routeEntries = routeOrder.map((id) => all.find((e) => e.id === id))
// vertical clearance: two pad-like surfaces whose footprints overlap (capsule 0.4 m) need ≥ 6 m between their tops
const pads = all.filter((e) => e.tag === 'route' && e.motion == null && !e.id.includes('deck') && getPrefab(e.prefab)?.collider)
for (let i = 0; i < pads.length; i++)
  for (let j = i + 1; j < pads.length; j++) {
    const A = aabbOf(pads[i].pos, pads[i].prefab)
    const B = aabbOf(pads[j].pos, pads[j].prefab)
    if (!overlaps(A, B, 0.4)) continue
    const dy = Math.abs(pads[i].pos[1] - pads[j].pos[1])
    if (dy < 1.0 && !overlaps(A, B, 0)) continue // side by side, a step: no head room needed
    if (dy < 6) errors.push(`stacked pads too close: ${pads[i].id} and ${pads[j].id} (Δy ${r3(Math.abs(pads[i].pos[1] - pads[j].pos[1]))})`)
  }
// hazard clearance: ≥1.1 m horizontally from static colliders, ≥2.0 m vertically above static colliders below
for (const h of hazards) {
  const R = 2.5
  const bottom = h.hub - R
  for (const e of all) {
    if (e.motion != null) continue
    const A = aabbOf(e.pos, e.prefab, e.rotY)
    if (!A || e.tag === 'floor') continue
    const horiz = Math.max(A.min[0] - h.mid[0], h.mid[0] - A.max[0], A.min[2] - h.mid[1], h.mid[1] - A.max[2], 0)
    const inside = A.min[0] <= h.mid[0] && h.mid[0] <= A.max[0] && A.min[2] <= h.mid[1] && h.mid[1] <= A.max[2]
    if (inside && bottom - A.max[1] < 2.0 && A.max[1] < h.hub + R) errors.push(`hazard ${h.id}: ${r3(bottom - A.max[1])} m above ${e.id} (need ≥2.0)`)
    if (!inside && horiz < 1.1 - 0.25 && A.max[1] > bottom && A.min[1] < h.hub + R) errors.push(`hazard ${h.id}: ${r3(horiz)} m from ${e.id} (need ≥1.1)`)
  }
}
// scale cues every ≤15 m of height along the climb
const cueYs = all.filter((e) => getPrefab(e.prefab)?.scaleCue).map((e) => e.pos[1]).sort((p, q) => p - q)
for (let i = 1; i < cueYs.length; i++) if (cueYs[i] - cueYs[i - 1] > 15 + 1e-6 && cueYs[i] < SUMMIT_Y) errors.push(`scale-cue gap ${r3(cueYs[i - 1])} → ${r3(cueYs[i])} m`)

if (errors.length) {
  console.error(`level-gen: ${errors.length} problem(s)`)
  for (const e of errors.slice(0, 60)) console.error('  ' + e)
  process.exit(1)
}

// ---- write -------------------------------------------------------------------------------------------------------------
const zoneBase = (z) => deckRects.find((d) => d.ring.zone === z).y
const bands = { z1: [0, zoneBase('z2')], z2: [zoneBase('z2'), zoneBase('z3')], z3: [zoneBase('z3'), zoneBase('z4')], z4: [zoneBase('z4'), SUMMIT_Y] }
for (const ring of RINGS) {
  const routeZ = routeEntries.filter((e) => e.id.startsWith(ring.zone))
  beats.push({
    zone: ring.zone,
    bandM: bands[ring.zone],
    jumps: [routeZ.length - ring.decks, routeZ.length],
    restEveryJumps: ring.zone === 'z1' ? 9 : 12,
    maxChain: ring.zone === 'z1' ? 9 : ring.zone === 'z2' ? 12 : 14,
    deckSpacingM: ring.S,
    ...(ring.zone === 'z4' ? { fakeSummitAtM: last.y, trapBetweenM: [last.y, last.y + 4], summitY: SUMMIT_Y } : {}),
    ...(ring.zone === 'z3' ? { cloudLayerM: [200, 275] } : {}),
  })
}
writeFileSync('level/beats.json', JSON.stringify({ seed: SEED, generatedBy: 'tools/level-gen.mjs', beats }, null, 2) + '\n')
for (const ring of RINGS) {
  const data = {
    zone: ring.zone,
    seed: SEED,
    spawn: ring.zone === 'z1' ? [0, 0, 0] : null,
    finish: ring.zone === 'z4' ? 'z4-summit' : '',
    routeOrder: routeOrder.filter((id) => id.startsWith(ring.zone)),
    platforms: zones.get(ring.zone),
  }
  writeFileSync(`level/${ring.zone}.json`, JSON.stringify(data, null, 1) + '\n')
}
const prefabList = [...slicePrefabs.values(), ...[...prefabs.values()].filter((p) => !SLICE_IDS.includes(p.id))]
writeFileSync('level/prefabs.json', '[\n' + prefabList.map((p) => '  ' + JSON.stringify(p)).join(',\n') + '\n]\n')
const counts = Object.fromEntries(RINGS.map((r) => [r.zone, { entries: zones.get(r.zone).length, route: routeOrder.filter((id) => id.startsWith(r.zone)).length }]))
console.log(JSON.stringify({ seed: SEED, summitY: SUMMIT_Y, fakeSummitY: last.y, counts, routeWaypoints: routeOrder.length, hazards: hazards.length, prefabs: prefabList.length }))
