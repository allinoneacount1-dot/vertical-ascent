// Procedural visuals (DIRECTIVE D-017 stylized Ghibli/anime; D-013 visuals outside the bodies): every prefab visual is
// turned into world-space geometry pieces keyed by material, and the static ones are merged into one mesh per
// material so a world of hundreds of platforms stays at a few dozen draw calls (shadows on, ref/06 §Performa).
// Pure three.js (no React): used by Level.tsx and by tests.
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Euler, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three'
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

/** Collider size in metres (prefab scale applied). */
export const colliderSize = (p: Prefab): Vec3 => {
  const s = p.collider!.size
  return [s[0] * p.scale, s[1] * p.scale, s[2] * p.scale]
}

/** Pieces of one prefab visual in its local frame: the collider centre for collider kinds, the entry origin for 'composite'. */
export function localPieces(prefab: Prefab): Piece[] {
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

  if (id.startsWith('pad-') || id === 'finish-pad') {
    const isFinish = id === 'finish-pad'
    const isRest = id === 'pad-rest'
    const topH = Math.min(0.36, h * 0.42)
    const midH = Math.max(0.18, (h - topH) * 0.58)
    const botH = Math.max(0.12, h - topH - midH)
    const out: Piece[] = [
      piece(boxAt([w, topH, d], [0, h / 2 - topH / 2, 0]), isFinish ? '#f7ecd0' : v.color, {
        roughness: isFinish ? 0.65 : 0.82,
        style: isFinish ? 'marble' : 'stone',
      }),
      piece(boxAt([w * 0.84, midH, d * 0.84], [0, h / 2 - topH - midH / 2, 0]), isFinish ? '#d6c496' : '#7b6a58', {
        roughness: 0.9,
        style: 'stone',
      }),
      piece(boxAt([w * 0.62, botH, d * 0.62], [0, -h / 2 + botH / 2, 0]), '#574c41', { roughness: 0.92, style: 'stone' }),
    ]
    addTrim(out, isFinish ? '#ffe28a' : v.accent ?? '#9c7b48', isFinish ? '#ffcf5a' : null, isFinish ? 0.4 : 0.75)
    if (isRest || isFinish) {
      const cx = w / 2 - 0.22
      const cz = d / 2 - 0.22
      for (const [sx, sz] of [
        [-cx, -cz],
        [cx, -cz],
        [-cx, cz],
        [cx, cz],
      ]) {
        out.push(piece(boxAt([0.16, 0.08, 0.16], [sx, h / 2 + 0.04, sz]), '#fff4cc', { emissive: '#ffd36a', roughness: 0.3 }))
      }
    }
    return out
  }

  if (id.startsWith('deck-z2-')) {
    const out: Piece[] = [
      piece(new BoxGeometry(w, h, d), '#8b99a6', { roughness: 0.6, metalness: 0.25, style: 'metal' }),
      piece(boxAt([w * 0.96, 0.24, d * 0.96], [0, -h / 2 - 0.12, 0]), '#566370', { roughness: 0.7, metalness: 0.3, style: 'metal' }),
    ]
    addTrim(out, '#d8a84e')
    return out
  }

  if (id.startsWith('deck-z3-')) {
    const out: Piece[] = [
      piece(boxAt([w, h * 0.35, d], [0, h / 2 - (h * 0.35) / 2, 0]), '#88b382', { roughness: 0.92, style: 'moss' }),
      piece(boxAt([w * 0.98, h * 0.65, d * 0.98], [0, -h / 2 + (h * 0.65) / 2, 0]), '#968f84', { roughness: 0.9, style: 'stone' }),
    ]
    addTrim(out, '#c9b382')
    return out
  }

  if (id.startsWith('deck-z4-')) {
    const out: Piece[] = [
      piece(new BoxGeometry(w, h, d), '#f0eee8', { roughness: 0.68, style: 'marble' }),
      piece(boxAt([w * 0.96, 0.28, d * 0.96], [0, -h / 2 - 0.14, 0]), '#d6c8a8', { roughness: 0.75, style: 'marble' }),
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
      ...(tex ? { map: tex.map, bumpMap: tex.bumpMap, bumpScale: 0.035 } : {}),
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
    for (const p of localPieces(prefab)) {
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
