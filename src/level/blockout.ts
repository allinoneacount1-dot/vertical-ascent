// G1 blockout (DIRECTIVE §5 G1 step 3): 10–15 boxes with one linear platform, one up-down platform,
// one stair + ramp, one thin wall. Colliders are generated from this data (D-013). Replaced by
// level/*.json + src/level/schema.ts in G2. Units: metres, +Y up, spawn feet at (0, 0, 0) (D-007).
import type { Motion, Vec3 } from './motion.ts'

export type BlockKind = 'box' | 'stairs' | 'pole'

export type Block = {
  id: string
  kind: BlockKind
  /** Box size (x, y, z) in metres. */
  size: Vec3
  /** Box centre. */
  pos: Vec3
  rotY?: number
  /** Ramp pitch around the local X axis (radians). */
  rotX?: number
  /** Physics collider (closed box, thickness ≥0.5 m). Stairs and poles are visual only. */
  collider: boolean
  /** Included in the simplified camera-blocker world (D-014). */
  cameraBlocker: boolean
  tag: 'route' | 'rest' | 'decor' | 'wall' | 'floor'
  motion?: Motion
  color: string
}

const RAMP_LENGTH = 3.6
const RAMP_RISE = 2
const RAMP_ANGLE = Math.atan2(RAMP_RISE, RAMP_LENGTH) // ≈ 29°, ≤ 40° (D-013)
const RAMP_SLAB = Math.hypot(RAMP_LENGTH, RAMP_RISE)

export const SPAWN: Vec3 = [0, 0, 0]
/** First route pad; the spawn camera faces it (D-007). */
export const FIRST_ROUTE_PAD: Vec3 = [0, 1, -8]

export const BLOCKOUT: readonly Block[] = [
  { id: 'floor', kind: 'box', size: [80, 1, 80], pos: [0, -0.5, 0], collider: true, cameraBlocker: true, tag: 'floor', color: '#5d6b7a' },
  // route: two static steps
  { id: 'step-a', kind: 'box', size: [4, 1, 4], pos: [0, 0.5, -8], collider: true, cameraBlocker: true, tag: 'route', color: '#c9b37e' },
  { id: 'step-b', kind: 'box', size: [3, 1, 3], pos: [0, 1.5, -13], collider: true, cameraBlocker: true, tag: 'route', color: '#c9b37e' },
  // stair (visual) over a ramp collider, leading to a landing
  {
    id: 'ramp',
    kind: 'box',
    size: [2, 0.5, RAMP_SLAB],
    pos: [7, RAMP_RISE / 2 - 0.25 * Math.cos(RAMP_ANGLE), -4 - RAMP_LENGTH / 2],
    rotX: RAMP_ANGLE,
    collider: true,
    cameraBlocker: true,
    tag: 'route',
    color: '#8fa3b8',
  },
  { id: 'stairs-visual', kind: 'stairs', size: [2, RAMP_RISE, RAMP_LENGTH], pos: [7, RAMP_RISE / 2, -4 - RAMP_LENGTH / 2], collider: false, cameraBlocker: false, tag: 'decor', color: '#b7c4d1' },
  { id: 'landing', kind: 'box', size: [4, 1, 4], pos: [7, RAMP_RISE - 0.5, -4 - RAMP_LENGTH - 2], collider: true, cameraBlocker: true, tag: 'rest', color: '#c9b37e' },
  // linear mover: 8 m along X at 2 m/s (half period 5 s − 1 s dwell = 4 s travel)
  {
    id: 'mover-linear',
    kind: 'box',
    size: [3, 0.5, 3],
    pos: [-6, 1.75, -10],
    collider: true,
    cameraBlocker: false,
    tag: 'route',
    color: '#e0894f',
    motion: { type: 'linear', points: [[0, 0, 0], [-8, 0, 0]], periodS: 10, phaseS: 0, dwellS: 1 },
  },
  // up-down mover: 4 m along Y at 1 m/s
  {
    id: 'mover-lift',
    kind: 'box',
    size: [3, 0.5, 3],
    pos: [-6, 0.25, -3],
    collider: true,
    cameraBlocker: false,
    tag: 'route',
    color: '#e0894f',
    motion: { type: 'linear', points: [[0, 0, 0], [0, 4, 0]], periodS: 10, phaseS: 0, dwellS: 1 },
  },
  { id: 'high-pad', kind: 'box', size: [3, 1, 3], pos: [-6, 3.5, 1.5], collider: true, cameraBlocker: true, tag: 'rest', color: '#c9b37e' },
  // walls: thin (0.5 m) and thick; a corner for camera orbit tests
  { id: 'wall-thin', kind: 'box', size: [0.5, 3, 6], pos: [9, 1.5, 6], collider: true, cameraBlocker: true, tag: 'wall', color: '#9aa7b4' },
  { id: 'wall-thick', kind: 'box', size: [2, 4, 10], pos: [-14, 2, 8], collider: true, cameraBlocker: true, tag: 'wall', color: '#9aa7b4' },
  { id: 'wall-corner', kind: 'box', size: [8, 4, 2], pos: [-10, 2, 14], collider: true, cameraBlocker: true, tag: 'wall', color: '#9aa7b4' },
  // 10 cm pole: visual only, never a camera blocker (TEST-10 strafe check)
  { id: 'pole', kind: 'pole', size: [0.1, 3, 0.1], pos: [3, 1.5, 4], collider: false, cameraBlocker: false, tag: 'decor', color: '#2b2f36' },
]
