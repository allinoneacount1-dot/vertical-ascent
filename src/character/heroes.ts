// Selectable 3D Ghibli Heroes (Fase 4 + Fase 6 Gelombang B):
// Each hero now loads its own distinct CC0 3D model:
// - Sora: AvatarSample_F (protagonist-f.vrm, 1.71 m)
// - Kaze: AvatarSample_G (protagonist-g.vrm, 1.74 m)
// - Aoi:  AvatarSample_E (protagonist-e.vrm, 1.41 m scaled 1.12x -> 1.58 m)
// - Ren:  UAL2 Female Mannequin (mannequin-f.glb, styled as an ivory-gold Ghibli Sky Automaton)
import { Mesh, MeshStandardMaterial } from 'three'
import type { Object3D } from 'three'

export const HERO_KEY = 'va.hero.v1'

export type HeroId = 'sora' | 'kaze' | 'aoi' | 'ren'

export type HeroSpec = {
  id: HeroId
  name: string
  title: string
  modelLabel: string
  scale: number
  swatch: string
  outfitTint: string
  packBody: string
  packTrim: string
}

export const HEROES: readonly HeroSpec[] = [
  {
    id: 'sora',
    name: 'Sora',
    title: 'Sky Explorer (Vita VRM)',
    modelLabel: 'protagonist-f.vrm',
    scale: 1,
    swatch: '#d8b56a',
    outfitTint: '#ffffff',
    packBody: '#4b3a2c',
    packTrim: '#d8b56a',
  },
  {
    id: 'kaze',
    name: 'Kaze',
    title: 'Wind Runner (Victoria VRM)',
    modelLabel: 'protagonist-g.vrm',
    scale: 1,
    swatch: '#5fd4a3',
    outfitTint: '#ffffff',
    packBody: '#1e4d3b',
    packTrim: '#72eac0',
  },
  {
    id: 'aoi',
    name: 'Aoi',
    title: 'Celestial Star (Vivi VRM)',
    modelLabel: 'protagonist-e.vrm',
    scale: 1.12,
    swatch: '#818cf8',
    outfitTint: '#ffffff',
    packBody: '#242b57',
    packTrim: '#ffd166',
  },
  {
    id: 'ren',
    name: 'Ren',
    title: 'Sky Sentinel (Automaton)',
    modelLabel: 'mannequin-f.glb',
    scale: 1,
    swatch: '#fb7185',
    outfitTint: '#f5ecd9',
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

/** Applies hero scale, climbing pack palette, and ivory-gold Ghibli automaton finish for Ren. */
export function applyHeroStyle(scene: Object3D | null | undefined, heroId: HeroId): void {
  if (!scene) return
  const hero = getHeroSpec(heroId)
  scene.scale.setScalar(hero.scale)

  // 1. Style climbing pack colors (attached to VRM humanoid chest)
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

  // 2. Give Ren (mannequin-f.glb) a stylized Laputa ivory-and-gold automaton finish
  if (heroId === 'ren') {
    let partIdx = 0
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (mat instanceof MeshStandardMaterial) {
          const isTrim = partIdx % 2 === 1
          mat.color.set(isTrim ? '#d8a64e' : '#f3ead6')
          mat.roughness = isTrim ? 0.36 : 0.48
          mat.metalness = isTrim ? 0.55 : 0.18
          mat.emissive.set('#3d2c12')
          mat.emissiveIntensity = 0.12
          partIdx++
        }
      }
    })
  }
}
