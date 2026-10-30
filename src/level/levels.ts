// Level registry: the 500 m world 'main' (z1–z4 merged, default, D-055), the G2 vertical slice and the G1 blockout
// as DEV test levels (?level=slice, ?level=g1-blockout), all in the schema of src/level/schema.ts. Data files live in
// level/ (D-022, D-024); z1–z4 come from tools/level-gen.mjs and are committed data, never generated at runtime.
import prefabsJson from '../../level/prefabs.json'
import sliceJson from '../../level/slice.json'
import z1Json from '../../level/z1.json'
import z2Json from '../../level/z2.json'
import z3Json from '../../level/z3.json'
import z4Json from '../../level/z4.json'
import { BLOCKOUT } from './blockout.ts'
import { floorAabb, platformAabb, routePlatforms } from './schema.ts'
import type { Aabb, LevelData, Prefab } from './schema.ts'
import type { Vec3 } from './motion.ts'

export type LoadedLevel = {
  id: string
  data: LevelData
  prefabs: ReadonlyMap<string, Prefab>
  /** camera yaw from the spawn toward the first route pad (D-007) */
  spawnYaw: number
  /** kill-plane bounds (D-007): floorAABB expanded by 10 m */
  bounds: Aabb
  /** real summit: finish top above the spawn (m) */
  summitM: number
  /** fake summit plateau top above the spawn (m), or null for levels without one (D-008, ref/03 §Puncak palsu) */
  fakeSummitM: number | null
  /** zone of every entry id (main: the zone file it came from) */
  zoneOf: ReadonlyMap<string, string>
}

/** One zone file as written by tools/level-gen.mjs (spawn and finish only in the first/last zone). */
type ZoneFile = Omit<LevelData, 'spawn'> & { spawn: LevelData['spawn'] | null; routeOrder?: string[] }
export const ZONE_FILES = [z1Json, z2Json, z3Json, z4Json] as unknown as ZoneFile[]

export const SLICE_PREFABS = prefabsJson as unknown as Prefab[]
/** prefabs.json holds the slice prefabs and the generated world prefabs (D-022). */
export const PREFABS = SLICE_PREFABS
export const SLICE = sliceJson as unknown as LevelData

/** The G1 blockout expressed in the level schema (one prefab per block; pos = box centre, offset 0). */
export function blockoutLevel(): { data: LevelData; prefabs: Prefab[] } {
  const prefabs: Prefab[] = BLOCKOUT.map((b) => ({
    id: `g1-${b.id}`,
    glb: null,
    node: null,
    kit: 'procedural',
    scale: 1,
    collider: b.collider ? { type: 'box', size: b.size, offset: [0, 0, 0] } : null,
    walkable: b.collider && b.tag !== 'wall',
    surface: 'concrete',
    scaleCue: false,
    visual: { kind: b.kind === 'box' ? 'box' : b.kind, color: b.color, size: b.size },
  }))
  const data: LevelData = {
    zone: 'g1-blockout',
    seed: null,
    spawn: [0, 0, 0],
    finish: '', // no finish sensor in the G1 test level
    platforms: BLOCKOUT.map((b) => ({
      id: b.id,
      prefab: `g1-${b.id}`,
      pos: b.pos,
      rotY: b.rotY ?? 0,
      rotX: b.rotX,
      tag: b.tag === 'wall' ? 'decor' : b.tag,
      precision: false,
      landmark: false,
      fakeSummit: false,
      trap: null,
      motion: b.motion ?? null,
      cameraBlocker: b.cameraBlocker,
    })),
  }
  return { data, prefabs }
}

/** The four zones merged into one level: spawn from z1, finish from z4, entries in zone order (D-055). */
export function mainLevel(): LevelData {
  const [first] = ZONE_FILES
  const last = ZONE_FILES[ZONE_FILES.length - 1]
  return {
    zone: 'main',
    seed: first.seed,
    spawn: first.spawn ?? [0, 0, 0],
    finish: last.finish,
    platforms: ZONE_FILES.flatMap((z) => z.platforms),
  }
}

function finalize(id: string, data: LevelData, prefabList: Prefab[], firstPad: Vec3, zoneOf: ReadonlyMap<string, string>): LoadedLevel {
  const prefabs = new Map(prefabList.map((p) => [p.id, p]))
  const yaw = Math.atan2(-(firstPad[0] - data.spawn[0]), -(firstPad[2] - data.spawn[2]))
  const f = floorAabb(data, prefabs)
  const bounds: Aabb = { min: [f.min[0] - 10, -20, f.min[2] - 10], max: [f.max[0] + 10, Infinity, f.max[2] + 10] }
  const finish = data.platforms.find((p) => p.id === data.finish)
  const fake = data.platforms.find((p) => p.fakeSummit)
  const above = (y: number) => Math.round(y - data.spawn[1])
  return {
    id,
    data,
    prefabs,
    spawnYaw: yaw,
    bounds,
    summitM: finish ? above(finish.pos[1]) : 4,
    fakeSummitM: fake ? above(fake.pos[1]) : null,
    zoneOf,
  }
}

export function loadLevel(id: string): LoadedLevel {
  if (id === 'g1-blockout') {
    const { data, prefabs } = blockoutLevel()
    // the G1 camera faced step-a at (0, 1, -8)
    return finalize(id, data, prefabs, [0, 1, -8], new Map(data.platforms.map((p) => [p.id, 'g1-blockout'])))
  }
  if (id === 'slice') return finalize('slice', SLICE, PREFABS, routePlatforms(SLICE)[0].pos, new Map(SLICE.platforms.map((p) => [p.id, 'slice'])))
  const data = mainLevel()
  const zoneOf = new Map(ZONE_FILES.flatMap((z) => z.platforms.map((p) => [p.id, z.zone] as const)))
  // the first route entry is the spawn deck itself: face the first pad off it
  const prefabs = new Map(PREFABS.map((p) => [p.id, p]))
  const off = routePlatforms(data).find((e) => {
    const a = platformAabb(e, prefabs.get(e.prefab)!)
    return a == null || !(data.spawn[0] > a.min[0] && data.spawn[0] < a.max[0] && data.spawn[2] > a.min[2] && data.spawn[2] < a.max[2])
  })
  return finalize('main', data, PREFABS, (off ?? routePlatforms(data)[0]).pos, zoneOf)
}

/** Level chosen for this page: ?level=<id> in DEV builds only (older tests pin the slice), otherwise the world. */
export function currentLevelId(): string {
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('level')
    if (q === 'g1-blockout' || q === 'slice' || q === 'main') return q
  }
  return 'main'
}
