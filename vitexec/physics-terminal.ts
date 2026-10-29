// TEST-34 (DIRECTIVE §7; ref/06 §Lapisan, physics row): the thinnest platform at terminal fall speed, raw
// CharacterPhysicsPort.step(0.2) (no app clamp, no frame split) → 0 tembus.
// Thinnest platform = the minimum collider thickness in the G1 blockout (0.5 m, D-013 minimum). Every 0.5 m platform
// type is dropped on: a static 3×0.5×3 slab, the 29° ramp, the linear mover and the lift (movers: world clock advanced
// by the same 0.2 s before each raw step, 5 motion phases, drop point offset by half the horizontal trial travel).
// Terminal speed = |gravity| / linearDamping of the port settings (200 m/s), set with impulse(0, -vt, 0, Infinity)
// right after teleport. At that speed each substep moves exactly one capsule radius (0.4 m), so the start height
// is swept over one radius: static slab and ramp at 1 mm (401 offsets, centre and 0.1 m inside the +X edge),
// movers at 1 cm (41 offsets per phase).
// "tembus" = the drop ends with the feet below top - 0.05 while the feet XZ are inside the platform's top face.
// Validity: every drop touched the platform (grounded within [-0.05, 0.1] m of its top while over it), and a free
// fall beside the slab keeps the terminal speed through step(0.2).
// Ends with "TEST-34 PASS {...}" or throws "TEST-34 FAIL ...".
import { Matrix4, Vector3 } from 'three'
import type { Mesh } from 'three'
import { createHarness, round } from '/vitexec/lib/harness.ts'
import type { Harness, HarnessBlock } from '/vitexec/lib/harness.ts'
import { BLOCKOUT } from '/src/level/blockout.ts'
import { evaluateMotion } from '/src/level/motion.ts'
import type { Pose, Vec3 } from '/src/level/motion.ts'

const DT = 0.2
const TOL = 0.05
const STEPS = 5 // 1.0 s of simulated time per drop; the impact happens inside the first step
const DROP_M = 10 // start height above the top (the fall at terminal speed covers it within the first step)
const MOVER_PHASES = [0.5, 3.4, 4.5, 6.0, 9.5]

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

/** World point on the top face at local (lx, lz) of the collider. */
function localTopPoint(m: Matrix4, size: Vec3, lx: number, lz: number): Vector3 {
  return new Vector3(lx, size[1] / 2, lz).applyMatrix4(m)
}

type Case = {
  type: string
  phaseS: number | null
  spot: string
  drops: number
  tunnels: number
  landed: number
  minFinalClearance: number
  minStepClearance: number
  startVy: number
  tunnelOffsets: number[]
  notLandedOffsets: number[]
}

const poseA: Pose = { offset: new Vector3(), yaw: 0 }
const poseB: Pose = { offset: new Vector3(), yaw: 0 }
let vt = 0

function dropCase(type: string, base: HarnessBlock, phaseS: number | null, spot: 'centre' | 'edge', offsets: number[]): Case {
  const b: HarnessBlock = phaseS == null || !base.motion ? base : { ...base, motion: { ...base.motion, phaseS } }
  const h = createHarness([b], [0, 200, 0])
  vt = Math.abs(h.port.settings.gravity) / h.port.settings.linearDamping
  const matrix = colliderMatrix(h, b)
  const c: Case = {
    type,
    phaseS,
    spot,
    drops: 0,
    tunnels: 0,
    landed: 0,
    minFinalClearance: Infinity,
    minStepClearance: Infinity,
    startVy: 0,
    tunnelOffsets: [],
    notLandedOffsets: [],
  }
  for (const off of offsets) {
    if (b.motion) h.motion.reset()
    const lx = spot === 'edge' ? b.size[0] / 2 - 0.1 : 0
    const p0 = localTopPoint(matrix(), b.size, lx, 0)
    if (b.motion) {
      evaluateMotion(b.motion, h.motion.worldClock, poseA)
      evaluateMotion(b.motion, h.motion.worldClock + STEPS * DT, poseB)
      p0.add(new Vector3().subVectors(poseB.offset, poseA.offset).multiplyScalar(0.5).setY(0))
    }
    const s0 = topAt(matrix(), b.size, p0.x, p0.z)
    if (!s0.inside) throw new Error(`drop point outside ${type}`)
    h.port.teleport(new Vector3(p0.x, s0.top + DROP_M + off, p0.z))
    h.port.impulse(new Vector3(0, -vt, 0), Infinity)
    c.startVy = round(h.port.velocity.y, 4)
    let landed = false
    for (let k = 0; k < STEPS; k++) {
      if (b.motion) h.motion.advance(DT)
      h.port.step(DT)
      const p = h.port.position
      const s = topAt(matrix(), b.size, p.x, p.z)
      if (s.inside) {
        c.minStepClearance = Math.min(c.minStepClearance, p.y - s.top)
        if (h.port.isGroundedRaw && p.y - s.top >= -TOL && p.y - s.top <= 0.1) landed = true
      }
    }
    const p = h.port.position
    const s = topAt(matrix(), b.size, p.x, p.z)
    c.drops++
    if (s.inside) c.minFinalClearance = Math.min(c.minFinalClearance, p.y - s.top)
    if (s.inside && p.y < s.top - TOL) {
      c.tunnels++
      if (c.tunnelOffsets.length < 20) c.tunnelOffsets.push(off)
    }
    if (landed) c.landed++
    else if (c.notLandedOffsets.length < 20) c.notLandedOffsets.push(off)
  }
  c.minFinalClearance = round(c.minFinalClearance, 4)
  c.minStepClearance = round(c.minStepClearance, 4)
  return c
}

const t0 = performance.now()
// thinnest collider thickness among blockout platforms (route/rest tags)
const thinnest = Math.min(...BLOCKOUT.filter((b) => b.collider && (b.tag === 'route' || b.tag === 'rest')).map((b) => b.size[1]))
const slab: HarnessBlock = { id: 'slab-thin', size: [3, thinnest, 3], pos: [0, 1 - thinnest / 2, 0] }
const ramp = block('ramp')
const linear = block('mover-linear')
const lift = block('mover-lift')
for (const b of [ramp, linear, lift]) if (b.size[1] !== thinnest) throw new Error(`${b.id} is not ${thinnest} m thick`)

const fine = Array.from({ length: 401 }, (_, i) => round(i * 0.001, 3))
const coarse = Array.from({ length: 41 }, (_, i) => round(i * 0.01, 2))
const cases: Case[] = []
for (const spot of ['centre', 'edge'] as const) {
  cases.push(dropCase('static-slab', slab, null, spot, fine))
  cases.push(dropCase('ramp', ramp, null, spot, fine))
}
for (const ph of MOVER_PHASES) {
  cases.push(dropCase('mover-linear', linear, ph, 'centre', coarse))
  cases.push(dropCase('mover-lift', lift, ph, 'centre', coarse))
}
for (const c of cases) console.log('case ' + JSON.stringify(c))

// premise check: terminal speed is kept through a raw step(0.2) in free fall (beside the slab)
const free = createHarness([slab], [0, 200, 0])
free.port.teleport(new Vector3(50, 100, 50))
free.port.impulse(new Vector3(0, -vt, 0), Infinity)
const freeStartVy = free.port.velocity.y
const y0 = free.port.position.y
free.port.step(DT)
const freeVy = free.port.velocity.y
const freeDy = free.port.position.y - y0

const drops = cases.reduce((n, c) => n + c.drops, 0)
const tunnels = cases.reduce((n, c) => n + c.tunnels, 0)
const notLanded = cases.reduce((n, c) => n + (c.drops - c.landed), 0)
const terminalKept = Math.abs(freeVy + vt) < 0.01 * vt
const numbers = {
  thinnestM: thinnest,
  terminalMs: round(vt, 3),
  stepS: DT,
  substepTravelM: round(free.port.settings.capsuleRadius, 3),
  free: { startVy: round(freeStartVy, 4), vyAfterStep: round(freeVy, 4), dyInStep: round(freeDy, 4) },
  cases: cases.length,
  drops,
  tunnels,
  notLanded,
  minFinalClearance: Math.min(...cases.map((c) => c.minFinalClearance)),
  minStepClearance: Math.min(...cases.map((c) => c.minStepClearance)),
  elapsedMs: Math.round(performance.now() - t0),
}
const ok = tunnels === 0
const valid = notLanded === 0 && terminalKept
if (ok && valid) {
  console.log('TEST-34 PASS ' + JSON.stringify(numbers))
} else {
  console.log('TEST-34 FAIL ' + JSON.stringify(numbers))
  throw new Error(
    'TEST-34 FAIL ' +
      (ok ? '' : `tunnels=${tunnels} `) +
      (valid ? '' : `invalid: notLanded=${notLanded} terminalKept=${terminalKept}`),
  )
}
