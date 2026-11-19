// Selectable Ghibli 3D Heroes (Fase 4 -> upgraded in Fase 6 to 4 distinct 3D models):
// - sora: AvatarSample_F (protagonist-f.vrm, 1.71 m)
// - kaze: AvatarSample_G (protagonist-g.vrm, 1.74 m)
// - aoi:  AvatarSample_E (protagonist-e.vrm, 1.41 m scaled 1.12x -> 1.58 m)
// - ren:  UAL2 Female Mannequin (mannequin-f.glb, stylized Ghibli ivory-and-gold automaton)
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
  modelScale: number
  isAutomaton?: boolean
}

export const HEROES: readonly HeroSpec[] = [
  {
    id: 'sora',
    name: 'Sora',
    title: 'Sky Explorer (VRM F)',
    modelLabel: 'protagonist-f.vrm',
    swatch: '#d8b56a',
    packBody: '#4b3a2c',
    packTrim: '#d8b56a',
    modelScale: 1.0,
  },
  {
    id: 'kaze',
    name: 'Victoria',
    title: 'Wind Runner (VRM G)',
    modelLabel: 'protagonist-g.vrm',
    swatch: '#5fd4a3',
    packBody: '#1e4d3b',
    packTrim: '#72eac0',
    modelScale: 1.0,
  },
  {
    id: 'aoi',
    name: 'Vivi',
    title: 'Celestial Star (VRM E)',
    modelLabel: 'protagonist-e.vrm',
    swatch: '#818cf8',
    packBody: '#242b57',
    packTrim: '#ffd166',
    modelScale: 1.12,
  },
  {
    id: 'ren',
    name: 'Automaton',
    title: 'Sky Sentinel (Mannequin GLB)',
    modelLabel: 'mannequin-f.glb',
    swatch: '#fbbf24',
    packBody: '#b88635',
    packTrim: '#fef3c7',
    modelScale: 1.0,
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

/** Applies the chosen hero's climbing pack palette, scale, and Ghibli ceramic-gold finish for Automaton. */
export function applyHeroStyle(scene: Object3D | null | undefined, heroId: HeroId): void {
  if (!scene) return
  const hero = getHeroSpec(heroId)
  scene.scale.setScalar(hero.modelScale)

  // 1. Update climbing pack colors (attached to VRM humanoid spine/chest)
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

  // 2. For the Automaton mannequin GLB, apply a warm Ghibli ivory-ceramic + antique gold finish
  if (hero.isAutomaton) {
    let meshIdx = 0
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (mat instanceof MeshStandardMaterial) {
          if (meshIdx % 2 === 0) {
            mat.color.set('#efe6d2')
            mat.roughness = 0.42
            mat.metalness = 0.18
          } else {
            mat.color.set('#d8a648')
            mat.roughness = 0.34
            mat.metalness = 0.62
          }
          mat.needsUpdate = true
        }
      }
      meshIdx++
    })
  }
}
