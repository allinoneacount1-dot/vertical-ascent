// Selectable 3D Ghibli Heroes (Fase 6 — Gelombang B):
// 4 distinct 3D models: Sora (protagonist-f.vrm), Kaze/Victoria (protagonist-g.vrm),
// Aoi/Vivi (protagonist-e.vrm, normalized 1.12x -> 1.58 m), and Ren (Quaternius Sky Automaton mannequin).
import { Mesh, MeshStandardMaterial } from 'three'
import type { Object3D } from 'three'

export const HERO_KEY = 'va.hero.v1'

export type HeroId = 'sora' | 'kaze' | 'aoi' | 'ren'

export type HeroSpec = {
  id: HeroId
  name: string
  title: string
  modelLabel: string
  swatch: string
  packBody: string
  packTrim: string
  scale: number
  isAutomaton?: boolean
}

export const HEROES: readonly HeroSpec[] = [
  {
    id: 'sora',
    name: 'Sora',
    title: 'Sky Explorer (VRM Vita)',
    modelLabel: 'protagonist-f.vrm',
    swatch: '#d8b56a',
    packBody: '#4b3a2c',
    packTrim: '#d8b56a',
    scale: 1.0,
  },
  {
    id: 'kaze',
    name: 'Kaze',
    title: 'Wind Runner (VRM Victoria)',
    modelLabel: 'protagonist-g.vrm',
    swatch: '#5fd4a3',
    packBody: '#1e4d3b',
    packTrim: '#72eac0',
    scale: 1.0,
  },
  {
    id: 'aoi',
    name: 'Aoi',
    title: 'Celestial Traveler (VRM Vivi)',
    modelLabel: 'protagonist-e.vrm',
    swatch: '#818cf8',
    packBody: '#242b57',
    packTrim: '#ffd166',
    scale: 1.12,
  },
  {
    id: 'ren',
    name: 'Ren',
    title: 'Sky Automaton (Mannequin)',
    modelLabel: 'automaton-mannequin',
    swatch: '#f3d9a4',
    packBody: '#6e2632',
    packTrim: '#fde68a',
    scale: 1.0,
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

/** Applies scale normalization, climbing pack palette, and Automaton ceramic/gold finish for Ren. */
export function applyHeroStyle(scene: Object3D | null | undefined, heroId: HeroId): void {
  if (!scene) return
  const hero = getHeroSpec(heroId)
  scene.scale.setScalar(hero.scale)

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

  if (hero.isAutomaton) {
    let meshIdx = 0
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (mat instanceof MeshStandardMaterial) {
          const isAccent = meshIdx % 2 === 1
          mat.color.set(isAccent ? '#d8b56a' : '#f2ead8')
          mat.roughness = isAccent ? 0.35 : 0.55
          mat.metalness = isAccent ? 0.65 : 0.15
          mat.emissive.set(isAccent ? '#5fd4a3' : '#2a2216')
          mat.emissiveIntensity = isAccent ? 0.18 : 0.05
        }
      }
      meshIdx++
    })
  }
}
