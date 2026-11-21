// Mode Odyssey 1000 m (Act II: Z5-Z8, 500 m -> 1000 m):
// Continuous, physics-verified ascent starting directly ahead (+Z) of Z4 summit ([78, 500, -6.7]):
// - Z5 (500-625 m) Kuil Awan: Sky Bridge + Vermilion Torii Gates + linked Updraft Thermal columns
// - Z6 (625-750 m) Galangan Kapal Udara: Timber-canvas Ghibli airships docked within jump reach of every sky dock
// - Z7 (750-875 m) Menara Kristal Aether: Low-Gravity 0.65x field + crystal terraces linked by Aether updrafts
// - Z8 (875-1000 m) Taman Bintang: Large-radius orbiting starlight rings docking cleanly onto the 1000 m Celestial Throne
import type { Motion, Vec3 } from './motion.ts'

export const ODYSSEY_SUMMIT_M = 1000
export const AETHER_LOW_G_ALTITUDE_M = 750
export const AETHER_GRAVITY = -13 // 0.65x of standard -20 m/s^2
export const Z4_SUMMIT_POS: Vec3 = [78, 500, -6.7]

export type OdysseyZone = 'z5' | 'z6' | 'z7' | 'z8'

export type OdysseyPlatformSpec = {
  id: string
  zone: OdysseyZone
  kind: 'shrineTerrace' | 'toriiGate' | 'skyDock' | 'crystalSpire' | 'celestialThrone'
  pos: Vec3
  size: Vec3
  rotY: number
}

export type UpdraftThermalSpec = {
  id: string
  zone: OdysseyZone
  pos: Vec3
  radius: number
  height: number
  liftVy: number
}

export type OdysseyMoverSpec = {
  id: string
  zone: 'z6' | 'z8'
  kind: 'airship' | 'orbitRing'
  basePos: Vec3
  baseYaw: number
  size: Vec3
  motion: Motion
}

export const ODYSSEY_ZONE_BANDS: Readonly<Record<OdysseyZone, [number, number]>> = {
  z5: [485, 640],
  z6: [615, 765],
  z7: [740, 890],
  z8: [865, 1030],
}

export const ODYSSEY_PLATFORMS: readonly OdysseyPlatformSpec[] = [
  // ---- Z5: Kuil Awan (500-625 m) — directly forward (+Z) from z4-summit [78, 500, -6.7] ----
  { id: 'z5-sky-bridge-0', zone: 'z5', kind: 'shrineTerrace', pos: [78, 501.0, -2.5], size: [4.2, 0.5, 3.8], rotY: 0 },
  { id: 'z5-torii-gate-1', zone: 'z5', kind: 'toriiGate', pos: [78, 502.2, 3.2], size: [6.8, 0.7, 5.6], rotY: 0 },
  { id: 'z5-shrine-1', zone: 'z5', kind: 'shrineTerrace', pos: [78, 526, 13.5], size: [6.2, 0.7, 5.4], rotY: 0 },
  { id: 'z5-shrine-2', zone: 'z5', kind: 'shrineTerrace', pos: [66, 558, 13.5], size: [6.0, 0.7, 5.4], rotY: 0 },
  { id: 'z5-torii-gate-2', zone: 'z5', kind: 'toriiGate', pos: [54, 592, 5.5], size: [6.4, 0.7, 5.6], rotY: 0 },
  { id: 'z5-shrine-3', zone: 'z5', kind: 'shrineTerrace', pos: [50, 622, -6.5], size: [7.0, 0.8, 6.2], rotY: 0 },

  // ---- Z6: Galangan Kapal Udara (625-750 m) ----
  { id: 'z6-dock-1', zone: 'z6', kind: 'skyDock', pos: [48, 646, 5.0], size: [7.2, 0.8, 5.6], rotY: 0 },
  { id: 'z6-dock-2', zone: 'z6', kind: 'skyDock', pos: [64, 688, 22.5], size: [7.0, 0.8, 5.6], rotY: 0 },
  { id: 'z6-dock-3', zone: 'z6', kind: 'skyDock', pos: [44, 728, 13.5], size: [6.8, 0.8, 5.6], rotY: 0 },
  { id: 'z6-dock-4', zone: 'z6', kind: 'skyDock', pos: [34, 750, 7.5], size: [7.5, 0.8, 6.8], rotY: 0 },

  // ---- Z7: Menara Kristal Aether (750-875 m, Low-Gravity 0.65x) ----
  { id: 'z7-crystal-1', zone: 'z7', kind: 'crystalSpire', pos: [34, 774, -8], size: [5.8, 0.8, 5.8], rotY: 0 },
  { id: 'z7-crystal-2', zone: 'z7', kind: 'crystalSpire', pos: [48, 802, -20], size: [5.6, 0.8, 5.6], rotY: 0 },
  { id: 'z7-crystal-3', zone: 'z7', kind: 'crystalSpire', pos: [64, 834, -14], size: [5.6, 0.8, 5.6], rotY: 0 },
  { id: 'z7-crystal-4', zone: 'z7', kind: 'crystalSpire', pos: [56, 868, 4], size: [6.6, 0.8, 6.6], rotY: 0 },

  // ---- Z8: Taman Bintang & Singgasana 1000 m (875-1000 m) ----
  { id: 'z8-star-deck-1', zone: 'z8', kind: 'crystalSpire', pos: [48, 902, 16], size: [6.4, 0.8, 6.4], rotY: 0 },
  { id: 'z8-star-deck-2', zone: 'z8', kind: 'crystalSpire', pos: [62, 948, 12], size: [6.4, 0.8, 6.4], rotY: 0 },
  { id: 'z8-celestial-throne', zone: 'z8', kind: 'celestialThrone', pos: [55, 1000, 0], size: [12.0, 1.0, 12.0], rotY: 0 },
]

export const ODYSSEY_UPDRAFS: readonly UpdraftThermalSpec[] = [
  // Z5 Kuil Awan thermal chain
  { id: 'z5-updraft-1', zone: 'z5', pos: [78, 502.2, 8.2], radius: 3.6, height: 29, liftVy: 14.5 },
  { id: 'z5-updraft-2', zone: 'z5', pos: [72, 526, 13.5], radius: 3.6, height: 37, liftVy: 14.5 },
  { id: 'z5-updraft-3', zone: 'z5', pos: [60, 558, 9.5], radius: 3.8, height: 39, liftVy: 15.0 },
  { id: 'z5-updraft-4', zone: 'z5', pos: [52, 592, -0.5], radius: 3.8, height: 35, liftVy: 14.5 },
  // Z5 -> Z6 entry & Z6 -> Z7 transition thermals
  { id: 'z6-updraft-entry', zone: 'z6', pos: [49, 622, -0.8], radius: 3.8, height: 29, liftVy: 14.5 },
  { id: 'z6-updraft-exit', zone: 'z6', pos: [39, 728, 10.5], radius: 3.8, height: 27, liftVy: 14.5 },
  // Z7 Aether Crystal thermal chain
  { id: 'z7-updraft-1', zone: 'z7', pos: [34, 750, 0.0], radius: 3.8, height: 29, liftVy: 14.5 },
  { id: 'z7-updraft-2', zone: 'z7', pos: [41, 774, -14], radius: 3.8, height: 33, liftVy: 14.5 },
  { id: 'z7-updraft-3', zone: 'z7', pos: [56, 802, -17], radius: 3.8, height: 37, liftVy: 15.0 },
  { id: 'z7-updraft-aether', zone: 'z7', pos: [60, 834, -5], radius: 3.8, height: 39, liftVy: 15.0 },
  // Z7 -> Z8 Starlight entry thermal
  { id: 'z8-updraft-entry', zone: 'z8', pos: [52, 868, 10], radius: 3.8, height: 39, liftVy: 15.0 },
]

export const ODYSSEY_MOVERS: readonly OdysseyMoverSpec[] = [
  // Z6: 2 Passing Ghibli Airships docking cleanly at both lower and upper sky docks
  {
    id: 'z6-airship-1',
    zone: 'z6',
    kind: 'airship',
    basePos: [50, 647.2, 12.0],
    baseYaw: 0,
    size: [5.4, 0.7, 9.6],
    motion: {
      type: 'linear',
      points: [
        [0, 0, 0],
        [12, 39.6, 5.0],
      ],
      periodS: 18.0,
      phaseS: 0,
      dwellS: 2.0,
    },
  },
  {
    id: 'z6-airship-2',
    zone: 'z6',
    kind: 'airship',
    basePos: [57, 689.2, 22.5],
    baseYaw: 0,
    size: [5.4, 0.7, 9.6],
    motion: {
      type: 'linear',
      points: [
        [0, 0, 0],
        [-13, 37.6, -1.5],
      ],
      periodS: 18.0,
      phaseS: 4.0,
      dwellS: 2.0,
    },
  },
  // Z8: 2 Large-radius Orbiting Celestial Platforms docking cleanly at bottom & top decks
  {
    id: 'z8-orbit-1',
    zone: 'z8',
    kind: 'orbitRing',
    basePos: [55, 924, 15],
    baseYaw: 0,
    size: [5.2, 0.65, 5.2],
    motion: {
      type: 'orbit',
      points: [],
      periodS: 22.0,
      phaseS: 0,
      dwellS: 0,
      orbitRadius: 21.0,
      orbitDir: 1,
    },
  },
  {
    id: 'z8-orbit-2',
    zone: 'z8',
    kind: 'orbitRing',
    basePos: [55, 974, 9],
    baseYaw: 0,
    size: [5.2, 0.65, 5.2],
    motion: {
      type: 'orbit',
      points: [],
      periodS: 24.0,
      phaseS: 6.0,
      dwellS: 0,
      orbitRadius: 25.0,
      orbitDir: -1,
    },
  },
]
