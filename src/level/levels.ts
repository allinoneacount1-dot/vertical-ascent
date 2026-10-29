// Level registry: the G2 vertical slice (default) and the G1 blockout as a DEV test level (?level=g1-blockout),
// both in the schema of src/level/schema.ts. Data files live in level/ (D-022, D-024).
import prefabsJson from '../../level/prefabs.json'
import sliceJson from '../../level/slice.json'
import { BLOCKOUT } from './blockout.ts'
import { floorAabb, routePlatforms } from './schema.ts'
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
  /** HUD target height above the spawn (m): the finish top in the slice (D-008 fake/real summit arrive in G3) */
  targetM: number
}

export const SLICE_PREFABS = prefabsJson as unknown as Prefab[]
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

function finalize(id: string, data: LevelData, prefabList: Prefab[], firstPad: Vec3, finishTop: number): LoadedLevel {
  const prefabs = new Map(prefabList.map((p) => [p.id, p]))
  const yaw = Math.atan2(-(firstPad[0] - data.spawn[0]), -(firstPad[2] - data.spawn[2]))
  const f = floorAabb(data, prefabs)
  const bounds: Aabb = { min: [f.min[0] - 10, -20, f.min[2] - 10], max: [f.max[0] + 10, Infinity, f.max[2] + 10] }
  return { id, data, prefabs, spawnYaw: yaw, bounds, targetM: Math.round(finishTop - data.spawn[1]) }
}

export function loadLevel(id: string): LoadedLevel {
  if (id === 'g1-blockout') {
    const { data, prefabs } = blockoutLevel()
    // the G1 camera faced step-a at (0, 1, -8)
    return finalize(id, data, prefabs, [0, 1, -8], 4)
  }
  const first = routePlatforms(SLICE)[0]
  const finish = SLICE.platforms.find((p) => p.id === SLICE.finish)
  return finalize('slice', SLICE, SLICE_PREFABS, first.pos, finish?.pos[1] ?? 0)
}

/** Level chosen for this page: ?level=<id> in DEV builds only, otherwise the slice. */
export function currentLevelId(): string {
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('level')
    if (q === 'g1-blockout' || q === 'slice') return q
  }
  return 'slice'
}
