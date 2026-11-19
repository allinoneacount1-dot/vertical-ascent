// Procedural visuals (DIRECTIVE D-017 stylized Ghibli/anime; D-013 visuals outside the bodies): every prefab visual is
// turned into world-space geometry pieces keyed by material, and the static ones are merged into one mesh per
// material so a world of hundreds of platforms stays at a few dozen draw calls (shadows on, ref/06 §Performa).
// Fase 6 Organic Footholds: static pads & decks become varied floating mossy sky islands, faceted boulders,
// weathered stone ruins, and celestial crystal monoliths while keeping top surfaces flush with BvhPhysicsBody colliders.
// Pure three.js (no React): used by Level.tsx and by tests.
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import type { Group } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PlatformEntry, Prefab, ProceduralPart } from './schema.ts'
import type { Vec3 } from './motion.ts'
import { getSurfaceTextures } from './textures.ts'
import type { SurfaceStyle } from './textures.ts'

export type Piece = {
  geometry: BufferGeometry
  key: string
  color: string
  emissive: string | null
  roughness: number
  metalness: number
  style: SurfaceStyle | null
}

const ROTATION_ORDER = 'YXZ'
const TRIM = 0.14

function hashString(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const key = (color: string, emissive: string | null, roughness: number, metalness: number, style: SurfaceStyle | null) =>
  `${color}|${emissive ?? ''}|${roughness}|${metalness}|${style ?? ''}`

function piece(
  geometry: BufferGeometry,
  color: string,
  opts: { emissive?: string | null; roughness?: number; metalness?: number; style?: SurfaceStyle | null } = {},
): Piece {
  const emissive = opts.emissive ?? null
  const roughness = opts.roughness ?? 0.85
  const metalness = opts.metalness ?? 0
  const style = opts.style ?? null
  return { geometry, color, emissive, roughness, metalness, style, key: key(color, emissive, roughness, metalness, style) }
}

const boxAt = (size: Vec3, at: Vec3) => new BoxGeometry(size[0], size[1], size[2]).translate(at[0], at[1], at[2])

/** Sculpted organic flat-top cap (keeps top face strictly at y = +capH/2 so player feet stay flush with collider). */
function sculptedCapGeo(rx: number, rz: number, capH: number, seed: number, sides = 9, jitter = 0.12): BufferGeometry {
  const geo = new CylinderGeometry(1, 0.94, capH, sides, 1)
  const rng = mulberry32(seed)
  const radii: number[] = []
  for (let s = 0; s < sides; s++) radii.push(1 + (rng() - 0.5) * 2 * jitter)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const r = Math.hypot(x, z)
    if (r > 1e-4) {
      const ang = ((Math.atan2(z, x) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      const idx = Math.round((ang / (Math.PI * 2)) * sides) % sides
      const k = radii[idx]
      pos.setX(i, x * rx * k)
      pos.setZ(i, z * rz * k)
    }
  }
  geo.computeVertexNormals()
  return geo
}

/** Tapered Laputa-style floating island rocky underside (flat top at y = 0, jagged craggy tip at y = -depth). */
function floatingIslandUndersideGeo(rx: number, rz: number, depth: number, seed: number, sides = 9): BufferGeometry {
  const geo = new CylinderGeometry(1, 0.14, depth, sides, 3)
  geo.translate(0, -depth / 2, 0)
  const rng = mulberry32(seed ^ 0x9e3779b9)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const r = Math.hypot(x, z)
    const t = Math.max(0, Math.min(1, -y / depth)) // 0 at top, 1 at bottom point
    if (r > 1e-4) {
      const ang = Math.atan2(z, x)
      const crag = 1 + Math.sin(ang * 3 + seed * 0.1) * 0.14 + Math.cos(ang * 5 - seed * 0.2) * 0.09 + (rng() - 0.5) * 0.12
      const bulge = 1 + Math.sin(t * Math.PI) * 0.16
      pos.setX(i, x * rx * crag * bulge)
      pos.setZ(i, z * rz * crag * bulge)
    }
    if (t > 0.15 && t < 0.95) {
      pos.setY(i, y + (rng() - 0.5) * depth * 0.1)
    }
  }
  geo.computeVertexNormals()
  return geo
}

/** Faceted boulder belly with flat top at y = 0 and organic bulging rock facets underneath. */
function boulderBellyGeo(rx: number, rz: number, depth: number, seed: number): BufferGeometry {
  const geo = new DodecahedronGeometry(1, 0)
  const rng = mulberry32(seed ^ 0x51f15e)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const n = 0.88 + rng() * 0.24
    pos.setX(i, x * rx * n)
    pos.setZ(i, z * rz * n)
    // Compress upper hemisphere flat to y <= 0, stretch lower hemisphere to -depth
    pos.setY(i, y >= 0 ? -y * 0.06 : y * depth * (0.85 + rng() * 0.25))
  }
  geo.computeVertexNormals()
  return geo
}

/** Collider size in metres (prefab scale applied). */
export const colliderSize = (p: Prefab): Vec3 => {
  const s = p.collider!.size
  return [s[0] * p.scale, s[1] * p.scale, s[2] * p.scale]
}

/** Pieces of one prefab visual in its local frame: the collider centre for collider kinds, the entry origin for 'composite'. */
export function localPieces(prefab: Prefab, entrySeed = 0, altitudeY = 0): Piece[] {
  const v = prefab.visual
  if (v == null) return []
  const size: Vec3 = prefab.collider ? colliderSize(prefab) : (v.size ?? [1, 1, 1])
  const [w, h, d] = size
  if (v.kind === 'composite') return (v.parts ?? []).map(partPiece)
  if (v.kind === 'stairs') {
    const steps = Math.max(2, Math.round(d / 0.35))
    const rise = h / steps
    const depth = d / steps
    const out: Piece[] = []
    for (let i = 0; i < steps; i++) {
      out.push(piece(boxAt([w, (i + 1) * rise, depth], [0, -h / 2 + ((i + 1) * rise) / 2, d / 2 - (i + 0.5) * depth]), v.color, { roughness: 0.9, style: 'stone' }))
    }
    return out
  }
  if (v.kind === 'pole') return [piece(new CylinderGeometry(w / 2, w / 2, h, 12), v.color, { style: 'metal' })]
  if (v.kind === 'blade') {
    const bands = 6
    const out = [piece(new BoxGeometry(w, h, d), v.color, { roughness: 0.45, metalness: 0.35, style: 'hazard' })]
    for (let i = 0; i < bands; i++) {
      out.push(piece(boxAt([w * 1.04, (h / bands) * 0.45, d * 1.04], [0, -h / 2 + (h / bands) * (i + 0.5), 0]), v.accent ?? '#f2c94c', { roughness: 0.55 }))
    }
    return out
  }

  const id = prefab.id
  const addTrim = (out: Piece[], color: string, emissive: string | null = null, roughness = 0.7) => {
    const y = h / 2 + 0.02
    out.push(piece(boxAt([w, 0.04, TRIM], [0, y, d / 2 - TRIM / 2]), color, { emissive, roughness, style: 'trim' }))
    out.push(piece(boxAt([w, 0.04, TRIM], [0, y, -d / 2 + TRIM / 2]), color, { emissive, roughness, style: 'trim' }))
    out.push(piece(boxAt([TRIM, 0.04, d - 2 * TRIM], [w / 2 - TRIM / 2, y, 0]), color, { emissive, roughness, style: 'trim' }))
    out.push(piece(boxAt([TRIM, 0.04, d - 2 * TRIM], [-w / 2 + TRIM / 2, y, 0]), color, { emissive, roughness, style: 'trim' }))
  }

  // Stylized Ghibli / anime architectural geometry per prefab family (colliders untouched)
  if (id.startsWith('bldg-')) {
    const out: Piece[] = [
      piece(new BoxGeometry(w, h, d), v.color, { roughness: 0.88, style: 'facade' }),
      piece(boxAt([w * 0.98, 0.06, d * 0.98], [0, h / 2 - 0.01, 0]), '#d8cbb8', { roughness: 0.92, style: 'concrete' }),
    ]
    addTrim(out, '#8e6b4a')
    return out
  }

  if (id === 'mover-m' || id === 'lift-l') {
    const topH = h * 0.55
    const botH = h * 0.45
    const out: Piece[] = [
      piece(boxAt([w, topH, d], [0, h / 2 - topH / 2, 0]), '#4a88b5', { roughness: 0.48, metalness: 0.35, style: 'metal' }),
      piece(boxAt([w * 0.72, botH, d * 0.72], [0, -h / 2 + botH / 2, 0]), '#2c4154', { roughness: 0.55, metalness: 0.4, style: 'metal' }),
    ]
    addTrim(out, '#a8f0f5', '#42c6d4', 0.35)
    return out
  }

  // Organic non-monotonous Ghibli footholds (floating mossy islands, boulders, ruins, crystal monoliths)
  if (id.startsWith('pad-') || id === 'finish-pad') {
    const isFinish = id === 'finish-pad'
    const isRest = id === 'pad-rest'
    const isHigh = altitudeY >= 245
    const isCelestial = altitudeY >= 365 || isFinish
    const rx = w * 0.54
    const rz = d * 0.54
    const seed = entrySeed || hashString(id)
    const rng = mulberry32(seed)

    if (isFinish || isRest) {
      // Sanctuary Floating Island with glowing corner beacons & deep Laputa rock spire
      const capH = Math.min(0.42, h * 0.55)
      const spireDepth = Math.max(2.2, Math.min(w, d) * 0.85)
      const cap = sculptedCapGeo(rx, rz, capH, seed, 10, 0.07).translate(0, h / 2 - capH / 2, 0)
      const under = floatingIslandUndersideGeo(rx * 0.92, rz * 0.92, spireDepth, seed, 10).translate(0, h / 2 - capH, 0)
      const out: Piece[] = [
        piece(cap, isFinish ? '#f7ecd0' : isCelestial ? '#ece8dc' : '#86b57c', {
          roughness: isFinish ? 0.62 : 0.84,
          style: isFinish || isCelestial ? 'marble' : 'moss',
        }),
        piece(under, isCelestial ? '#c7beab' : '#7b6d5e', { roughness: 0.92, style: isCelestial ? 'marble' : 'stone' }),
      ]
      const cx = w * 0.38
      const cz = d * 0.38
      for (const [sx, sz] of [
        [-cx, -cz],
        [cx, -cz],
        [-cx, cz],
        [cx, cz],
      ]) {
        out.push(piece(boxAt([0.18, 0.1, 0.18], [sx, h / 2 + 0.05, sz]), '#fff4cc', { emissive: '#ffd36a', roughness: 0.3 }))
      }
      return out
    }

    const archetype = seed % 4

    if (archetype === 0) {
      // 1. Floating Mossy Sky Island (Pulau Melayang Berlumut + akar gantung)
      const capH = Math.min(0.38, Math.max(0.24, h * 0.52))
      const islandDepth = 1.35 + Math.min(w, d) * 0.55 + rng() * 0.9
      const cap = sculptedCapGeo(rx, rz, capH, seed, 9, 0.11).translate(0, h / 2 - capH / 2, 0)
      const under = floatingIslandUndersideGeo(rx * 0.9, rz * 0.9, islandDepth, seed, 9).translate(0, h / 2 - capH, 0)
      const out: Piece[] = [
        piece(cap, isCelestial ? '#e9e4d6' : '#7eb374', { roughness: 0.86, style: isCelestial ? 'marble' : 'moss' }),
        piece(under, isCelestial ? '#bdb5a4' : '#7a6c5d', { roughness: 0.92, style: 'stone' }),
      ]
      // Hanging Ghibli vine/root tendrils beneath island (zero sightline impact)
      const vineCount = 2 + (seed % 2)
      for (let i = 0; i < vineCount; i++) {
        const ang = rng() * Math.PI * 2
        const vr = Math.min(rx, rz) * (0.42 + rng() * 0.32)
        const vLen = 0.9 + rng() * 1.4
        const vine = new CylinderGeometry(0.055, 0.015, vLen, 5).translate(
          Math.cos(ang) * vr,
          h / 2 - capH - vLen / 2 - 0.1,
          Math.sin(ang) * vr,
        )
        out.push(piece(vine, isCelestial ? '#d9c48c' : '#588c53', { roughness: 0.88 }))
      }
      return out
    }

    if (archetype === 1) {
      // 2. Sculpted Floating Boulder (Batu Terapung Berfaset + kerikil satelit)
      const capH = Math.min(0.32, Math.max(0.2, h * 0.45))
      const bellyDepth = 0.95 + Math.min(w, d) * 0.45 + rng() * 0.55
      const cap = sculptedCapGeo(rx * 0.98, rz * 0.98, capH, seed, 7, 0.14).translate(0, h / 2 - capH / 2, 0)
      const belly = boulderBellyGeo(rx * 0.96, rz * 0.96, bellyDepth, seed).translate(0, h / 2 - capH * 0.7, 0)
      const out: Piece[] = [
        piece(cap, isCelestial ? '#dfd9cc' : '#9c9385', { roughness: 0.88, style: isCelestial ? 'marble' : 'stone' }),
        piece(belly, isCelestial ? '#b4ad9f' : '#6c655c', { roughness: 0.94, style: 'stone' }),
      ]
      // Tiny orbiting satellite pebble hovering underneath
      const ang = rng() * Math.PI * 2
      const pr = Math.max(rx, rz) * 0.78
      const pebble = new DodecahedronGeometry(0.24 + rng() * 0.14, 0).translate(
        Math.cos(ang) * pr,
        -bellyDepth * 0.55,
        Math.sin(ang) * pr,
      )
      out.push(piece(pebble, '#877d71', { roughness: 0.92, style: 'stone' }))
      return out
    }

    if (archetype === 2) {
      // 3. Ancient Carved Ruin Stone (Reruntuhan Candi Langit + trim lumut/emas)
      const topH = Math.min(0.34, h * 0.46)
      const midH = Math.max(0.24, h * 0.42)
      const corbelH = 0.65 + rng() * 0.55
      const out: Piece[] = [
        piece(boxAt([w, topH, d], [0, h / 2 - topH / 2, 0]), isCelestial ? '#eeeae0' : '#aba192', {
          roughness: isCelestial ? 0.68 : 0.86,
          style: isCelestial ? 'marble' : 'stone',
        }),
        piece(boxAt([w * 0.84, midH, d * 0.84], [0, h / 2 - topH - midH / 2, 0]), isCelestial ? '#d6c8a8' : '#7b6e5e', {
          roughness: 0.9,
          style: 'stone',
        }),
        piece(
          new CylinderGeometry(Math.min(w, d) * 0.34, Math.min(w, d) * 0.14, corbelH, 6).translate(
            0,
            h / 2 - topH - midH - corbelH / 2,
            0,
          ),
          '#64594c',
          { roughness: 0.92, style: 'stone' },
        ),
      ]
      addTrim(out, isCelestial ? '#e8c468' : '#7fa872', isCelestial ? '#c79f42' : null, isCelestial ? 0.45 : 0.82)
      return out
    }

    // 4. Archetype 3: Z1-Z2 Timber Sky Dock OR Z3-Z4 Celestial Crystal Monolith
    if (!isHigh) {
      const topH = Math.min(0.28, h * 0.42)
      const out: Piece[] = [
        piece(boxAt([w, topH, d], [0, h / 2 - topH / 2, 0]), '#9e6f46', { roughness: 0.84, style: 'trim' }),
        piece(boxAt([w * 0.88, 0.24, d * 0.22], [0, h / 2 - topH - 0.12, d * 0.28]), '#6b472b', { roughness: 0.9 }),
        piece(boxAt([w * 0.88, 0.24, d * 0.22], [0, h / 2 - topH - 0.12, -d * 0.28]), '#6b472b', { roughness: 0.9 }),
      ]
      addTrim(out, '#d8a852', null, 0.62)
      return out
    }
    // Celestial Crystal Monolith (Z3-Z4)
    const capH = Math.min(0.34, h * 0.48)
    const crystalDepth = 1.4 + rng() * 1.1
    const cap = sculptedCapGeo(rx, rz, capH, seed, 6, 0.08).translate(0, h / 2 - capH / 2, 0)
    const spire = new ConeGeometry(Math.min(rx, rz) * 0.72, crystalDepth, 6)
      .rotateX(Math.PI)
      .translate(0, h / 2 - capH - crystalDepth / 2, 0)
    const out: Piece[] = [
      piece(cap, '#f0ede4', { roughness: 0.66, style: 'marble' }),
      piece(spire, '#72eac0', { emissive: '#38bdf8', roughness: 0.32, metalness: 0.2 }),
    ]
    return out
  }

  if (id.startsWith('deck-z2-')) {
    const out: Piece[] = [
      piece(new BoxGeometry(w, h, d), '#8b99a6', { roughness: 0.6, metalness: 0.25, style: 'metal' }),
      piece(
        floatingIslandUndersideGeo(w * 0.48, d * 0.48, Math.min(5.2, Math.max(2.4, Math.min(w, d) * 0.45)), entrySeed || 202, 10).translate(
          0,
          -h / 2,
          0,
        ),
        '#566370',
        { roughness: 0.78, metalness: 0.2, style: 'stone' },
      ),
    ]
    addTrim(out, '#d8a84e')
    return out
  }

  if (id.startsWith('deck-z3-')) {
    const out: Piece[] = [
      piece(boxAt([w, h * 0.38, d], [0, h / 2 - (h * 0.38) / 2, 0]), '#82b578', { roughness: 0.88, style: 'moss' }),
      piece(boxAt([w * 0.98, h * 0.62, d * 0.98], [0, -h / 2 + (h * 0.62) / 2, 0]), '#968f84', { roughness: 0.9, style: 'stone' }),
      piece(
        floatingIslandUndersideGeo(w * 0.48, d * 0.48, Math.min(6.0, Math.max(2.6, Math.min(w, d) * 0.48)), entrySeed || 303, 10).translate(
          0,
          -h / 2,
          0,
        ),
        '#797165',
        { roughness: 0.92, style: 'stone' },
      ),
    ]
    addTrim(out, '#c9b382')
    return out
  }

  if (id.startsWith('deck-z4-')) {
    const out: Piece[] = [
      piece(new BoxGeometry(w, h, d), '#f0eee8', { roughness: 0.68, style: 'marble' }),
      piece(
        floatingIslandUndersideGeo(w * 0.46, d * 0.46, Math.min(5.6, Math.max(2.5, Math.min(w, d) * 0.44)), entrySeed || 404, 10).translate(
          0,
          -h / 2,
          0,
        ),
        '#d6c8a8',
        { roughness: 0.78, style: 'marble' },
      ),
    ]
    addTrim(out, '#e5c16c', '#bfa04b', 0.45)
    return out
  }

  const defaultStyle: SurfaceStyle = id.includes('floor') ? 'concrete' : prefab.surface === 'metal' ? 'metal' : 'stone'
  const out = [piece(new BoxGeometry(w, h, d), v.color, { style: defaultStyle })]
  if (v.accent != null) addTrim(out, v.accent)
  return out
}

function partPiece(p: ProceduralPart): Piece {
  let g: BufferGeometry
  if (p.shape === 'cylinder') g = new CylinderGeometry(p.size[2] ?? p.size[0], p.size[0], p.size[1], p.segments ?? 16)
  else if (p.shape === 'cone') g = new ConeGeometry(p.size[0], p.size[1], p.segments ?? 16)
  else if (p.shape === 'sphere') g = new SphereGeometry(1, p.segments ?? 7, Math.max(3, Math.round((p.segments ?? 7) * 0.6))).scale(p.size[0], p.size[1] ?? p.size[0], p.size[2] ?? p.size[0])
  else g = new BoxGeometry(p.size[0], p.size[1], p.size[2])
  if (p.rot) g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(p.rot[0], p.rot[1], p.rot[2], ROTATION_ORDER)))
  g.translate(p.pos[0], p.pos[1], p.pos[2])
  return piece(g, p.color, { emissive: p.emissive ?? null, roughness: p.roughness ?? 0.85, metalness: p.metalness ?? 0 })
}

/** World transform of an entry's visual frame: the collider centre (collider kinds) or the entry origin (composite). */
export function visualMatrix(entry: PlatformEntry, prefab: Prefab): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(entry.rotX ?? 0, entry.rotY, 0, ROTATION_ORDER))
  const origin = new Vector3().fromArray(entry.pos)
  if (prefab.collider && prefab.visual?.kind !== 'composite') {
    const o = prefab.collider.offset
    origin.add(new Vector3(o[0] * prefab.scale, o[1] * prefab.scale, o[2] * prefab.scale).applyQuaternion(q))
  }
  return new Matrix4().compose(origin, q, new Vector3(1, 1, 1))
}

const materials = new Map<string, MeshStandardMaterial>()
export function materialFor(p: Piece): MeshStandardMaterial {
  let m = materials.get(p.key)
  if (m == null) {
    const tex = p.style ? getSurfaceTextures(p.style) : null
    m = new MeshStandardMaterial({
      color: p.color,
      roughness: p.roughness,
      metalness: p.metalness,
      ...(tex ? { map: tex.map, bumpMap: tex.bumpMap, bumpScale: 0.042 } : {}),
    })
    if (p.emissive) {
      m.emissive.set(p.emissive)
      m.emissiveIntensity = 1.4
    }
    materials.set(p.key, m)
  }
  return m
}

/** Merges the visuals of static entries into one mesh per material, added to `root`; returns the mesh count. */
export function buildMergedStatics(entries: readonly PlatformEntry[], prefabs: ReadonlyMap<string, Prefab>, root: Group): number {
  const buckets = new Map<string, { sample: Piece; geos: BufferGeometry[] }>()
  for (const e of entries) {
    const prefab = prefabs.get(e.prefab)
    if (prefab == null || e.motion != null || e.beacon != null) continue
    const m = visualMatrix(e, prefab)
    const entrySeed = hashString(e.id)
    for (const p of localPieces(prefab, entrySeed, e.pos[1])) {
      const g = p.geometry.applyMatrix4(m)
      let b = buckets.get(p.key)
      if (b == null) buckets.set(p.key, (b = { sample: p, geos: [] }))
      b.geos.push(g)
    }
  }
  let count = 0
  for (const { sample, geos } of buckets.values()) {
    const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false)
    for (const g of geos) g.dispose()
    if (merged == null) continue
    merged.computeBoundingSphere()
    const mesh = new Mesh(merged, materialFor(sample))
    mesh.castShadow = sample.emissive == null
    mesh.receiveShadow = true
    mesh.name = `merged:${sample.key}`
    root.add(mesh)
    count++
  }
  return count
}
