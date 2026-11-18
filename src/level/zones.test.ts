// TEST-19b (DIRECTIVE §7, unit+static, G3): the same checks as TEST-19a for every zone of the 500 m world (level/z1..z4,
// merged as the game loads them, D-055) — schema valid, every prefab exists, walkable prefabs have colliders, 100 % of
// surfaces > 1 m² tagged, the bot route generated from the 'route' tags — and prefab scales follow the recorded kit
// scale (ref/03 §Skala kit: one uniform scale per kit; scale-cue instances use it unchanged).
import { describe, expect, it } from 'vitest'
import { PLATFORM_TAGS, routePlatforms, topArea, validateLevel } from './schema.ts'
import type { LevelData, Prefab } from './schema.ts'
import { mainLevel, ZONE_FILES } from './levels.ts'
import prefabsJson from '../../level/prefabs.json'
import routeJson from '../../vitexec/routes/main.json'

const prefabs = prefabsJson as unknown as Prefab[]
const byId = new Map(prefabs.map((p) => [p.id, p]))
const main = mainLevel()
const ZONES = ['z1', 'z2', 'z3', 'z4']

describe('TEST-19b zone level data', () => {
  it('has the four zone files in order, each with its own entries', () => {
    expect(ZONE_FILES.map((z) => z.zone)).toEqual(ZONES)
    for (const z of ZONE_FILES) expect(z.platforms.length, z.zone).toBeGreaterThan(50)
  })

  it('the merged world validates against the schema with zero errors', () => {
    expect(validateLevel(main, prefabs)).toEqual([])
  })

  it('every zone validates on its own (spawn/finish borrowed from the world)', () => {
    for (const z of ZONE_FILES) {
      const level: LevelData = { zone: z.zone, seed: z.seed, spawn: main.spawn, finish: z.finish || main.finish, platforms: z.zone === 'z4' ? z.platforms : [...z.platforms, main.platforms.find((e) => e.id === main.finish)!] }
      expect(validateLevel(level, prefabs), z.zone).toEqual([])
    }
  })

  it('ids are unique across the world and every platform references an existing prefab', () => {
    const ids = main.platforms.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of main.platforms) expect(byId.has(e.prefab), e.id).toBe(true)
  })

  it('every walkable prefab has a box collider at least 0.5 m thick', () => {
    for (const p of prefabs.filter((x) => x.walkable)) {
      expect(p.collider, p.id).not.toBeNull()
      expect(p.collider?.type).toBe('box')
      expect(Math.min(...(p.collider?.size ?? [0])) * p.scale).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('100 % of surfaces larger than 1 m² carry a known tag, never decor when walkable', () => {
    for (const z of ZONE_FILES) {
      const big = z.platforms.filter((e) => topArea(byId.get(e.prefab)!) > 1)
      expect(big.length, z.zone).toBeGreaterThan(30)
      for (const e of big) {
        expect((PLATFORM_TAGS as readonly string[]).includes(e.tag), e.id).toBe(true)
        if (byId.get(e.prefab)!.walkable) expect(e.tag, e.id).not.toBe('decor')
      }
    }
  })

  it('prefab scales follow the recorded kit scale (one scale per kit; instances carry no scale of their own)', () => {
    const kitScales = new Map<string, Set<number>>()
    for (const p of prefabs) {
      if (!kitScales.has(p.kit)) kitScales.set(p.kit, new Set())
      kitScales.get(p.kit)!.add(p.scale)
    }
    for (const [kit, scales] of kitScales) expect([...scales], kit).toHaveLength(1)
    for (const e of main.platforms) expect('scale' in e, e.id).toBe(false)
  })

  it('the bot route is generated from the route tags, in order, zone by zone, ending on the finish', () => {
    const route = routeJson as unknown as { generatedBy: string; level: string; waypoints: Array<{ id: string; zone: string }> }
    expect(route.generatedBy).toBe('scripts/build-routes.mjs')
    expect(route.level).toBe('main')
    expect(route.waypoints.map((w) => w.id)).toEqual(routePlatforms(main).map((e) => e.id))
    expect(route.waypoints[route.waypoints.length - 1].id).toBe(main.finish)
    const zoneOrder = route.waypoints.map((w) => w.zone).filter((z, i, a) => i === 0 || a[i - 1] !== z)
    expect(zoneOrder).toEqual(ZONES)
  })

  it('has one landmark per zone, one fake summit, the finish at the top', () => {
    for (const z of ZONE_FILES) expect(z.platforms.filter((e) => e.landmark && !e.id.endsWith('summit')).length, z.zone).toBe(1)
    expect(main.platforms.filter((e) => e.fakeSummit)).toHaveLength(1)
    const top = Math.max(...main.platforms.filter((e) => e.tag === 'route').map((e) => e.pos[1]))
    expect(main.platforms.find((e) => e.id === main.finish)!.pos[1]).toBe(top)
  })
})
