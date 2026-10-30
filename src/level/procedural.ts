// Procedural visuals (DIRECTIVE D-017 stylized flat colour; D-013 visuals outside the bodies): every prefab visual is
// turned into world-space geometry pieces keyed by material, and the static ones are merged into one mesh per
// material so a world of hundreds of platforms stays at a few dozen draw calls (shadows on, ref/06 §Performa).
// Pure three.js (no React): used by Level.tsx and by tests.
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Euler, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import type { Group } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PlatformEntry, Prefab, ProceduralPart } from './schema.ts'
import type { Vec3 } from './motion.ts'

export type Piece = { geometry: BufferGeometry; key: string; color: string; emissive: string | null; roughness: number; metalness: number }

const ROTATION_ORDER = 'YXZ'
const TRIM = 0.12

const key = (color: string, emissive: string | null, roughness: number, metalness: number) => `${color}|${emissive ?? ''}|${roughness}|${metalness}`

function piece(geometry: BufferGeometry, color: string, opts: { emissive?: string | null; roughness?: number; metalness?: number } = {}): Piece {
  const emissive = opts.emissive ?? null
  const roughness = opts.roughness ?? 0.85
  const metalness = opts.metalness ?? 0
  return { geometry, color, emissive, roughness, metalness, key: key(color, emissive, roughness, metalness) }
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
    // visual steps over a ramp collider (D-013: stairs are visual only); the collider is the inclined box
    const steps = Math.max(2, Math.round(d / 0.35))
    const rise = h / steps
    const depth = d / steps
    const out: Piece[] = []
    for (let i = 0; i < steps; i++) out.push(piece(boxAt([w, (i + 1) * rise, depth], [0, -h / 2 + ((i + 1) * rise) / 2, d / 2 - (i + 0.5) * depth]), v.color, { roughness: 0.9 }))
    return out
  }
  if (v.kind === 'pole') return [piece(new CylinderGeometry(w / 2, w / 2, h, 12), v.color)]
  if (v.kind === 'blade') {
    const bands = 6
    const out = [piece(new BoxGeometry(w, h, d), v.color, { roughness: 0.5, metalness: 0.3 })]
    for (let i = 0; i < bands; i++) out.push(piece(boxAt([w * 1.04, (h / bands) * 0.45, d * 1.04], [0, -h / 2 + (h / bands) * (i + 0.5), 0]), v.accent ?? '#f2c94c', { roughness: 0.6 }))
    return out
  }
  // box with a trim around the top edge (walkable grammar, ref/03: shape cue, not colour only)
  const out = [piece(new BoxGeometry(w, h, d), v.color)]
  if (v.accent != null) {
    const y = h / 2 + 0.02
    out.push(piece(boxAt([w, 0.04, TRIM], [0, y, d / 2 - TRIM / 2]), v.accent))
    out.push(piece(boxAt([w, 0.04, TRIM], [0, y, -d / 2 + TRIM / 2]), v.accent))
    out.push(piece(boxAt([TRIM, 0.04, d - 2 * TRIM], [w / 2 - TRIM / 2, y, 0]), v.accent))
    out.push(piece(boxAt([TRIM, 0.04, d - 2 * TRIM], [-w / 2 + TRIM / 2, y, 0]), v.accent))
  }
  return out
}

function partPiece(p: ProceduralPart): Piece {
  let g: BufferGeometry
  if (p.shape === 'cylinder') g = new CylinderGeometry(p.size[2] ?? p.size[0], p.size[0], p.size[1], p.segments ?? 16)
  else if (p.shape === 'cone') g = new ConeGeometry(p.size[0], p.size[1], p.segments ?? 16)
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
    m = new MeshStandardMaterial({ color: p.color, roughness: p.roughness, metalness: p.metalness })
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
    if (prefab == null || e.motion != null) continue
    const m = visualMatrix(e, prefab)
    for (const p of localPieces(prefab)) {
      const g = p.geometry.applyMatrix4(m)
      // merged meshes need the same attribute set: drop uv-less differences by keeping position/normal/uv everywhere
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
