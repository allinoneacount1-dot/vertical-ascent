// TEST-07 (DIRECTIVE §7; ref/06 §Lapisan, physics row): headless harness, raw CharacterPhysicsPort.step(dt), no app clamp.
// Part A — phase sweep: 41 drop heights (0, 0.05, …, 2.0 m above the platform top) onto every platform type of the
//   G1 blockout (static box 1 m, static slab 0.5 m, ramp 0.5 m, linear mover, lift mover), step(0.2) raw, 6 steps per drop.
//   Movers: the world clock advances by the same 0.2 s before each raw step (no carry, no frame split); swept at 5 motion
//   phases; the drop point is offset by half the platform's horizontal travel so the feet stay over its footprint.
//   "tembus" = the drop ends with the feet below top - 0.05 while the feet XZ are inside the platform's top face.
//   Validity: every drop must have touched the platform (grounded within [-0.05, 0.1] m of its top while over it).
// Part B — wall runs: inputVelocity 6 m/s into each wall type (thin 0.5 m, thick 2 m, inside corner) for 60 s of
//   simulated time at dt 1/60 and raw 0.2; assertion: feet y never < floor top - 0.05. Validity: the run reached the wall.
// Ends with "TEST-07 PASS {...}" or throws "TEST-07 FAIL ...".
import { Matrix4, Vector3 } from 'three'
import type { Mesh } from 'three'
import { createHarness, round } from '/vitexec/lib/harness.ts'
import type { Harness, HarnessBlock } from '/vitexec/lib/harness.ts'
import { BLOCKOUT } from '/src/level/blockout.ts'
import { evaluateMotion } from '/src/level/motion.ts'
import type { Pose, Vec3 } from '/src/level/motion.ts'

const DT = 0.2
const TOL = 0.05
const HEIGHTS = Array.from({ length: 41 }, (_, i) => round(i * 0.05, 2))
const TRIAL_STEPS = 6 // 1.2 s of simulated time per drop
const MOVER_PHASES = [0.5, 3.4, 4.5, 6.0, 9.5] // seconds into a 10 s ping-pong: travel, arrive+dwell, dwell+return, return, dwell+start
const RUN_SPEED = 6
const RUN_SECONDS = 60

function block(id: string): HarnessBlock {
  const b = BLOCKOUT.find((x) => x.id === id)
  if (!b || !b.collider) throw new Error(`blockout has no collider block "${id}"`)
  return { id: b.id, size: b.size, pos: b.pos, rotX: b.rotX, rotY: b.rotY, motion: b.motion }
}

const inv = new Matrix4()
const local = new Vector3()
/** Height of a box collider's top face at world (x, z), and whether (x, z) lies over that face. */
function topAt(matrixWorld: Matrix4, size: Vec3, x: number, z: number): { top: number; inside: boolean } {
  inv.copy(matrixWorld).invert()
  const e = inv.elements // column-major; local.y = e[1]·x + e[5]·y + e[9]·z + e[13]
  const top = (size[1] / 2 - e[1] * x - e[9] * z - e[13]) / e[5]
  local.set(x, top, z).applyMatrix4(inv)
  return { top, inside: Math.abs(local.x) <= size[0] / 2 && Math.abs(local.z) <= size[2] / 2 }
}

/** The collider's current world matrix: the static mesh (single static block) or the mover's collider. */
function colliderMatrix(h: Harness, b: HarnessBlock): () => Matrix4 {
  if (b.motion) {
    const p = h.motion.platforms.get(b.id)
    if (!p) throw new Error(`mover ${b.id} not registered`)
    return () => p.collider.matrixWorld
  }
  const mesh = h.root.children[0]?.children[0] as Mesh | undefined
  if (!mesh || !(mesh as Mesh).isMesh) throw new Error(`static collider for ${b.id} not found`)
  return () => mesh.matrixWorld
}

type SweepResult = {
  type: string
  phaseS: number | null
  drops: number
  tunnels: number
  landed: number
  /** min over drops of (final feet y - top) while over the footprint */
  minFinalClearance: number
  /** min over every step of every drop of (feet y - top) while over the footprint (diagnostic) */
  minStepClearance: number
  tunnelHeights: number[]
  notLandedHeights: number[]
}

const poseA: Pose = { offset: new Vector3(), yaw: 0 }
const poseB: Pose = { offset: new Vector3(), yaw: 0 }

function sweep(type: string, base: HarnessBlock, phaseS: number | null): SweepResult {
  const b: HarnessBlock = phaseS == null || !base.motion ? base : { ...base, motion: { ...base.motion, phaseS } }
  const h = createHarness([b], [0, 100, 0])
  const matrix = colliderMatrix(h, b)
  const r: SweepResult = {
    type,
    phaseS,
    drops: 0,
    tunnels: 0,
    landed: 0,
    minFinalClearance: Infinity,
    minStepClearance: Infinity,
    tunnelHeights: [],
    notLandedHeights: [],
  }
  for (const dh of HEIGHTS) {
    if (b.motion) h.motion.reset()
    const centre = new Vector3().setFromMatrixPosition(matrix())
    const offset = new Vector3()
    if (b.motion) {
      // without carry the platform slides under the feet; start half its horizontal trial travel ahead of centre
      evaluateMotion(b.motion, h.motion.worldClock, poseA)
      evaluateMotion(b.motion, h.motion.worldClock + TRIAL_STEPS * DT, poseB)
      offset.subVectors(poseB.offset, poseA.offset).multiplyScalar(0.5).setY(0)
    }
    const x = centre.x + offset.x
    const z = centre.z + offset.z
    const s0 = topAt(matrix(), b.size, x, z)
    if (!s0.inside) throw new Error(`drop point outside ${type}`)
    h.port.teleport(new Vector3(x, s0.top + dh, z))
    let landed = false
    for (let k = 0; k < TRIAL_STEPS; k++) {
      if (b.motion) h.motion.advance(DT)
      h.port.step(DT)
      const p = h.port.position
      const s = topAt(matrix(), b.size, p.x, p.z)
      if (s.inside) {
        r.minStepClearance = Math.min(r.minStepClearance, p.y - s.top)
        if (h.port.isGroundedRaw && p.y - s.top >= -TOL && p.y - s.top <= 0.1) landed = true
      }
    }
    const p = h.port.position
    const s = topAt(matrix(), b.size, p.x, p.z)
    r.drops++
    if (s.inside) r.minFinalClearance = Math.min(r.minFinalClearance, p.y - s.top)
    if (s.inside && p.y < s.top - TOL) {
      r.tunnels++
      r.tunnelHeights.push(dh)
    }
    if (landed) r.landed++
    else r.notLandedHeights.push(dh)
  }
  r.minFinalClearance = round(r.minFinalClearance, 4)
  r.minStepClearance = round(r.minStepClearance, 4)
  return r
}

type WallRun = {
  wall: string
  dt: number
  steps: number
  minY: number
  maxY: number
  final: number[]
  reached: boolean
  /** feet beyond the wall's far face at any step (diagnostic, not part of the TEST-07 assertion) */
  throughWall: boolean
}

const floor = block('floor')
const FLOOR_TOP = floor.pos[1] + floor.size[1] / 2

function wallRun(
  wall: string,
  start: Vec3,
  dir: Vector3,
  dt: number,
  reached: (p: Vector3) => boolean,
  through: (p: Vector3) => boolean,
): WallRun {
  const h = createHarness([floor, block('wall-thin'), block('wall-thick'), block('wall-corner')], start)
  h.port.inputVelocity.copy(dir).normalize().multiplyScalar(RUN_SPEED)
  const steps = Math.round(RUN_SECONDS / dt)
  let minY = Infinity
  let maxY = -Infinity
  let throughWall = false
  for (let i = 0; i < steps; i++) {
    h.port.step(dt)
    const p = h.port.position
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
    if (through(p)) throughWall = true
  }
  const p = h.port.position
  return {
    wall,
    dt: round(dt, 5),
    steps,
    minY: round(minY, 5),
    maxY: round(maxY, 5),
    final: [round(p.x, 4), round(p.y, 4), round(p.z, 4)],
    reached: reached(p),
    throughWall,
  }
}

// ---- Part A: phase sweep ----
const t0 = performance.now()
const platforms: Array<[string, HarnessBlock, Array<number | null>]> = [
  ['static-box-1m', block('step-a'), [null]],
  ['static-slab-0.5m', { id: 'slab-0.5', size: [3, 0.5, 3], pos: [0, 0.75, 0] }, [null]],
  ['ramp-0.5m', block('ramp'), [null]],
  ['mover-linear', block('mover-linear'), MOVER_PHASES],
  ['mover-lift', block('mover-lift'), MOVER_PHASES],
]
const sweeps: SweepResult[] = []
for (const [type, b, phases] of platforms) for (const ph of phases) sweeps.push(sweep(type, b, ph))
for (const s of sweeps) console.log('sweep ' + JSON.stringify(s))

// ---- Part B: wall runs ----
const thin = block('wall-thin') // x 8.75..9.25, z 3..9
const thick = block('wall-thick') // x -15..-13, z 3..13
const corner = block('wall-corner') // x -14..-6, z 13..15
const R = 0.4
const thinNear = thin.pos[0] - thin.size[0] / 2
const thinFar = thin.pos[0] + thin.size[0] / 2
const thickNear = thick.pos[0] + thick.size[0] / 2
const thickFar = thick.pos[0] - thick.size[0] / 2
const cornerNear = corner.pos[2] - corner.size[2] / 2
const cornerFar = corner.pos[2] + corner.size[2] / 2
const runs: WallRun[] = []
for (const dt of [1 / 60, DT]) {
  runs.push(
    wallRun('thin-0.5m', [thinNear - 3, FLOOR_TOP, thin.pos[2]], new Vector3(1, 0, 0), dt,
      (p) => p.x >= thinNear - R - TOL, (p) => p.x > thinFar),
  )
  runs.push(
    wallRun('thick-2m', [thickNear + 3, FLOOR_TOP, thick.pos[2]], new Vector3(-1, 0, 0), dt,
      (p) => p.x <= thickNear + R + TOL, (p) => p.x < thickFar),
  )
  runs.push(
    wallRun('inside-corner', [thickNear + 3, FLOOR_TOP, cornerNear - 3], new Vector3(-1, 0, 1), dt,
      (p) => p.x <= thickNear + R + TOL && p.z >= cornerNear - R - TOL, (p) => p.x < thickFar || p.z > cornerFar),
  )
}
for (const w of runs) console.log('wall ' + JSON.stringify(w))

// ---- verdict ----
const tunnels = sweeps.reduce((n, s) => n + s.tunnels, 0)
const drops = sweeps.reduce((n, s) => n + s.drops, 0)
const notLanded = sweeps.reduce((n, s) => n + (s.drops - s.landed), 0)
const minWallY = Math.min(...runs.map((w) => w.minY))
const wallFloorTop = FLOOR_TOP
const wallViolations = runs.filter((w) => w.minY < wallFloorTop - TOL).map((w) => `${w.wall}@dt=${w.dt}`)
const unreached = runs.filter((w) => !w.reached).map((w) => `${w.wall}@dt=${w.dt}`)
const numbers = {
  sweep: {
    heights: HEIGHTS.length,
    heightStepM: 0.05,
    stepS: DT,
    platformCases: sweeps.length,
    drops,
    tunnels,
    notLanded,
    minFinalClearance: Math.min(...sweeps.map((s) => s.minFinalClearance)),
    minStepClearance: Math.min(...sweeps.map((s) => s.minStepClearance)),
  },
  walls: {
    runs: runs.length,
    seconds: RUN_SECONDS,
    speed: RUN_SPEED,
    floorTop: wallFloorTop,
    minY: minWallY,
    limit: round(wallFloorTop - TOL, 4),
    violations: wallViolations,
    unreached,
    throughWall: runs.filter((w) => w.throughWall).map((w) => `${w.wall}@dt=${w.dt}`),
  },
  elapsedMs: Math.round(performance.now() - t0),
}
const ok = tunnels === 0 && wallViolations.length === 0
const valid = notLanded === 0 && unreached.length === 0
if (ok && valid) {
  console.log('TEST-07 PASS ' + JSON.stringify(numbers))
} else {
  console.log('TEST-07 FAIL ' + JSON.stringify(numbers))
  throw new Error(
    'TEST-07 FAIL ' +
      (ok ? '' : `tunnels=${tunnels} wallViolations=${JSON.stringify(wallViolations)} `) +
      (valid ? '' : `invalid: notLanded=${notLanded} unreached=${JSON.stringify(unreached)}`),
  )
}
