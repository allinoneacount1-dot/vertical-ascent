// Procedural visuals (DIRECTIVE D-017 stylized Genshin Impact x Ghibli; D-013 visuals outside the bodies):
// Every prefab visual is turned into world-space geometry pieces keyed by material, and static ones are merged into
// one mesh per material so hundreds of platforms stay at a few dozen draw calls (60 FPS safe).
// Genshin Impact Cliff Pass: all urban bldg-* blocks become stratified limestone/sandstone rock cliffs with emerald
// grass crowns, metal decks become Liyue sandstone terraces, and movers become Anemo rune-stone platforms while
// keeping top surfaces strictly flush with BvhPhysicsBody colliders.
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
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
  vertexColors?: boolean
}

const ROTATION_ORDER = 'YXZ'
const TRIM = 0.14

/** Natural uneven earth & grass micro-relief for ground-floor (strictly 0 inside plaza, spiral tower & camp). */
export function groundTerrainHeight(x: number, z: number): number {
  const rSpawn = Math.hypot(x, z)
  const rTower = Math.hypot(x - 12, z + 4)
  const rCamp = Math.hypot(x + 8.6, z - 5.4)
  const wSpawn = Math.max(0, Math.min(1, (rSpawn - 10.5) / 8.0))
  const wTower = Math.max(0, Math.min(1, (rTower - 4.8) / 4.5))
  const wCamp = Math.max(0, Math.min(1, (rCamp - 4.2) / 4.0))
  const flatMask = wSpawn * wTower * wCamp
  const smooth = flatMask * flatMask * (3 - 2 * flatMask)
  const hills =
    Math.sin(x * 0.085 + 0.4) * Math.cos(z * 0.075 - 0.3) * 0.42 +
    Math.sin(x * 0.21 - z * 0.17) * 0.18 +
    Math.cos(x * 0.39 + z * 0.33) * 0.07
  // Subtle edge taper down near r > 180 so outer meadow blends into WorldVista valley hills
  const outerFade = Math.max(0, 1 - Math.max(0, rSpawn - 165) / 55)
  return hills * smooth * outerFade
}

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

const key = (
  color: string,
  emissive: string | null,
  roughness: number,
  metalness: number,
  style: SurfaceStyle | null,
  vertexColors = false,
) => `${color}|${emissive ?? ''}|${roughness}|${metalness}|${style ?? ''}|${vertexColors ? 1 : 0}`

function piece(
  geometry: BufferGeometry,
  color: string,
  opts: { emissive?: string | null; roughness?: number; metalness?: number; style?: SurfaceStyle | null; vertexColors?: boolean } = {},
): Piece {
  const emissive = opts.emissive ?? null
  const roughness = opts.roughness ?? 0.85
  const metalness = opts.metalness ?? 0
  const style = opts.style ?? null
  const vertexColors = opts.vertexColors ?? false
  return { geometry, color, emissive, roughness, metalness, style, vertexColors, key: key(color, emissive, roughness, metalness, style, vertexColors) }
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

/**
 * Genshin Impact (Mondstadt/Liyue) stratified karst rock cliff column replacing boxy urban buildings.
 * Keeps top rim flush below y = +h/2 (leaving room for the overhanging emerald grass cap) and broadens organically
 * toward the base with horizontal sedimentary strata ledges and angular rock crevices.
 */
function sculptedCliffPillarGeo(w: number, h: number, d: number, seed: number): BufferGeometry {
  const sides = 10
  const heightSegs = Math.max(4, Math.min(8, Math.round(h / 2.2)))
  const geo = new CylinderGeometry(1, 1.14, h, sides, heightSegs)
  const rng = mulberry32(seed ^ 0x7f4a7c15)
  const angularProfile: number[] = []
  for (let s = 0; s < sides; s++) angularProfile.push(0.9 + rng() * 0.22)
  const strataPhase = rng() * Math.PI * 2

  const rx = w * 0.58
  const rz = d * 0.58
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const r = Math.hypot(x, z)
    if (r > 1e-4) {
      const ang = ((Math.atan2(z, x) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      const idx = Math.round((ang / (Math.PI * 2)) * sides) % sides
      const t = (y + h / 2) / Math.max(0.1, h) // 0 at bottom, 1 at top
      // Sedimentary rock step-outs along vertical height (flattest near top rim so collider matches)
      const strata = 1 + Math.sin(t * Math.PI * 5 + strataPhase) * 0.085 * (1 - t * 0.65)
      const crag = angularProfile[idx] * (1 + Math.cos(ang * 3 + t * 4.5 + seed * 0.13) * 0.09)
      const k = strata * crag
      pos.setX(i, x * rx * k)
      pos.setZ(i, z * rz * k)
    }
  }
  geo.computeVertexNormals()
  return geo
}

/** Tapered Laputa/Genshin floating island rocky underside (watertight: pure position-based displacement, zero seam tears). */
function floatingIslandUndersideGeo(rx: number, rz: number, depth: number, seed: number, sides = 9): BufferGeometry {
  const geo = new CylinderGeometry(1, 0.14, depth, sides, 3)
  geo.translate(0, -depth / 2, 0)
  const rng = mulberry32(seed ^ 0x9e3779b9)
  const p1 = rng() * Math.PI * 2
  const p2 = rng() * Math.PI * 2
  const p3 = rng() * Math.PI * 2
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const r = Math.hypot(x, z)
    const t = Math.max(0, Math.min(1, -y / depth))
    if (r > 1e-4) {
      const ang = Math.atan2(z, x)
      // Pure periodic function of (ang, t) so UV seam & cap vertices stay 100% watertight
      const crag =
        1 +
        Math.sin(ang * 3 + p1) * 0.14 +
        Math.cos(ang * 5 + p2) * 0.08 +
        Math.sin(ang * 2 + t * 5.2 + p3) * 0.07
      const bulge = 1 + Math.sin(t * Math.PI) * 0.16
      pos.setX(i, x * rx * crag * bulge)
      pos.setZ(i, z * rz * crag * bulge)
    }
    if (t > 0.15 && t < 0.95) {
      const ang = Math.atan2(z, x)
      pos.setY(i, y + Math.sin(ang * 4 + t * 3.1 + p2) * depth * 0.065)
    }
  }
  geo.computeVertexNormals()
  return geo
}

/** Faceted boulder belly with flat top at y = 0 (watertight: pure 3D position-based displacement on non-indexed dodecahedron). */
function boulderBellyGeo(rx: number, rz: number, depth: number, seed: number): BufferGeometry {
  const geo = new DodecahedronGeometry(1, 0)
  const rng = mulberry32(seed ^ 0x51f15e)
  const p1 = rng() * Math.PI * 2
  const p2 = rng() * Math.PI * 2
  const p3 = rng() * Math.PI * 2
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    // Pure function of (x, y, z) so all triangles sharing a corner receive identical displacement (zero exploded shards)
    const n = 0.94 + Math.sin(x * 3.7 + p1) * 0.08 + Math.cos(z * 4.1 + p2) * 0.08 + Math.sin(y * 3.3 + p3) * 0.06
    const ny = 0.92 + Math.cos(x * 2.9 - z * 3.1 + p3) * 0.12
    pos.setX(i, x * rx * n)
    pos.setZ(i, z * rz * n)
    pos.setY(i, y >= 0 ? -y * 0.06 : y * depth * ny)
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
  if (v.kind === 'composite') {
    // Transform legacy grey industrial lift-rails-* into Genshin/Ghibli carved stone-and-brass temple guide pillars
    if (prefab.id.startsWith('lift-rails-') && (v.parts?.length ?? 0) > 0) {
      const out: Piece[] = []
      for (const p of v.parts!) {
        const [px, py, pz] = p.pos
        const railH = p.size[1]
        const topY = py + railH / 2
        const botY = py - railH / 2
        // Carved octagonal sanctuary stone guide pillar
        out.push(
          piece(
            new CylinderGeometry(0.14, 0.17, railH, 8).translate(px, py, pz),
            '#d9d0be',
            { roughness: 0.82, style: 'stone' },
          ),
        )
        // Glowing cyan Anemo energy conduit strip along inner face
        const inX = px > 0 ? -0.11 : 0.11
        const inZ = pz > 0 ? -0.11 : 0.11
        out.push(
          piece(
            boxAt([0.055, railH - 0.6, 0.055], [px + inX, py, pz + inZ]),
            '#9ff7eb',
            { emissive: '#38d9c8', roughness: 0.25 },
          ),
        )
        // Brass collars at base, middle, and top + golden lantern finial at top & base plinth
        for (const cy of [botY + 0.25, py, topY - 0.25]) {
          out.push(
            piece(
              new CylinderGeometry(0.24, 0.24, 0.24, 8).translate(px, cy, pz),
              '#e0b454',
              { roughness: 0.34, metalness: 0.65 },
            ),
          )
        }
        out.push(
          piece(
            new OctahedronGeometry(0.24, 0).translate(px, topY + 0.32, pz),
            '#fff2c4',
            { emissive: '#ffbe4f', roughness: 0.25 },
          ),
        )
        out.push(
          piece(
            new CylinderGeometry(0.28, 0.34, 0.36, 8).translate(px, botY - 0.05, pz),
            '#c8beaa',
            { roughness: 0.85, style: 'stone' },
          ),
        )
      }
      return out
    }
    return (v.parts ?? []).map(partPiece)
  }
  if (v.kind === 'stairs') {
    const steps = Math.max(2, Math.round(d / 0.35))
    const rise = h / steps
    const depth = d / steps
    const out: Piece[] = []
    for (let i = 0; i < steps; i++) {
      out.push(piece(boxAt([w, (i + 1) * rise, depth], [0, -h / 2 + ((i + 1) * rise) / 2, d / 2 - (i + 0.5) * depth]), '#c9b89c', { roughness: 0.88, style: 'stone' }))
    }
    return out
  }
  if (v.kind === 'pole') return [piece(new CylinderGeometry(w / 2, w / 2, h, 12), '#b8a992', { style: 'stone' })]
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

  // Genshin Impact Cliff Conversion: ALL bldg-* urban boxes become stratified karst rock cliffs with lush emerald grass crowns
  if (id.startsWith('bldg-')) {
    const seed = entrySeed || hashString(id)
    const capH = Math.min(0.46, Math.max(0.28, h * 0.14))
    const cliffH = Math.max(0.4, h - capH)
    const rockPalette = ['#c6a278', '#b8946c', '#cfa97e', '#b38d68']
    const rockColor = rockPalette[seed % rockPalette.length]
    const cliffBody = sculptedCliffPillarGeo(w, cliffH, d, seed).translate(0, -capH / 2, 0)
    const grassCap = sculptedCapGeo(w * 0.515, d * 0.515, capH, seed ^ 0x2233, 10, 0.04).translate(0, h / 2 - capH / 2, 0)
    const out: Piece[] = [
      piece(cliffBody, rockColor, { roughness: 0.9, style: 'cliff' }),
      piece(grassCap, '#72b564', { roughness: 0.84, style: 'moss' }),
    ]
    // Subtle lower rock buttress hugging the base of taller cliffs (strictly below top plane)
    if (h >= 3.2) {
      const bH = h * 0.42
      const buttress = boulderBellyGeo(w * 0.44, d * 0.44, bH * 0.65, seed ^ 0x99).translate(w * 0.28, -h / 2 + bH * 0.55, d * 0.22)
      out.push(piece(buttress, '#9e7e5b', { roughness: 0.92, style: 'cliff' }))
    }
    return out
  }

  // Floating Ancient Anemo Sky Elevators (lift-l) & Rune-Stone Platforms (mover-m)
  if (id === 'mover-m' || id === 'lift-l') {
    const isLift = id === 'lift-l'
    const topH = h * 0.56
    const seed = entrySeed || hashString(id)
    // Top face stays strictly flush at y = +h/2 so player feet never float or sink
    const slab = sculptedCapGeo(w * 0.53, d * 0.53, topH, seed, 8, 0.04).translate(0, h / 2 - topH / 2, 0)
    const rimRing = new TorusGeometry(Math.min(w, d) * 0.44, 0.075, 8, 24)
      .rotateX(Math.PI / 2)
      .translate(0, h / 2 - 0.03, 0)
    const runeRing = new TorusGeometry(Math.min(w, d) * 0.28, 0.045, 6, 20)
      .rotateX(Math.PI / 2)
      .translate(0, h / 2 + 0.015, 0)
    const coreH = isLift ? Math.max(0.85, h * 1.15) : Math.max(0.55, h * 0.72)
    const core = new ConeGeometry(Math.min(w, d) * 0.34, coreH, 6)
      .rotateX(Math.PI)
      .translate(0, h / 2 - topH - coreH / 2, 0)
    const out: Piece[] = [
      piece(slab, isLift ? '#f0eadc' : '#e5dfd0', { roughness: 0.68, style: 'marble' }),
      piece(rimRing, '#deb355', { roughness: 0.32, metalness: 0.65 }),
      piece(runeRing, '#a6fff0', { emissive: '#38d9c8', roughness: 0.25 }),
      piece(core, '#58d5b8', { emissive: '#2fb8a6', roughness: 0.3, metalness: 0.2 }),
    ]
    if (isLift) {
      // 4 low corner carved brass-and-stone lantern bollards (outer corners ±1.78, open jump lanes on all 4 sides)
      const cx = w * 0.44
      const cz = d * 0.44
      for (const [sx, sz] of [
        [-cx, -cz],
        [cx, -cz],
        [-cx, cz],
        [cx, cz],
      ]) {
        out.push(
          piece(
            new CylinderGeometry(0.11, 0.15, 0.62, 6).translate(sx, h / 2 + 0.31, sz),
            '#d9b052',
            { roughness: 0.36, metalness: 0.62 },
          ),
        )
        out.push(
          piece(
            new OctahedronGeometry(0.18, 0).translate(sx, h / 2 + 0.74, sz),
            '#b8fff2',
            { emissive: '#42e3c8', roughness: 0.22 },
          ),
        )
      }
      // Center golden Anemo medallion inlay (flush on top)
      out.push(
        piece(
          new CylinderGeometry(0.42, 0.46, 0.03, 8).translate(0, h / 2 + 0.005, 0),
          '#e3ba5a',
          { roughness: 0.34, metalness: 0.65 },
        ),
      )
    } else {
      addTrim(out, '#8ff7e2', '#42c6d4', 0.35)
    }
    return out
  }

  // Organic non-monotonous Genshin/Ghibli footholds (floating mossy islands, boulders, ruins, crystal monoliths)
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
      const capH = Math.min(0.42, h * 0.55)
      const spireDepth = Math.max(2.2, Math.min(w, d) * 0.85)
      const cap = sculptedCapGeo(rx, rz, capH, seed, 10, 0.07).translate(0, h / 2 - capH / 2, 0)
      const under = floatingIslandUndersideGeo(rx * 0.92, rz * 0.92, spireDepth, seed, 10).translate(0, h / 2 - capH, 0)
      const out: Piece[] = [
        piece(cap, isFinish ? '#f7ecd0' : isCelestial ? '#ece8dc' : '#78b86a', {
          roughness: isFinish ? 0.62 : 0.84,
          style: isFinish || isCelestial ? 'marble' : 'moss',
        }),
        piece(under, isCelestial ? '#c7beab' : '#a8845f', { roughness: 0.92, style: isCelestial ? 'marble' : 'cliff' }),
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
      const capH = Math.min(0.38, Math.max(0.24, h * 0.52))
      const islandDepth = 1.35 + Math.min(w, d) * 0.55 + rng() * 0.9
      const cap = sculptedCapGeo(rx, rz, capH, seed, 9, 0.11).translate(0, h / 2 - capH / 2, 0)
      const under = floatingIslandUndersideGeo(rx * 0.9, rz * 0.9, islandDepth, seed, 9).translate(0, h / 2 - capH, 0)
      const out: Piece[] = [
        piece(cap, isCelestial ? '#e9e4d6' : '#74b866', { roughness: 0.85, style: isCelestial ? 'marble' : 'moss' }),
        piece(under, isCelestial ? '#bdb5a4' : '#b28d66', { roughness: 0.92, style: 'cliff' }),
      ]
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
        out.push(piece(vine, isCelestial ? '#d9c48c' : '#589452', { roughness: 0.88 }))
      }
      return out
    }

    if (archetype === 1) {
      const capH = Math.min(0.32, Math.max(0.2, h * 0.45))
      const bellyDepth = 0.95 + Math.min(w, d) * 0.45 + rng() * 0.55
      const cap = sculptedCapGeo(rx * 0.98, rz * 0.98, capH, seed, 7, 0.14).translate(0, h / 2 - capH / 2, 0)
      const belly = boulderBellyGeo(rx * 0.96, rz * 0.96, bellyDepth, seed).translate(0, h / 2 - capH * 0.7, 0)
      const out: Piece[] = [
        piece(cap, isCelestial ? '#dfd9cc' : '#c6a782', { roughness: 0.86, style: isCelestial ? 'marble' : 'cliff' }),
        piece(belly, isCelestial ? '#b4ad9f' : '#947657', { roughness: 0.92, style: 'cliff' }),
      ]
      const ang = rng() * Math.PI * 2
      const pr = Math.max(rx, rz) * 0.78
      const pebble = new DodecahedronGeometry(0.24 + rng() * 0.14, 0).translate(
        Math.cos(ang) * pr,
        -bellyDepth * 0.55,
        Math.sin(ang) * pr,
      )
      out.push(piece(pebble, '#a88966', { roughness: 0.9, style: 'cliff' }))
      return out
    }

    if (archetype === 2) {
      const topH = Math.min(0.34, h * 0.46)
      const midH = Math.max(0.24, h * 0.42)
      const corbelH = 0.65 + rng() * 0.55
      const out: Piece[] = [
        piece(boxAt([w, topH, d], [0, h / 2 - topH / 2, 0]), isCelestial ? '#eeeae0' : '#cabba2', {
          roughness: isCelestial ? 0.68 : 0.85,
          style: isCelestial ? 'marble' : 'stone',
        }),
        piece(boxAt([w * 0.84, midH, d * 0.84], [0, h / 2 - topH - midH / 2, 0]), isCelestial ? '#d6c8a8' : '#9c7e5d', {
          roughness: 0.9,
          style: 'cliff',
        }),
        piece(
          new CylinderGeometry(Math.min(w, d) * 0.34, Math.min(w, d) * 0.14, corbelH, 6).translate(
            0,
            h / 2 - topH - midH - corbelH / 2,
            0,
          ),
          '#7f664b',
          { roughness: 0.92, style: 'cliff' },
        ),
      ]
      addTrim(out, isCelestial ? '#e8c468' : '#74b566', isCelestial ? '#c79f42' : null, isCelestial ? 0.45 : 0.82)
      return out
    }

    if (!isHigh) {
      // Sculpted Liyue Warm Sandstone Outcrop with moss ledge (Z1-Z2)
      const capH = Math.min(0.32, Math.max(0.22, h * 0.44))
      const rockDepth = 1.15 + rng() * 0.75
      const cap = sculptedCapGeo(rx, rz, capH, seed, 8, 0.1).translate(0, h / 2 - capH / 2, 0)
      const under = floatingIslandUndersideGeo(rx * 0.92, rz * 0.92, rockDepth, seed ^ 0x41, 8).translate(0, h / 2 - capH, 0)
      return [
        piece(cap, '#d1b38b', { roughness: 0.84, style: 'stone' }),
        piece(under, '#a57f59', { roughness: 0.92, style: 'cliff' }),
      ]
    }
    // Celestial Crystal Monolith (Z3-Z4)
    const capH = Math.min(0.34, h * 0.48)
    const crystalDepth = 1.4 + rng() * 1.1
    const cap = sculptedCapGeo(rx, rz, capH, seed, 6, 0.08).translate(0, h / 2 - capH / 2, 0)
    const spire = new ConeGeometry(Math.min(rx, rz) * 0.72, crystalDepth, 6)
      .rotateX(Math.PI)
      .translate(0, h / 2 - capH - crystalDepth / 2, 0)
    return [
      piece(cap, '#f0ede4', { roughness: 0.66, style: 'marble' }),
      piece(spire, '#58d5b8', { emissive: '#38bdf8', roughness: 0.32, metalness: 0.2 }),
    ]
  }

  // Z2 Catch Deck: Liyue Warm Sandstone & Mossy Karst Terrace (replaces boxy gray metal deck)
  if (id.startsWith('deck-z2-')) {
    const out: Piece[] = [
      piece(boxAt([w, h * 0.34, d], [0, h / 2 - (h * 0.34) / 2, 0]), '#78b86a', { roughness: 0.84, style: 'moss' }),
      piece(boxAt([w * 0.98, h * 0.66, d * 0.98], [0, -h / 2 + (h * 0.66) / 2, 0]), '#c49d72', { roughness: 0.88, style: 'cliff' }),
      piece(
        floatingIslandUndersideGeo(w * 0.49, d * 0.49, Math.min(5.6, Math.max(2.6, Math.min(w, d) * 0.46)), entrySeed || 202, 10).translate(
          0,
          -h / 2,
          0,
        ),
        '#9c7a56',
        { roughness: 0.92, style: 'cliff' },
      ),
    ]
    addTrim(out, '#e4bc68')
    return out
  }

  if (id.startsWith('deck-z3-')) {
    const out: Piece[] = [
      piece(boxAt([w, h * 0.38, d], [0, h / 2 - (h * 0.38) / 2, 0]), '#78b86a', { roughness: 0.86, style: 'moss' }),
      piece(boxAt([w * 0.98, h * 0.62, d * 0.98], [0, -h / 2 + (h * 0.62) / 2, 0]), '#bfa07d', { roughness: 0.9, style: 'cliff' }),
      piece(
        floatingIslandUndersideGeo(w * 0.48, d * 0.48, Math.min(6.0, Math.max(2.6, Math.min(w, d) * 0.48)), entrySeed || 303, 10).translate(
          0,
          -h / 2,
          0,
        ),
        '#8f7254',
        { roughness: 0.92, style: 'cliff' },
      ),
    ]
    addTrim(out, '#d8be86')
    return out
  }

  if (id.startsWith('deck-z4-')) {
    const out: Piece[] = [
      piece(new BoxGeometry(w, h, d), '#f2efe8', { roughness: 0.66, style: 'marble' }),
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

  if (id === 'ground-floor') {
    const geo = new PlaneGeometry(w, d, 96, 96)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const cEarth = new Color('#9c7d57')
    const cMoss = new Color('#6fa656')
    const cMeadow = new Color('#8ec464')
    const cShadow = new Color('#587d44')
    const tmp = new Color()
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i)
      const gz = pos.getZ(i)
      const relief = groundTerrainHeight(gx, gz)
      pos.setY(i, h / 2 + relief)

      // Distance to winding dirt footpath from spawn (0,0) -> spiral tower (12,-4) & camp (-8.6, 5.4)
      const tProj = Math.max(0, Math.min(1, (gx * 12 + gz * -4) / (12 * 12 + 4 * 4)))
      const dPath = Math.hypot(gx - tProj * 12, gz - tProj * -4)
      const dCamp = Math.hypot(gx + 8.6, gz - 5.4)
      const dPlaza = Math.hypot(gx, gz)
      const dirtFactor = Math.max(
        Math.max(0, 1 - dPath / 3.4) * 0.72,
        Math.max(0, 1 - dCamp / 4.2) * 0.55,
        Math.max(0, 1 - dPlaza / 7.5) * 0.28,
      )
      const patch = 0.5 + 0.5 * Math.sin(gx * 0.14 + Math.cos(gz * 0.12) * 1.8)
      tmp.copy(cMoss).lerp(cMeadow, patch)
      if (relief < -0.1) tmp.lerp(cShadow, Math.min(0.65, -relief * 1.1))
      if (relief > 0.25) tmp.lerp(cEarth, Math.min(0.35, (relief - 0.25) * 0.9))
      tmp.lerp(cEarth, Math.min(0.9, dirtFactor))
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return [piece(geo, '#ffffff', { roughness: 0.94, style: 'earth', vertexColors: true })]
  }

  const defaultStyle: SurfaceStyle = id.includes('floor') ? 'earth' : prefab.surface === 'metal' ? 'stone' : 'cliff'
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

const RIM_COLOR = new Color('#ffe7b0')
const materials = new Map<string, MeshStandardMaterial>()

/** Injects a lightweight Genshin/Ghibli golden-hour fresnel rim highlight into standard rock/grass materials. */
function applyStylizedRim(mat: MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: RIM_COLOR }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uRimColor;',
      )
      .replace(
        '#include <dithering_fragment>',
        `float vaRim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewPosition))), 3.1);
         gl_FragColor.rgb += uRimColor * vaRim * 0.16;
         #include <dithering_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'va-genshin-rim-v1'
}

export function materialFor(p: Piece): MeshStandardMaterial {
  let m = materials.get(p.key)
  if (m == null) {
    const tex = p.style ? getSurfaceTextures(p.style) : null
    m = new MeshStandardMaterial({
      color: p.color,
      roughness: p.roughness,
      metalness: p.metalness,
      vertexColors: p.vertexColors ?? false,
      ...(tex ? { map: tex.map, bumpMap: tex.bumpMap, bumpScale: p.style === 'earth' ? 0.11 : 0.055 } : {}),
    })
    if (p.emissive) {
      m.emissive.set(p.emissive)
      m.emissiveIntensity = 1.4
    } else if (p.style === 'cliff' || p.style === 'moss' || p.style === 'earth' || p.style === 'stone' || p.style === 'marble') {
      applyStylizedRim(m)
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
