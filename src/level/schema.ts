// Level data schema (DIRECTIVE D-013, D-022; ref/03 §Data level). Single source of truth for the game, lint,
// tests and the route generator. Pure TypeScript: no three, no React (usable from vitest and Node scripts).
import type { Motion, Vec3 } from './motion.ts'

export type ColliderSpec = { type: 'box'; size: Vec3; offset: Vec3 }

/** Procedural visual for prefabs without a GLB (flat-colour stylized low-poly, D-017). */
export type ProceduralVisual = { kind: 'box' | 'blade' | 'stairs' | 'pole'; color: string; accent?: string; size?: Vec3 }

export type Prefab = {
  id: string
  /** public/ path (via assetUrl) of the GLB, or null for a procedural visual. */
  glb: string | null
  node: string | null
  kit: string
  /** uniform kit scale (ref/03 §Skala kit) */
  scale: number
  collider: ColliderSpec | null
  walkable: boolean
  surface: string
  scaleCue: boolean
  visual?: ProceduralVisual
}

export const PLATFORM_TAGS = ['route', 'rest', 'catch', 'decor', 'skip', 'discovery', 'hazard', 'floor'] as const
export type PlatformTag = (typeof PLATFORM_TAGS)[number]

export type PlatformEntry = {
  id: string
  prefab: string
  /** world position of the prefab origin (= collider centre minus collider.offset) */
  pos: Vec3
  rotY: number
  tag: PlatformTag
  precision: boolean
  landmark: boolean
  fakeSummit: boolean
  trap: null | { fork: string; safe: boolean }
  motion: Motion | null
  /** route jump from the previous route pad needs the double jump (D-038) */
  needsDoubleJump?: boolean
  /** pitch around local X (ramps of the G1 blockout only) */
  rotX?: number
  /** override for the camera-blocker world (default: static walkable colliders that are not hazards) */
  cameraBlocker?: boolean
}

export type LevelData = {
  zone: string
  seed: number | null
  /** spawn feet position (D-007: (0, 0, 0)) */
  spawn: Vec3
  /** id of the platform carrying the finish sensor (D-023, ref/04 §Collider, sensor, finish) */
  finish: string
  platforms: PlatformEntry[]
}

export type Aabb = { min: Vec3; max: Vec3 }

/** World AABB of a platform's collider at its base pose (rotY only). */
export function platformAabb(entry: PlatformEntry, prefab: Prefab): Aabb | null {
  const c = prefab.collider
  if (c == null) return null
  const s = prefab.scale
  const hx = (c.size[0] * s) / 2
  const hy = (c.size[1] * s) / 2
  const hz = (c.size[2] * s) / 2
  const cos = Math.abs(Math.cos(entry.rotY))
  const sin = Math.abs(Math.sin(entry.rotY))
  const ex = hx * cos + hz * sin
  const ez = hx * sin + hz * cos
  const ox = c.offset[0] * s * Math.cos(entry.rotY) + c.offset[2] * s * Math.sin(entry.rotY)
  const oz = -c.offset[0] * s * Math.sin(entry.rotY) + c.offset[2] * s * Math.cos(entry.rotY)
  const cx = entry.pos[0] + ox
  const cy = entry.pos[1] + c.offset[1] * s
  const cz = entry.pos[2] + oz
  return { min: [cx - ex, cy - hy, cz - ez], max: [cx + ex, cy + hy, cz + ez] }
}

/** Top-face area (m²) of a platform collider. */
export function topArea(prefab: Prefab): number {
  const c = prefab.collider
  if (c == null) return 0
  return c.size[0] * c.size[2] * prefab.scale * prefab.scale
}

/** floorAABB (D-007): footprint AABB of the route and rest platforms, expanded by `margin` (120 m for zones). */
export function floorAabb(level: LevelData, prefabs: ReadonlyMap<string, Prefab>, margin = 120): Aabb {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of level.platforms) {
    if (p.tag !== 'route' && p.tag !== 'rest') continue
    const prefab = prefabs.get(p.prefab)
    const a = prefab ? platformAabb(p, prefab) : null
    if (a == null) continue
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], a.min[i])
      max[i] = Math.max(max[i], a.max[i])
    }
  }
  return { min: [min[0] - margin, min[1], min[2] - margin], max: [max[0] + margin, max[1], max[2] + margin] }
}

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x))

/** Validates prefabs + a level (TEST-19a/19b). Returns a list of human-readable errors; empty = valid. */
export function validateLevel(level: LevelData, prefabList: readonly Prefab[]): string[] {
  const errors: string[] = []
  const prefabs = new Map<string, Prefab>()
  for (const p of prefabList) {
    if (prefabs.has(p.id)) errors.push(`duplicate prefab id ${p.id}`)
    prefabs.set(p.id, p)
    if (p.walkable && p.collider == null) errors.push(`walkable prefab ${p.id} has no collider`)
    if (p.collider != null) {
      if (p.collider.type !== 'box') errors.push(`prefab ${p.id}: collider type ${p.collider.type} is not 'box'`)
      if (!isVec3(p.collider.size) || p.collider.size.some((x) => x <= 0)) errors.push(`prefab ${p.id}: bad collider size`)
      else if (Math.min(...p.collider.size) * p.scale < 0.5 - 1e-9) errors.push(`prefab ${p.id}: collider thinner than 0.5 m (D-013)`)
      if (!isVec3(p.collider.offset)) errors.push(`prefab ${p.id}: bad collider offset`)
    }
    if (!(p.scale > 0)) errors.push(`prefab ${p.id}: scale must be > 0`)
    if (p.glb == null && p.visual == null) errors.push(`prefab ${p.id}: neither glb nor procedural visual`)
  }
  if (typeof level.zone !== 'string' || level.zone === '') errors.push('level.zone missing')
  if (!isVec3(level.spawn)) errors.push('level.spawn must be [x, y, z]')
  const ids = new Set<string>()
  for (const e of level.platforms) {
    if (ids.has(e.id)) errors.push(`duplicate platform id ${e.id}`)
    ids.add(e.id)
    const prefab = prefabs.get(e.prefab)
    if (prefab == null) {
      errors.push(`${e.id}: unknown prefab ${e.prefab}`)
      continue
    }
    if (!isVec3(e.pos)) errors.push(`${e.id}: bad pos`)
    if (typeof e.rotY !== 'number' || !Number.isFinite(e.rotY)) errors.push(`${e.id}: bad rotY`)
    if (!(PLATFORM_TAGS as readonly string[]).includes(e.tag)) errors.push(`${e.id}: unknown tag ${String(e.tag)}`)
    // tag coverage: every surface > 1 m² must carry a meaningful tag (decor is a tag too, but not for walkable surfaces)
    if (prefab.walkable && topArea(prefab) > 1 && e.tag === 'decor') errors.push(`${e.id}: walkable surface > 1 m² tagged decor`)
    if (e.motion != null) {
      const m = e.motion
      if (!['linear', 'loop', 'rotate'].includes(m.type)) errors.push(`${e.id}: bad motion type`)
      if (!(m.periodS > 0)) errors.push(`${e.id}: motion periodS must be > 0`)
      if (m.type !== 'rotate' && (!Array.isArray(m.points) || m.points.length < 2 || !m.points.every(isVec3))) errors.push(`${e.id}: motion needs ≥2 points`)
      if (m.type === 'linear' && !(m.dwellS >= 0 && m.dwellS < m.periodS / 2)) errors.push(`${e.id}: dwell must be in [0, periodS/2)`)
    }
  }
  const finish = level.platforms.find((p) => p.id === level.finish)
  if (finish == null) errors.push(`finish platform ${level.finish} not found`)
  else if (prefabs.get(finish.prefab)?.collider == null) errors.push('finish platform has no collider')
  if (!level.platforms.some((p) => p.tag === 'route')) errors.push('no route platforms')
  return errors
}

/** Route platforms in data order (the route generator and the bot follow this order). */
export function routePlatforms(level: LevelData): PlatformEntry[] {
  return level.platforms.filter((p) => p.tag === 'route')
}
