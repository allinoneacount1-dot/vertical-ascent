// 12 Hidden Sky Relics (Golden Origami Spirit Birds) across z1-z4 (Fase 1)
// Placed on rewarding sculptural & risk-reward spots without obstructing any TEST-37 sightline.
export const RELICS_KEY = 'va.relics.v1'

export type SkyRelicSpec = {
  id: string
  zone: 'z1' | 'z2' | 'z3' | 'z4'
  name: string
  pos: [number, number, number]
}

export const SKY_RELICS: readonly SkyRelicSpec[] = [
  // z1 (3 relics)
  { id: 'relic-z1-spiral', zone: 'z1', name: 'Village Tower Crest', pos: [12.0, 12.6, -4.0] },
  { id: 'relic-z1-bridge', zone: 'z1', name: 'Bridge Wind Feather', pos: [-9.0, 16.4, -18.0] },
  { id: 'relic-z1-plaza', zone: 'z1', name: 'Canopy Courtyard Charm', pos: [8.5, 4.2, -4.5] },
  // z2 (3 relics)
  { id: 'relic-z2-spiral', zone: 'z2', name: 'Mill Spire Origami', pos: [24.0, 75.4, 18.0] },
  { id: 'relic-z2-root', zone: 'z2', name: 'Twisted Bark Spirit', pos: [22.0, 169.8, -42.0] },
  { id: 'relic-z2-gear', zone: 'z2', name: 'Clockwork Feather', pos: [44.9, 173.4, -34.0] },
  // z3 (3 relics)
  { id: 'relic-z3-root', zone: 'z3', name: 'Laputa Canopy Gem', pos: [16.0, 210.4, 20.0] },
  { id: 'relic-z3-lantern', zone: 'z3', name: 'Cloud Lantern Wish', pos: [-38.0, 261.6, -10.0] },
  { id: 'relic-z3-arch', zone: 'z3', name: 'Broken Arch Crown', pos: [47.5, 322.8, -55.0] },
  // z4 (3 relics)
  { id: 'relic-z4-lantern', zone: 'z4', name: 'Twilight Lantern Bell', pos: [58.0, 473.6, -18.0] },
  { id: 'relic-z4-arch', zone: 'z4', name: 'Starlight Arch Crest', pos: [69.0, 486.8, -17.2] },
  { id: 'relic-z4-summit', zone: 'z4', name: 'Summit Sky Feather', pos: [73.4, 488.6, -13.0] },
]

export function loadCollectedRelics(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set()
    const raw = localStorage.getItem(RELICS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    const validIds = new Set(SKY_RELICS.map((r) => r.id))
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && validIds.has(id)))
  } catch {
    return new Set()
  }
}

export function saveCollectedRelics(collected: ReadonlySet<string>): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(RELICS_KEY, JSON.stringify([...collected]))
  } catch {
    // ignore storage quota / private mode
  }
}
