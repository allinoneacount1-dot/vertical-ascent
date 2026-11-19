// Mode Odyssey 1000 m (Fase 3 — Act II: Z5-Z8, 500 m -> 1000 m):
// - Z5 (500-625 m) Kuil Awan: Vermilion Sky Torii Gates, floating shrine terraces & Updraft Thermal columns
// - Z6 (625-750 m) Galangan Kapal Udara: Timber-canvas Ghibli airships (kinematic carry) & sky docks
// - Z7 (750-875 m) Menara Kristal Aether: Low-Gravity 0.65x field + glowing faceted crystal platforms
// - Z8 (875-1000 m) Taman Bintang: Circularly orbiting starlight platforms, Aurora ribbon & 1000 m Celestial Throne
import type { Motion, Vec3 } from './motion.ts'

export const ODYSSEY_SUMMIT_M = 1000
export const AETHER_LOW_G_ALTITUDE_M = 750
export const AETHER_GRAVITY = -13 // 0.65x of standard -20 m/s^2

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
  zone: 'z5' | 'z7'
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
  z5: [490, 635],
  z6: [620, 760],
  z7: [745, 885],
  z8: [870, 1030],
}

export const ODYSSEY_PLATFORMS: readonly OdysseyPlatformSpec[] = [
  // ---- Z5: Kuil Awan (500-625 m) ----
  { id: 'z5-torii-gate-1', zone: 'z5', kind: 'toriiGate', pos: [78, 502, -16], size: [6.5, 0.7, 5.5], rotY: 0 },
  { id: 'z5-shrine-1', zone: 'z5', kind: 'shrineTerrace', pos: [78, 526, -28], size: [6.0, 0.7, 5.2], rotY: 0.15 },
  { id: 'z5-shrine-2', zone: 'z5', kind: 'shrineTerrace', pos: [66, 558, -36], size: [5.6, 0.7, 5.0], rotY: -0.2 },
  { id: 'z5-torii-gate-2', zone: 'z5', kind: 'toriiGate', pos: [54, 592, -26], size: [6.2, 0.7, 5.4], rotY: 0.4 },
  { id: 'z5-shrine-3', zone: 'z5', kind: 'shrineTerrace', pos: [50, 622, -12], size: [6.8, 0.8, 6.2], rotY: 0 },

  // ---- Z6: Galangan Kapal Udara (625-750 m) ----
  { id: 'z6-dock-1', zone: 'z6', kind: 'skyDock', pos: [48, 646, 4], size: [7.2, 0.8, 5.4], rotY: 0.1 },
  { id: 'z6-dock-2', zone: 'z6', kind: 'skyDock', pos: [64, 688, 18], size: [7.0, 0.8, 5.2], rotY: -0.25 },
  { id: 'z6-dock-3', zone: 'z6', kind: 'skyDock', pos: [44, 728, 22], size: [6.8, 0.8, 5.6], rotY: 0.2 },
  { id: 'z6-dock-4', zone: 'z6', kind: 'skyDock', pos: [34, 750, 8], size: [7.5, 0.8, 6.8], rotY: 0 },

  // ---- Z7: Menara Kristal Aether (750-875 m, Low-Gravity 0.65x) ----
  { id: 'z7-crystal-1', zone: 'z7', kind: 'crystalSpire', pos: [34, 774, -8], size: [5.4, 0.8, 5.4], rotY: 0.3 },
  { id: 'z7-crystal-2', zone: 'z7', kind: 'crystalSpire', pos: [48, 802, -22], size: [5.0, 0.8, 5.0], rotY: -0.4 },
  { id: 'z7-crystal-3', zone: 'z7', kind: 'crystalSpire', pos: [64, 834, -14], size: [5.2, 0.8, 5.2], rotY: 0.5 },
  { id: 'z7-crystal-4', zone: 'z7', kind: 'crystalSpire', pos: [56, 868, 4], size: [6.4, 0.8, 6.4], rotY: 0 },

  // ---- Z8: Taman Bintang & Singgasana 1000 m (875-1000 m) ----
  { id: 'z8-star-deck-1', zone: 'z8', kind: 'crystalSpire', pos: [48, 902, 16], size: [6.0, 0.8, 6.0], rotY: 0.2 },
  { id: 'z8-star-deck-2', zone: 'z8', kind: 'crystalSpire', pos: [62, 948, 12], size: [6.0, 0.8, 6.0], rotY: -0.2 },
  { id: 'z8-celestial-throne', zone: 'z8', kind: 'celestialThrone', pos: [55, 1000, 0], size: [12.0, 1.0, 12.0], rotY: 0 },
]

export const ODYSSEY_UPDRAFS: readonly UpdraftThermalSpec[] = [
  { id: 'z5-updraft-1', zone: 'z5', pos: [78, 503, -22], radius: 3.4, height: 28, liftVy: 13.5 },
  { id: 'z5-updraft-2', zone: 'z5', pos: [72, 528, -32], radius: 3.4, height: 34, liftVy: 14.0 },
  { id: 'z5-updraft-3', zone: 'z5', pos: [58, 560, -31], radius: 3.6, height: 36, liftVy: 14.5 },
  { id: 'z5-updraft-4', zone: 'z5', pos: [52, 594, -18], radius: 3.6, height: 34, liftVy: 14.0 },
  { id: 'z7-updraft-aether', zone: 'z7', pos: [60, 836, -4], radius: 3.8, height: 38, liftVy: 14.5 },
]

export const ODYSSEY_MOVERS: readonly OdysseyMoverSpec[] = [
  // Z6: 2 Passing Ghibli Airships (linear ping-pong offsets from basePos)
  {
    id: 'z6-airship-1',
    zone: 'z6',
    kind: 'airship',
    basePos: [50, 666, 8],
    baseYaw: 0.3,
    size: [5.4, 0.7, 9.6],
    motion: {
      type: 'linear',
      points: [
        [0, 0, 0],
        [12, 12, 7],
      ],
      periodS: 11.0,
      phaseS: 0,
      dwellS: 1.4,
    },
  },
  {
    id: 'z6-airship-2',
    zone: 'z6',
    kind: 'airship',
    basePos: [58, 706, 20],
    baseYaw: -0.25,
    size: [5.4, 0.7, 9.6],
    motion: {
      type: 'linear',
      points: [
        [0, 0, 0],
        [-14, 12, 2],
      ],
      periodS: 12.0,
      phaseS: 3.0,
      dwellS: 1.4,
    },
  },
  // Z8: 2 Orbiting Celestial Platforms spiraling to the 1000 m Throne
  {
    id: 'z8-orbit-1',
    zone: 'z8',
    kind: 'orbitRing',
    basePos: [55, 924, 6],
    baseYaw: 0,
    size: [4.8, 0.65, 4.8],
    motion: {
      type: 'orbit',
      points: [],
      periodS: 14.0,
      phaseS: 0,
      dwellS: 0,
      orbitRadius: 9.5,
      orbitDir: 1,
    },
  },
  {
    id: 'z8-orbit-2',
    zone: 'z8',
    kind: 'orbitRing',
    basePos: [55, 972, 4],
    baseYaw: 0.4,
    size: [4.6, 0.65, 4.6],
    motion: {
      type: 'orbit',
      points: [],
      periodS: 13.0,
      phaseS: 4.0,
      dwellS: 0,
      orbitRadius: 8.5,
      orbitDir: -1,
    },
  },
]
