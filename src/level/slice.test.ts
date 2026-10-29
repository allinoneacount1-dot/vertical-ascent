// TEST-19a (DIRECTIVE §7, unit+static, G2): level/slice.json is valid against the schema; every prefab exists; every
// walkable prefab has a collider; 100 % of surfaces > 1 m² carry a tag; the bot route is generated from the 'route'
// tags (vitexec/routes/slice.json matches their order and was written by scripts/build-routes.mjs).
import { describe, expect, it } from 'vitest'
import { PLATFORM_TAGS, routePlatforms, topArea, validateLevel } from './schema.ts'
import type { LevelData, Prefab } from './schema.ts'
import prefabsJson from '../../level/prefabs.json'
import sliceJson from '../../level/slice.json'
import routeJson from '../../vitexec/routes/slice.json'

const prefabs = prefabsJson as unknown as Prefab[]
const slice = sliceJson as unknown as LevelData
const byId = new Map(prefabs.map((p) => [p.id, p]))

describe('TEST-19a slice level data', () => {
  it('validates against the schema with zero errors', () => {
    expect(validateLevel(slice, prefabs)).toEqual([])
  })

  it('every platform references an existing prefab', () => {
    for (const e of slice.platforms) expect(byId.has(e.prefab), e.id).toBe(true)
  })

  it('every walkable prefab has a box collider at least 0.5 m thick', () => {
    for (const p of prefabs.filter((x) => x.walkable)) {
      expect(p.collider, p.id).not.toBeNull()
      expect(p.collider?.type).toBe('box')
      expect(Math.min(...(p.collider?.size ?? [0])) * p.scale).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('100 % of surfaces larger than 1 m² carry a known, non-decor tag when walkable', () => {
    const big = slice.platforms.filter((e) => topArea(byId.get(e.prefab)!) > 1)
    expect(big.length).toBeGreaterThan(10)
    for (const e of big) {
      expect((PLATFORM_TAGS as readonly string[]).includes(e.tag), e.id).toBe(true)
      if (byId.get(e.prefab)!.walkable) expect(e.tag, e.id).not.toBe('decor')
    }
  })

  it('has 10–20 platforms, one moving platform, one rotating hazard, a finish and a floor (G2 step 3)', () => {
    const n = slice.platforms.length
    expect(n).toBeGreaterThanOrEqual(10)
    expect(n).toBeLessThanOrEqual(20)
    expect(slice.platforms.filter((e) => e.motion?.type === 'linear' && e.tag === 'route').length).toBe(1)
    expect(slice.platforms.filter((e) => e.motion?.type === 'rotate' && e.tag === 'hazard').length).toBe(1)
    expect(slice.platforms.some((e) => e.id === slice.finish)).toBe(true)
    expect(slice.platforms.some((e) => e.tag === 'floor')).toBe(true)
  })

  it('the bot route is generated from the route tags, in order', () => {
    const route = routeJson as unknown as { generatedBy: string; level: string; waypoints: Array<{ id: string }> }
    expect(route.generatedBy).toBe('scripts/build-routes.mjs')
    expect(route.level).toBe('slice')
    expect(route.waypoints.map((w) => w.id)).toEqual(routePlatforms(slice).map((e) => e.id))
    expect(route.waypoints[route.waypoints.length - 1].id).toBe(slice.finish)
  })

  it('rejects broken data (the validator is not vacuous)', () => {
    const broken: LevelData = { ...slice, finish: 'nope', platforms: [...slice.platforms, { ...slice.platforms[1], id: slice.platforms[1].id, prefab: 'missing' }] }
    const errors = validateLevel(broken, prefabs)
    expect(errors.some((e) => e.includes('finish platform'))).toBe(true)
    expect(errors.some((e) => e.includes('duplicate platform id'))).toBe(true)
    expect(errors.some((e) => e.includes('unknown prefab'))).toBe(true)
  })
})
