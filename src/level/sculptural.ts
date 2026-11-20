// Sculptural Ghibli Non-Box Geometry & Organic Challenges (z1-z4):
// 1. Broken Stone Spiral Stairs (z1-z2) — ExtrudeGeometry curved wedge treads around a mossy stone tower with 1-2 gaps
// 2. Swaying Rope Bridge (z1-z2) — Catenary wooden planks + TubeGeometry ropes with missing-plank gaps & gentle sway
// 3. Giant Twisting Tree Root (z2-z3) — CatmullRomCurve3 + TubeGeometry ascending root with narrowing flat-top moss steps
// 4. Vertical Gear Wheel (z2) — ExtrudeGeometry toothed wood/copper wheel with orbiting flat-top tooth treads & carry momentum
// 5. Pendulum Paper Lanterns (z2-z4) — LatheGeometry flat-top lantern roof + emissive core swinging on a long rope
// 6. Broken Stone Arch & Asymmetric Faceted Floating Stones (z3-z4) — Architectural framing toward the 500 m summit
// Pure Three.js builders + shared material/geometry cache for low draw calls (60 FPS budget).
import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  MeshStandardMaterial,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import type { Motion, Vec3 } from './motion.ts'
import { getSurfaceTextures } from './textures.ts'
import type { SurfaceStyle } from './textures.ts'

export type SculpturalKind =
  | 'spiralStairs'
  | 'ropeBridge'
  | 'giantRoot'
  | 'verticalGear'
  | 'pendulumLantern'
  | 'brokenArch'
  | 'facetedRock'

export type ProxyBox = {
  id: string
  pos: Vec3
  size: Vec3
  rotY: number
  rotX?: number
}

export type SpiralStairsSpec = {
  id: string
  zone: 'z1' | 'z2' | 'z3' | 'z4'
  kind: 'spiralStairs'
  pos: Vec3
  towerRadius: number
  outerRadius: number
  towerHeight: number
  stepCount: number
  startAngle: number
  totalSweepRad: number
  brokenIndices: number[]
}

export type RopeBridgeSpec = {
  id: string
  zone: 'z1' | 'z2'
  kind: 'ropeBridge'
  start: Vec3
  end: Vec3
  sagM: number
  plankCount: number
  plankWidth: number
  missingIndices: number[]
  swayPeriodS: number
  swayAmpRad: number
}

export type GiantRootSpec = {
  id: string
  zone: 'z2' | 'z3'
  kind: 'giantRoot'
  points: Vec3[]
  baseRadius: number
  topRadius: number
  stepCount: number
}

export type VerticalGearSpec = {
  id: string
  zone: 'z2'
  kind: 'verticalGear'
  pos: Vec3
  rotY: number
  radius: number
  thickness: number
  toothCount: number
  treadCount: number
  periodS: number
  dir: 1 | -1
}

export type PendulumLanternSpec = {
  id: string
  zone: 'z2' | 'z3' | 'z4'
  kind: 'pendulumLantern'
  /** Equilibrium (lowest) center of the flat walkable lantern roof. */
  pos: Vec3
  rotY: number
  roofRadius: number
  ropeLen: number
  swingAmp: number
  periodS: number
  phaseS: number
}

export type BrokenArchSpec = {
  id: string
  zone: 'z3' | 'z4'
  kind: 'brokenArch'
  pos: Vec3
  /** Yaw oriented so the arch opening frames the 500 m summit. */
  rotY: number
  span: number
  archHeight: number
  thickness: number
  stepCount: number
}

export type FacetedRockSpec = {
  id: string
  zone: 'z3' | 'z4'
  kind: 'facetedRock'
  pos: Vec3
  rotY: number
  radius: number
  depth: number
  seed: number
}

export type SculpturalSpec =
  | SpiralStairsSpec
  | RopeBridgeSpec
  | GiantRootSpec
  | VerticalGearSpec
  | PendulumLanternSpec
  | BrokenArchSpec
  | FacetedRockSpec

const SUMMIT_POS: Vec3 = [78, 500, -6.7]

function yawToward(from: Vec3, target: Vec3): number {
  return Math.atan2(target[0] - from[0], target[2] - from[2])
}

/** All sculptural non-box structures across z1-z4, placed alongside the main course with landmark framing. */
export const SCULPTURAL_SPECS: readonly SculpturalSpec[] = [
  // ---- 1. Tangga Spiral Batu Patah Berkelanjutan (z1 -> z4 menuju Puncak 500 m) ----
  {
    id: 'z1-spiral-tower',
    zone: 'z1',
    kind: 'spiralStairs',
    pos: [12.0, 0.0, -4.0],
    towerRadius: 1.55,
    outerRadius: 3.65,
    towerHeight: 11.8,
    stepCount: 16,
    startAngle: -Math.PI * 0.35,
    totalSweepRad: Math.PI * 2.15,
    brokenIndices: [5, 11],
  },
  {
    id: 'z1-spiral-tower-2',
    zone: 'z1',
    kind: 'spiralStairs',
    pos: [18.0, 13.5, -16.0],
    towerRadius: 1.65,
    outerRadius: 3.85,
    towerHeight: 22.0,
    stepCount: 28,
    startAngle: 0.25,
    totalSweepRad: Math.PI * 3.8,
    brokenIndices: [7, 15, 22],
  },
  {
    id: 'z1-spiral-tower-3',
    zone: 'z1',
    kind: 'spiralStairs',
    pos: [24.0, 36.2, 4.0],
    towerRadius: 1.65,
    outerRadius: 3.85,
    towerHeight: 26.6,
    stepCount: 34,
    startAngle: -0.6,
    totalSweepRad: Math.PI * 4.5,
    brokenIndices: [6, 14, 21, 28],
  },
  {
    id: 'z2-spiral-tower',
    zone: 'z2',
    kind: 'spiralStairs',
    pos: [24.0, 62.8, 18.0],
    towerRadius: 1.55,
    outerRadius: 3.65,
    towerHeight: 11.8,
    stepCount: 16,
    startAngle: Math.PI * 0.2,
    totalSweepRad: Math.PI * 2.1,
    brokenIndices: [6, 12],
  },
  {
    id: 'z2-spiral-tower-2',
    zone: 'z2',
    kind: 'spiralStairs',
    pos: [30.0, 77.0, 2.0],
    towerRadius: 1.75,
    outerRadius: 3.95,
    towerHeight: 48.0,
    stepCount: 56,
    startAngle: 0.4,
    totalSweepRad: Math.PI * 7.2,
    brokenIndices: [8, 17, 26, 35, 44, 51],
  },
  {
    id: 'z3-spiral-tower-1',
    zone: 'z3',
    kind: 'spiralStairs',
    pos: [34.0, 125.0, -14.0],
    towerRadius: 1.8,
    outerRadius: 4.05,
    towerHeight: 62.0,
    stepCount: 68,
    startAngle: -0.5,
    totalSweepRad: Math.PI * 8.6,
    brokenIndices: [9, 19, 29, 39, 49, 59],
  },
  {
    id: 'z3-spiral-tower-2',
    zone: 'z3',
    kind: 'spiralStairs',
    pos: [40.0, 188.0, 8.0],
    towerRadius: 1.8,
    outerRadius: 4.05,
    towerHeight: 62.0,
    stepCount: 70,
    startAngle: 0.7,
    totalSweepRad: Math.PI * 8.8,
    brokenIndices: [10, 21, 32, 43, 54, 63],
  },
  {
    id: 'z4-spiral-tower-1',
    zone: 'z4',
    kind: 'spiralStairs',
    pos: [48.0, 250.0, -10.0],
    towerRadius: 1.85,
    outerRadius: 4.1,
    towerHeight: 110.0,
    stepCount: 112,
    startAngle: 0.1,
    totalSweepRad: Math.PI * 14.0,
    brokenIndices: [12, 24, 36, 48, 60, 72, 84, 96, 105],
  },
  {
    id: 'z4-spiral-tower-2',
    zone: 'z4',
    kind: 'spiralStairs',
    pos: [56.0, 361.0, -4.0],
    towerRadius: 1.9,
    outerRadius: 4.2,
    towerHeight: 123.0,
    stepCount: 124,
    startAngle: -0.4,
    totalSweepRad: Math.PI * 15.5,
    brokenIndices: [11, 23, 35, 47, 59, 71, 83, 95, 107, 117],
  },

  // ---- 2. Jembatan Gantung Tali Mengayun (z1-z4 penghubung menara & jalur) ----
  {
    id: 'z1-spiral-bridge-1',
    zone: 'z1',
    kind: 'ropeBridge',
    start: [12.0, 11.8, -4.0],
    end: [18.0, 13.5, -16.0],
    sagM: 0.65,
    plankCount: 11,
    plankWidth: 1.85,
    missingIndices: [4],
    swayPeriodS: 7.2,
    swayAmpRad: 0.045,
  },
  {
    id: 'z1-spiral-bridge-2',
    zone: 'z1',
    kind: 'ropeBridge',
    start: [18.0, 35.5, -16.0],
    end: [24.0, 36.2, 4.0],
    sagM: 0.95,
    plankCount: 16,
    plankWidth: 1.8,
    missingIndices: [5, 11],
    swayPeriodS: 6.8,
    swayAmpRad: 0.055,
  },
  {
    id: 'z2-spiral-bridge-1',
    zone: 'z2',
    kind: 'ropeBridge',
    start: [24.0, 74.6, 18.0],
    end: [30.0, 77.0, 2.0],
    sagM: 0.85,
    plankCount: 14,
    plankWidth: 1.8,
    missingIndices: [4, 9],
    swayPeriodS: 6.4,
    swayAmpRad: 0.06,
  },
  {
    id: 'z3-spiral-bridge-1',
    zone: 'z2',
    kind: 'ropeBridge',
    start: [34.0, 187.0, -14.0],
    end: [40.0, 188.0, 8.0],
    sagM: 1.1,
    plankCount: 18,
    plankWidth: 1.75,
    missingIndices: [5, 10, 14],
    swayPeriodS: 5.8,
    swayAmpRad: 0.065,
  },
  {
    id: 'z4-spiral-bridge-1',
    zone: 'z2',
    kind: 'ropeBridge',
    start: [48.0, 360.0, -10.0],
    end: [56.0, 361.0, -4.0],
    sagM: 0.55,
    plankCount: 9,
    plankWidth: 1.85,
    missingIndices: [4],
    swayPeriodS: 5.6,
    swayAmpRad: 0.06,
  },
  {
    id: 'z4-spiral-summit-bridge',
    zone: 'z2',
    kind: 'ropeBridge',
    start: [56.0, 484.0, -4.0],
    end: [66.0, 496.0, -8.0],
    sagM: 0.75,
    plankCount: 12,
    plankWidth: 1.9,
    missingIndices: [5],
    swayPeriodS: 5.4,
    swayAmpRad: 0.055,
  },
  {
    id: 'z1-rope-bridge',
    zone: 'z1',
    kind: 'ropeBridge',
    start: [-16.0, 15.6, -18.0],
    end: [-2.0, 16.4, -18.0],
    sagM: 1.05,
    plankCount: 12,
    plankWidth: 2.3,
    missingIndices: [4, 8],
    swayPeriodS: 4.4,
    swayAmpRad: 0.075,
  },
  {
    id: 'z2-rope-bridge',
    zone: 'z2',
    kind: 'ropeBridge',
    start: [-24.0, 112.5, -32.0],
    end: [-10.0, 113.3, -32.0],
    sagM: 1.1,
    plankCount: 12,
    plankWidth: 2.2,
    missingIndices: [3, 8],
    swayPeriodS: 4.1,
    swayAmpRad: 0.085,
  },

  // ---- 3. Akar Pohon Raksasa Meliuk (z2-z3) ----
  {
    id: 'z2-giant-root',
    zone: 'z2',
    kind: 'giantRoot',
    points: [
      [32.0, 158.0, -55.0],
      [29.5, 160.8, -51.0],
      [25.5, 163.4, -49.2],
      [24.0, 166.0, -45.2],
      [22.0, 168.4, -42.0],
    ],
    baseRadius: 1.05,
    topRadius: 0.52,
    stepCount: 8,
  },
  {
    id: 'z3-giant-root',
    zone: 'z3',
    kind: 'giantRoot',
    points: [
      [28.0, 198.0, 32.0],
      [25.2, 200.8, 28.4],
      [20.8, 203.6, 26.8],
      [18.6, 206.4, 23.0],
      [16.0, 209.0, 20.0],
    ],
    baseRadius: 1.08,
    topRadius: 0.5,
    stepCount: 8,
  },

  // ---- 4. Roda Gigi Kincir Vertikal (z2) ----
  {
    id: 'z2-vertical-gear-1',
    zone: 'z2',
    kind: 'verticalGear',
    pos: [36.0, 164.0, -34.0],
    rotY: 0.12,
    radius: 4.3,
    thickness: 0.72,
    toothCount: 12,
    treadCount: 6,
    periodS: 14.0,
    dir: 1,
  },
  {
    id: 'z2-vertical-gear-2',
    zone: 'z2',
    kind: 'verticalGear',
    pos: [44.9, 168.6, -34.0],
    rotY: 0.12,
    radius: 3.7,
    thickness: 0.68,
    toothCount: 10,
    treadCount: 6,
    periodS: 12.0,
    dir: -1,
  },

  // ---- 5. Lentera Kertas / Lonceng Bandul (z2-z4) ----
  {
    id: 'z2-pendulum-lantern-1',
    zone: 'z2',
    kind: 'pendulumLantern',
    pos: [32.0, 184.0, 14.0],
    rotY: 0.25,
    roofRadius: 1.75,
    ropeLen: 6.0,
    swingAmp: 0.4,
    periodS: 5.4,
    phaseS: 0,
  },
  {
    id: 'z3-pendulum-lantern-1',
    zone: 'z3',
    kind: 'pendulumLantern',
    pos: [-38.0, 260.0, -10.0],
    rotY: -0.35,
    roofRadius: 1.7,
    ropeLen: 6.4,
    swingAmp: 0.42,
    periodS: 5.8,
    phaseS: 1.4,
  },
  {
    id: 'z4-pendulum-lantern-1',
    zone: 'z4',
    kind: 'pendulumLantern',
    pos: [58.0, 472.0, -18.0],
    rotY: 0.18,
    roofRadius: 1.65,
    ropeLen: 6.6,
    swingAmp: 0.38,
    periodS: 5.6,
    phaseS: 2.1,
  },

  // ---- 6. Busur Gerbang Patah & Batu Faset Melayang (z3-z4) ----
  {
    id: 'z3-broken-arch',
    zone: 'z3',
    kind: 'brokenArch',
    pos: [42.0, 314.0, -60.0],
    rotY: yawToward([42.0, 314.0, -60.0], SUMMIT_POS),
    span: 11.0,
    archHeight: 6.2,
    thickness: 2.2,
    stepCount: 9,
  },
  {
    id: 'z3-faceted-rock-1',
    zone: 'z3',
    kind: 'facetedRock',
    pos: [47.5, 321.4, -55.0],
    rotY: 0.4,
    radius: 2.0,
    depth: 2.4,
    seed: 101,
  },
  {
    id: 'z3-faceted-rock-2',
    zone: 'z3',
    kind: 'facetedRock',
    pos: [52.2, 323.0, -50.2],
    rotY: -0.6,
    radius: 1.85,
    depth: 2.2,
    seed: 202,
  },
  {
    id: 'z4-broken-arch',
    zone: 'z4',
    kind: 'brokenArch',
    pos: [64.0, 478.0, -22.0],
    rotY: yawToward([64.0, 478.0, -22.0], SUMMIT_POS),
    span: 11.4,
    archHeight: 6.4,
    thickness: 2.3,
    stepCount: 9,
  },
  {
    id: 'z4-faceted-rock-1',
    zone: 'z4',
    kind: 'facetedRock',
    pos: [69.0, 485.4, -17.2],
    rotY: 0.55,
    radius: 2.05,
    depth: 2.5,
    seed: 303,
  },
  {
    id: 'z4-faceted-rock-2',
    zone: 'z4',
    kind: 'facetedRock',
    pos: [73.4, 487.2, -13.0],
    rotY: -0.35,
    radius: 1.9,
    depth: 2.3,
    seed: 404,
  },
]

// ---- Shared Material Cache (keeps draw calls & shader permutations minimal) ----

const matCache = new Map<string, MeshStandardMaterial>()

export function sculpturalMaterial(
  name: string,
  color: string,
  opts: { roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number; style?: SurfaceStyle } = {},
): MeshStandardMaterial {
  let m = matCache.get(name)
  if (m) return m
  const tex = opts.style ? getSurfaceTextures(opts.style) : null
  m = new MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.84,
    metalness: opts.metalness ?? 0,
    ...(tex ? { map: tex.map, bumpMap: tex.bumpMap, bumpScale: 0.03 } : {}),
  })
  if (opts.emissive) {
    m.emissive.set(opts.emissive)
    m.emissiveIntensity = opts.emissiveIntensity ?? 1.2
  }
  matCache.set(name, m)
  return m
}

// ---- Procedural Non-Box Geometry Builders ----

/** Curved stone wedge tread (ExtrudeGeometry) with flat top at y = +height/2. */
export function buildWedgeStepGeometry(innerR: number, outerR: number, arcRad: number, height: number): BufferGeometry {
  const half = arcRad / 2
  const shape = new Shape()
  shape.absarc(0, 0, outerR, -half, half, false)
  shape.lineTo(Math.cos(half) * innerR, Math.sin(half) * innerR)
  shape.absarc(0, 0, innerR, half, -half, true)
  shape.closePath()
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(0.08, height - 0.06),
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.035,
    bevelSegments: 2,
    curveSegments: 8,
  })
  // ExtrudeGeometry extrudes along +Z; rotate -PI/2 around X so extrusion axis maps to +Y
  g.rotateX(-Math.PI / 2)
  g.computeBoundingBox()
  const bb = g.boundingBox!
  // Shift so top face sits cleanly at y = +height/2
  g.translate(0, height / 2 - bb.max.y, 0)
  return g
}

/** Beveled timber plank (ExtrudeGeometry) for catenary rope bridges, flat top at y = +h/2. */
export function buildBeveledPlankGeometry(w: number, h: number, d: number): BufferGeometry {
  const hw = w / 2 - 0.04
  const hd = d / 2 - 0.04
  const r = 0.05
  const shape = new Shape()
  shape.moveTo(-hw + r, -hd)
  shape.lineTo(hw - r, -hd)
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r)
  shape.lineTo(hw, hd - r)
  shape.quadraticCurveTo(hw, hd, hw - r, hd)
  shape.lineTo(-hw + r, hd)
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r)
  shape.lineTo(-hw, -hd + r)
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd)
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(0.06, h - 0.04),
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.025,
    bevelSegments: 2,
  })
  g.rotateX(-Math.PI / 2)
  g.computeBoundingBox()
  g.translate(0, h / 2 - g.boundingBox!.max.y, 0)
  return g
}

/** Large toothed wooden/copper gear wheel (ExtrudeGeometry) lying in the XY plane. */
export function buildGearWheelGeometry(radius: number, toothCount: number, thickness: number): BufferGeometry {
  const rootR = radius * 0.84
  const tipR = radius * 1.03
  const shape = new Shape()
  const step = (Math.PI * 2) / toothCount
  for (let i = 0; i < toothCount; i++) {
    const a0 = i * step
    const a1 = a0 + step * 0.22
    const a2 = a0 + step * 0.34
    const a3 = a0 + step * 0.66
    const a4 = a0 + step * 0.78
    const pts: Array<[number, number]> = [
      [Math.cos(a0) * rootR, Math.sin(a0) * rootR],
      [Math.cos(a1) * rootR, Math.sin(a1) * rootR],
      [Math.cos(a2) * tipR, Math.sin(a2) * tipR],
      [Math.cos(a3) * tipR, Math.sin(a3) * tipR],
      [Math.cos(a4) * rootR, Math.sin(a4) * rootR],
    ]
    if (i === 0) shape.moveTo(pts[0][0], pts[0][1])
    else shape.lineTo(pts[0][0], pts[0][1])
    for (let k = 1; k < pts.length; k++) shape.lineTo(pts[k][0], pts[k][1])
  }
  shape.closePath()

  // Cut 4 decorative circular weight-relief holes between hub and rim
  const holeOrbit = radius * 0.5
  const holeR = radius * 0.17
  for (let h = 0; h < 4; h++) {
    const ha = (h * Math.PI) / 2 + Math.PI / 4
    const hole = new Shape()
    hole.absarc(Math.cos(ha) * holeOrbit, Math.sin(ha) * holeOrbit, holeR, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }

  const g = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 2,
    curveSegments: 8,
  })
  g.translate(0, 0, -thickness / 2)
  return g
}

/** Ghibli lantern roof platform (LatheGeometry): guaranteed flat walkable top disk at y = +0.24, flared eaves below. */
export function buildLanternRoofGeometry(radius: number): BufferGeometry {
  const pts = [
    new Vector2(0.001, 0.24),
    new Vector2(radius * 0.92, 0.24),
    new Vector2(radius * 1.04, 0.14),
    new Vector2(radius * 1.12, -0.08),
    new Vector2(radius * 0.88, -0.18),
    new Vector2(radius * 0.65, -0.22),
    new Vector2(0.001, -0.22),
  ]
  return new LatheGeometry(pts, 18)
}

/** Glowing ribbed paper lantern body hanging beneath the walkable roof (LatheGeometry). */
export function buildLanternBodyGeometry(radius: number): BufferGeometry {
  const r = radius * 0.58
  const pts = [
    new Vector2(0.001, -0.22),
    new Vector2(r * 0.68, -0.24),
    new Vector2(r * 0.96, -0.58),
    new Vector2(r * 1.0, -1.05),
    new Vector2(r * 0.88, -1.48),
    new Vector2(r * 0.55, -1.78),
    new Vector2(0.001, -1.86),
  ]
  return new LatheGeometry(pts, 16)
}

/** Broken stone arch segment (ExtrudeGeometry) in local XY plane; opening faces +/-Z. */
export function buildBrokenArchSegmentGeometry(
  outerR: number,
  innerR: number,
  thickness: number,
  startAng: number,
  endAng: number,
): BufferGeometry {
  const shape = new Shape()
  shape.absarc(0, 0, outerR, startAng, endAng, false)
  // Jagged broken edge at endAng
  const midR = (outerR + innerR) * 0.5
  const jagAng = endAng + (endAng > startAng ? 0.045 : -0.045)
  shape.lineTo(Math.cos(jagAng) * midR, Math.sin(jagAng) * midR)
  shape.lineTo(Math.cos(endAng) * innerR, Math.sin(endAng) * innerR)
  shape.absarc(0, 0, innerR, endAng, startAng, true)
  shape.closePath()

  const g = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 14,
  })
  g.translate(0, 0, -thickness / 2)
  return g
}

/** Asymmetric faceted floating stone underside + flat level polygonal top cap (y = +0.25). */
export function buildFacetedRockGeometries(radius: number, depth: number, seed: number): {
  topCap: BufferGeometry
  underside: BufferGeometry
} {
  let s = seed >>> 0
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // Irregular 7-sided flat walkable top cap
  const sides = 7
  const topShape = new Shape()
  const radii: number[] = []
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2
    const r = radius * (0.86 + rng() * 0.22)
    radii.push(r)
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) topShape.moveTo(x, y)
    else topShape.lineTo(x, y)
  }
  topShape.closePath()
  const topCap = new ExtrudeGeometry(topShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.04,
    bevelSegments: 1,
  })
  topCap.rotateX(-Math.PI / 2)
  topCap.computeBoundingBox()
  topCap.translate(0, 0.25 - topCap.boundingBox!.max.y, 0)

  // Tapered faceted stone underside (watertight periodic displacement so UV seam & bottom cap never tear)
  const avgR = radii.reduce((a, b) => a + b, 0) / radii.length
  const underside = new CylinderGeometry(avgR * 0.9, avgR * 0.14, depth, sides, 2)
  const phaseA = rng() * Math.PI * 2
  const phaseB = rng() * Math.PI * 2
  const pos = underside.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i)
    const py = pos.getY(i)
    const pz = pos.getZ(i)
    // Keep top ring flush with topCap; perturb lower rings deterministically by angle & height
    if (py < depth * 0.35 && Math.hypot(px, pz) > 1e-4) {
      const ang = Math.atan2(pz, px)
      const jitter = 0.92 + Math.sin(ang * 3 + phaseA) * 0.12 + Math.cos(ang * 5 + py * 1.4 + phaseB) * 0.08
      pos.setX(i, px * jitter)
      pos.setZ(i, pz * jitter)
    }
  }
  underside.translate(0, -depth / 2 - 0.08, 0)
  underside.computeVertexNormals()
  return { topCap, underside }
}

/** Stylized Ghibli leaf cluster blade (ExtrudeGeometry). */
export function buildLeafGeometry(): BufferGeometry {
  const shape = new Shape()
  shape.moveTo(0, 0)
  shape.quadraticCurveTo(0.28, 0.24, 0.08, 0.72)
  shape.lineTo(0, 0.9)
  shape.lineTo(-0.08, 0.72)
  shape.quadraticCurveTo(-0.28, 0.24, 0, 0)
  const g = new ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  return g
}

// ---- Deterministic Proxy Collider & Curve Samplers (Shared by Renderer & Tests) ----

/** Computes exact world proxy colliders and step metadata for a Broken Spiral Stone Stairs tower. */
export function spiralStairSteps(spec: SpiralStairsSpec): Array<ProxyBox & { angle: number; index: number }> {
  const out: Array<ProxyBox & { angle: number; index: number }> = []
  const broken = new Set(spec.brokenIndices)
  const midR = (spec.towerRadius + spec.outerRadius) * 0.5
  const radialW = spec.outerRadius - spec.towerRadius + 0.18
  const arcPerStep = spec.totalSweepRad / spec.stepCount
  const chordD = Math.max(1.15, 2 * midR * Math.sin(arcPerStep * 0.48))
  const stepH = 0.38
  for (let i = 0; i < spec.stepCount; i++) {
    if (broken.has(i)) continue
    const frac = (i + 0.5) / spec.stepCount
    const angle = spec.startAngle + frac * spec.totalSweepRad
    const y = spec.pos[1] + 0.45 + frac * (spec.towerHeight - 0.9)
    const cx = spec.pos[0] + Math.cos(angle) * midR
    const cz = spec.pos[2] - Math.sin(angle) * midR
    out.push({
      id: `${spec.id}-step-${i}`,
      index: i,
      angle,
      pos: [cx, y - stepH / 2, cz],
      size: [radialW, stepH, chordD],
      rotY: angle,
    })
  }
  return out
}

/** Evaluates a point along a rope bridge's catenary curve (u in [0, 1]). */
export function bridgePointAt(spec: RopeBridgeSpec, u: number, out = new Vector3()): Vector3 {
  const x = spec.start[0] + (spec.end[0] - spec.start[0]) * u
  const z = spec.start[2] + (spec.end[2] - spec.start[2]) * u
  const linY = spec.start[1] + (spec.end[1] - spec.start[1]) * u
  const sag = spec.sagM * 4 * u * (1 - u)
  return out.set(x, linY - sag, z)
}

/** Computes plank descriptors for a Swaying Rope Bridge (middle planks are kinematic sway; end planks static). */
export function ropeBridgePlanks(spec: RopeBridgeSpec): Array<{
  id: string
  index: number
  pos: Vec3
  size: Vec3
  rotY: number
  kinematic: boolean
  motion?: Motion
}> {
  const dx = spec.end[0] - spec.start[0]
  const dz = spec.end[2] - spec.start[2]
  const span = Math.hypot(dx, dz)
  const yaw = Math.atan2(dx, dz)
  const plankD = Math.max(0.72, (span / spec.plankCount) * 0.82)
  const plankH = 0.24
  const missing = new Set(spec.missingIndices)
  const out: Array<{
    id: string
    index: number
    pos: Vec3
    size: Vec3
    rotY: number
    kinematic: boolean
    motion?: Motion
  }> = []
  const tmp = new Vector3()
  for (let i = 0; i < spec.plankCount; i++) {
    if (missing.has(i)) continue
    const u = (i + 0.5) / spec.plankCount
    bridgePointAt(spec, u, tmp)
    // Sway amplitude peaks in the middle of the bridge and tapers to 0 at anchored ends
    const swayFactor = Math.sin(u * Math.PI)
    const isKinematic = i >= 2 && i <= spec.plankCount - 3
    out.push({
      id: `${spec.id}-plank-${i}`,
      index: i,
      pos: [tmp.x, tmp.y - plankH / 2, tmp.z],
      size: [spec.plankWidth, plankH, plankD],
      rotY: yaw,
      kinematic: isKinematic,
      motion: isKinematic
        ? {
            type: 'pendulum',
            points: [],
            periodS: spec.swayPeriodS,
            phaseS: u * 0.85,
            dwellS: 0,
            ropeLen: 3.0,
            swingAmp: spec.swayAmpRad * swayFactor,
          }
        : undefined,
    })
  }
  return out
}

/** Computes calibrated flat-top walkable stepping segments along a Giant Twisting Tree Root. */
export function giantRootSteps(spec: GiantRootSpec): Array<ProxyBox & { width: number; u: number }> {
  const curve = new CatmullRomCurve3(spec.points.map((p) => new Vector3(...p)))
  const out: Array<ProxyBox & { width: number; u: number }> = []
  const stepH = 0.34
  for (let i = 0; i < spec.stepCount; i++) {
    const u = i / Math.max(1, spec.stepCount - 1)
    const pt = curve.getPoint(u)
    const tan = curve.getTangent(u)
    const yaw = Math.atan2(tan.x, tan.z)
    const r = spec.baseRadius + (spec.topRadius - spec.baseRadius) * u
    const width = Math.max(1.1, r * 1.9)
    const length = 1.15
    // Top of flat proxy pad sits cleanly on the upper spine of the root tube
    const topY = pt.y + r * 0.72
    out.push({
      id: `${spec.id}-step-${i}`,
      u,
      width,
      pos: [pt.x, topY - stepH / 2, pt.z],
      size: [width, stepH, length],
      rotY: yaw,
    })
  }
  return out
}

/** Computes calibrated flat-top walkable proxy treads along the curved back of a Broken Stone Arch. */
export function brokenArchSteps(spec: BrokenArchSpec): ProxyBox[] {
  const out: ProxyBox[] = []
  const outerR = spec.span / 2
  const cosY = Math.cos(spec.rotY)
  const sinY = Math.sin(spec.rotY)
  const stepH = 0.36
  // Left ascending arc: angles from 0.22 rad up to 1.35 rad (stops at broken crown)
  const startA = 0.22
  const endA = 1.36
  for (let i = 0; i < spec.stepCount; i++) {
    const u = i / Math.max(1, spec.stepCount - 1)
    const ang = startA + u * (endA - startA)
    const lx = -Math.cos(ang) * outerR
    const ly = Math.sin(ang) * spec.archHeight
    // Rotate local (lx, 0) by rotY
    const wx = spec.pos[0] + lx * cosY
    const wz = spec.pos[2] - lx * sinY
    const wy = spec.pos[1] + ly
    out.push({
      id: `${spec.id}-step-${i}`,
      pos: [wx, wy - stepH / 2, wz],
      size: [1.55, stepH, spec.thickness + 0.15],
      rotY: spec.rotY,
    })
  }
  return out
}

/** Computes the exact world top-surface test point for each sculptural structure (used by TEST-42). */
export function sculpturalTestAnchors(): Record<string, Vec3> {
  const anchors: Record<string, Vec3> = {}
  for (const spec of SCULPTURAL_SPECS) {
    if (spec.kind === 'spiralStairs') {
      const steps = spiralStairSteps(spec)
      const s = steps[1]
      anchors[spec.id] = [s.pos[0], s.pos[1] + s.size[1] / 2, s.pos[2]]
    } else if (spec.kind === 'ropeBridge') {
      const planks = ropeBridgePlanks(spec)
      const mid = planks[Math.floor(planks.length / 2)]
      anchors[spec.id] = [mid.pos[0], mid.pos[1] + mid.size[1] / 2, mid.pos[2]]
    } else if (spec.kind === 'giantRoot') {
      const steps = giantRootSteps(spec)
      const s = steps[2]
      anchors[spec.id] = [s.pos[0], s.pos[1] + s.size[1] / 2, s.pos[2]]
    } else if (spec.kind === 'verticalGear') {
      anchors[spec.id] = [spec.pos[0], spec.pos[1] + spec.radius + 0.3, spec.pos[2]]
    } else if (spec.kind === 'pendulumLantern') {
      anchors[spec.id] = [spec.pos[0], spec.pos[1] + 0.25, spec.pos[2]]
    } else if (spec.kind === 'brokenArch') {
      const steps = brokenArchSteps(spec)
      const s = steps[2]
      anchors[spec.id] = [s.pos[0], s.pos[1] + s.size[1] / 2, s.pos[2]]
    } else if (spec.kind === 'facetedRock') {
      anchors[spec.id] = [spec.pos[0], spec.pos[1] + 0.25, spec.pos[2]]
    }
  }
  return anchors
}

/** Builds a TubeGeometry for a rope bridge cable (offset laterally by sideOffset and vertically by yOffset). */
export function buildBridgeRopeGeometry(spec: RopeBridgeSpec, sideOffset: number, yOffset: number): TubeGeometry {
  const dx = spec.end[0] - spec.start[0]
  const dz = spec.end[2] - spec.start[2]
  const len = Math.max(1e-3, Math.hypot(dx, dz))
  // Perpendicular horizontal right vector
  const rx = -dz / len
  const rz = dx / len
  const pts: Vector3[] = []
  for (let i = 0; i <= 16; i++) {
    const u = i / 16
    const p = bridgePointAt(spec, u)
    pts.push(new Vector3(p.x + rx * sideOffset, p.y + yOffset, p.z + rz * sideOffset))
  }
  return new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.055, 6, false)
}

/** Builds the organic ascending TubeGeometry for a Giant Twisting Tree Root. */
export function buildGiantRootTubeGeometry(spec: GiantRootSpec): {
  mainTube: TubeGeometry
  vineTube: TubeGeometry
} {
  const curve = new CatmullRomCurve3(spec.points.map((p) => new Vector3(...p)))
  const mainTube = new TubeGeometry(curve, 36, (spec.baseRadius + spec.topRadius) * 0.45, 10, false)
  // Spiral Ghibli vine wrapping around the root
  const vinePts: Vector3[] = []
  for (let i = 0; i <= 24; i++) {
    const u = i / 24
    const p = curve.getPoint(u)
    const ang = u * Math.PI * 5
    const vr = spec.baseRadius * (1 - u * 0.42) + 0.08
    vinePts.push(new Vector3(p.x + Math.cos(ang) * vr, p.y + Math.sin(ang) * vr * 0.55, p.z + Math.sin(ang) * vr))
  }
  const vineTube = new TubeGeometry(new CatmullRomCurve3(vinePts), 32, 0.07, 5, false)
  return { mainTube, vineTube }
}
