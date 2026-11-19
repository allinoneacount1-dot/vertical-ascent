// Selectable 3D Heroes (Tahap 3):
// 4 genuinely distinct 3D character models (3 VRoid CC0 VRM models + 1 stylized Celestia Automaton mannequin),
// all sharing VRM humanoid skeletons and all 6 UAL1 parkour animations.
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
  modelScale: number
  isAutomaton?: boolean
}

export const HEROES: readonly HeroSpec[] = [
  {
    id: 'sora',
    name: 'Sora',
    title: 'Sky Explorer (VRM F)',
    swatch: '#d8b56a',
    outfitTint: '#ffffff',
    packBody: '#4b3a2c',
    packTrim: '#d8b56a',
    modelScale: 1,
  },
  {
    id: 'kaze',
    name: 'Victoria',
    title: 'Wind Runner (VRM G)',
    swatch: '#5fd4a3',
    outfitTint: '#ffffff',
    packBody: '#1e4d3b',
    packTrim: '#72eac0',
    modelScale: 1,
  },
  {
    id: 'aoi',
    name: 'Vivi',
    title: 'Celestial Traveler (VRM E)',
    swatch: '#818cf8',
    outfitTint: '#ffffff',
    packBody: '#242b57',
    packTrim: '#ffd166',
    modelScale: 1.12,
  },
  {
    id: 'ren',
    name: 'Automaton',
    title: 'Sky Sentinel (Mannequin)',
    swatch: '#f0c975',
    outfitTint: '#f2ede0',
    packBody: '#d8a64e',
    packTrim: '#58d5b8',
    modelScale: 1,
    isAutomaton: true,
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

/** Applies the chosen hero's scale, climbing pack palette, and stylized automaton finish (for Ren). */
export function applyHeroStyle(scene: Object3D | null | undefined, heroId: HeroId): void {
  if (!scene) return
  const hero = getHeroSpec(heroId)
  scene.scale.setScalar(hero.modelScale)

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

  // 2. Stylized Celestia Ivory-and-Gold finish for the Automaton Mannequin hero
  if (hero.isAutomaton) {
    let meshIdx = 0
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (mat instanceof MeshStandardMaterial) {
          const isAccent = meshIdx % 3 === 1
          mat.color.set(isAccent ? '#e0b45c' : '#f2ede0')
          mat.roughness = isAccent ? 0.34 : 0.48
          mat.metalness = isAccent ? 0.58 : 0.18
          mat.emissive.set(isAccent ? '#2a6b62' : '#18140d')
          mat.emissiveIntensity = isAccent ? 0.35 : 0.08
        }
      }
      meshIdx++
    })
    return
  }

  // 3. Preserve original VRM face/skin/outfit textures cleanly
  tintColor.set(hero.outfitTint)
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    if (obj.parent?.name === 'protagonist-pack') return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of mats) {
      if (!mat || typeof mat !== 'object' || !('color' in mat)) continue
      const name = (mat as { name?: string }).name ?? ''
      if (SKIP_MAT_RE.test(name)) continue
      const c = (mat as { color?: Color }).color
      if (c instanceof Color) c.copy(tintColor)
    }
  })
}
