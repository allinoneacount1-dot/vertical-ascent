// Selectable Ghibli Heroes (Fase 4):
// Restyles protagonist-f.vrm clothing/accessories & climbing pack in real time with zero extra VRM downloads,
// preserving skin/face textures, 167-mesh TEST-03 contract, and all 6 UAL1 animations.
import { Color, Mesh, MeshStandardMaterial } from 'three'
import type { Object3D } from 'three'

export const HERO_KEY = 'va.hero.v1'

export type HeroId = 'sora' | 'kaze' | 'aoi' | 'ren'

export type HeroSpec = {
  id: HeroId
  name: string
  title: string
  swatch: string
  outfitTint: string
  packBody: string
  packTrim: string
}

export const HEROES: readonly HeroSpec[] = [
  {
    id: 'sora',
    name: 'Sora',
    title: 'Sky Explorer',
    swatch: '#d8b56a',
    outfitTint: '#ffffff',
    packBody: '#4b3a2c',
    packTrim: '#d8b56a',
  },
  {
    id: 'kaze',
    name: 'Kaze',
    title: 'Wind Runner',
    swatch: '#5fd4a3',
    outfitTint: '#b8ebd4',
    packBody: '#1e4d3b',
    packTrim: '#72eac0',
  },
  {
    id: 'aoi',
    name: 'Aoi',
    title: 'Celestial Star',
    swatch: '#818cf8',
    outfitTint: '#c7d2fe',
    packBody: '#242b57',
    packTrim: '#ffd166',
  },
  {
    id: 'ren',
    name: 'Ren',
    title: 'Sunset Climber',
    swatch: '#fb7185',
    outfitTint: '#ffd6cc',
    packBody: '#6e2632',
    packTrim: '#fde68a',
  },
]

const HERO_MAP = new Map<HeroId, HeroSpec>(HEROES.map((h) => [h.id, h]))

export function getHeroSpec(id: HeroId): HeroSpec {
  return HERO_MAP.get(id) ?? HEROES[0]
}

export function loadHeroId(): HeroId {
  try {
    if (typeof localStorage === 'undefined') return 'sora'
    const raw = localStorage.getItem(HERO_KEY) as HeroId | null
    if (raw && HERO_MAP.has(raw)) return raw
    return 'sora'
  } catch {
    return 'sora'
  }
}

export function saveHeroId(id: HeroId): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(HERO_KEY, id)
  } catch {
    // ignore storage errors
  }
}

const SKIP_MAT_RE = /(skin|face|eye|brow|lash|mouth|tooth|tongue|body_00)/i
const tintColor = new Color()

/** Applies the chosen hero's palette to the climbing pack & non-skin VRM clothing materials. */
export function applyHeroStyle(scene: Object3D | null | undefined, heroId: HeroId): void {
  if (!scene) return
  const hero = getHeroSpec(heroId)
  tintColor.set(hero.outfitTint)

  // 1. Update climbing pack colors
  const pack = scene.getObjectByName('protagonist-pack')
  if (pack) {
    let idx = 0
    pack.traverse((obj) => {
      if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial) {
        obj.material.color.set(idx === 0 ? hero.packBody : hero.packTrim)
        idx++
      }
    })
  }

  // 2. Gently tint non-skin VRM outfit materials while preserving base textures
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    if (obj.parent?.name === 'protagonist-pack') return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of mats) {
      if (!mat || typeof mat !== 'object' || !('color' in mat)) continue
      const name = (mat as { name?: string }).name ?? ''
      if (SKIP_MAT_RE.test(name)) continue
      const c = (mat as { color?: Color }).color
      if (c instanceof Color) {
        c.copy(tintColor)
      }
    }
  })
}
