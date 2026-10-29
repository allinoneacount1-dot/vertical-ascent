// TEST-31 (DIRECTIVE §7, D-011): the same input script at constant dt 1/30, 1/60, 1/120, 1/144 and at seeded
// random dt 8–50 ms → Δapex ≤0.02 m and ΔXZ of the landing point ≤0.05 m.
// Layer physics (ref/06 §Lapisan): own headless world, never the running app. App frame path per frame:
// FrameClock.begin → PlatformMotion.beginFrame → CharacterController.stepFrame (ref/02 §Frame order -3, -2).
//
// Input script (simulated time t, relative to the end of a standstill settle on a flat floor, camera yaw 0 = -Z):
//   t = 0: jump pressed (CharacterController.pressJump) + forward held [+ ShiftLeft held for the sprint script,
//          sprint mode 'toggle': one rising edge → run]; held until the landing frame, then released.
// Every dt sees the events at the same simulated time (t = 0 is a frame boundary for all of them).
// apex = max feet rise above the takeoff point over frame-end samples (movement.json definition).
// landing XZ = feet XZ at touchdown, i.e. the descending crossing of the takeoff height, located inside the landing
//   frame from the last airborne frame samples (y: parabola through the last 3, XZ: line through the last 2; XZ is
//   linear in time because the only horizontal velocity is the constant input velocity). The frame-end XZ of the
//   landing frame is also logged; it contains up to dt × speed of post-touchdown walking, i.e. frame quantization.
import { createHarness, round } from '/vitexec/lib/harness.ts'
import { FrameClock } from '/src/game/frame-clock.ts'
import { CharacterController } from '/src/controller/character-controller.ts'
import type { ControlInput } from '/src/controller/character-controller.ts'
import movement from '/level/movement.json'

const MAX_DAPEX = 0.02
const MAX_DXZ = 0.05
const SETTLE_S = 0.5
const RANDOM_SEED = 31

type Schedule = { label: string; next: () => number }
type Sample = { t: number; x: number; y: number; z: number; grounded: boolean }

/** mulberry32: small seeded PRNG so the random-dt schedule is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function schedules(): Schedule[] {
  const fixed = [30, 60, 120, 144].map((hz) => ({ label: `1/${hz}`, next: () => 1 / hz }))
  const rand = mulberry32(RANDOM_SEED)
  return [...fixed, { label: `random 8-50 ms seed ${RANDOM_SEED}`, next: () => 0.008 + rand() * 0.042 }]
}

/** Descending crossing of level yc after sample c, from the parabola through a, b, c (Lagrange form). */
function crossingTime(a: Sample, b: Sample, c: Sample, yc: number): number {
  const [t0, t1, t2] = [a.t, b.t, c.t]
  const [y0, y1, y2] = [a.y, b.y, c.y]
  const d0 = y0 / ((t0 - t1) * (t0 - t2))
  const d1 = y1 / ((t1 - t0) * (t1 - t2))
  const d2 = y2 / ((t2 - t0) * (t2 - t1))
  const A = d0 + d1 + d2
  const B = -(d0 * (t1 + t2) + d1 * (t0 + t2) + d2 * (t0 + t1))
  const C = d0 * t1 * t2 + d1 * t0 * t2 + d2 * t0 * t1 - yc
  const disc = B * B - 4 * A * C
  if (!(A < 0) || disc < 0) throw new Error(`no descending crossing (A=${A}, disc=${disc})`)
  // A < 0: the larger root is the descending one
  return (-B - Math.sqrt(disc)) / (2 * A)
}

function runCase(schedule: Schedule, sprint: boolean) {
  // floor 80×1×80, top y = 0 (as the blockout floor); spawn feet on it
  const h = createHarness([{ id: 'floor', size: [80, 1, 80], pos: [0, -0.5, 0] }], [0, 0, 0])
  const clock = new FrameClock()
  let takeoffT: number | null = null
  let landT: number | null = null
  let t0 = 0
  const ctrl = new CharacterController(h.port, h.motion, {
    onTakeoff: (simTime) => {
      if (takeoffT == null) takeoffT = simTime - t0
    },
    onLand: (info) => {
      if (takeoffT != null && landT == null) landT = info.simTime - t0
    },
  })
  const idle: ControlInput = { forward: 0, backward: 0, left: 0, right: 0, run: false }
  const script: ControlInput = { forward: 1, backward: 0, left: 0, right: 0, run: sprint }
  ctrl.onEnterPlaying()
  let frames = 0
  const frame = (input: ControlInput) => {
    const d = clock.begin(schedule.next(), true)
    h.motion.beginFrame(d)
    if (d > 0) ctrl.stepFrame(d, input, 0, 'toggle')
    frames++
  }

  // standstill settle (the first frame after entering PLAYING is discarded by FrameClock)
  while (ctrl.simTime < SETTLE_S) frame(idle)
  if (!h.port.isGroundedRaw) throw new Error(`${schedule.label}: not grounded after settle`)
  t0 = ctrl.simTime
  const p0 = h.port.position
  const samples: Sample[] = [{ t: 0, x: p0.x, y: p0.y, z: p0.z, grounded: true }]

  // t = 0: jump + forward (+ run)
  ctrl.pressJump()
  let guard = 0
  while (landT == null) {
    frame(script)
    const p = h.port.position
    samples.push({ t: ctrl.simTime - t0, x: p.x, y: p.y, z: p.z, grounded: h.port.isGroundedRaw })
    if (!Number.isFinite(p.x + p.y + p.z)) throw new Error(`${schedule.label}: NaN position`)
    if (++guard > 2000 || ctrl.simTime - t0 > 3) throw new Error(`${schedule.label}: no landing within 3 s`)
  }
  if (takeoffT == null || Math.abs(takeoffT) > 1e-9) throw new Error(`${schedule.label}: takeoff at ${takeoffT}, expected 0`)

  const landIndex = samples.length - 1
  const a = samples[landIndex - 3]
  const b = samples[landIndex - 2]
  const c = samples[landIndex - 1]
  if (a.grounded || b.grounded || c.grounded || a.t <= 0) throw new Error(`${schedule.label}: fewer than 3 airborne samples before landing`)
  const tc = crossingTime(a, b, c, p0.y)
  const vx = (c.x - b.x) / (c.t - b.t)
  const vz = (c.z - b.z) / (c.t - b.t)
  const touch = { x: c.x + vx * (tc - c.t) - p0.x, z: c.z + vz * (tc - c.t) - p0.z }
  const end = samples[landIndex]
  let apex = -Infinity
  for (const s of samples) apex = Math.max(apex, s.y - p0.y)

  // release and stand: the landing must hold on the flat floor
  for (let i = 0; i < 30; i++) frame(idle)
  if (!h.port.isGroundedRaw) throw new Error(`${schedule.label}: not grounded after landing`)

  return {
    dt: schedule.label,
    frames,
    airFrames: landIndex - 1,
    apex: round(apex, 4),
    touchdownT: round(tc, 4),
    touchdownXZ: [round(touch.x, 4), round(touch.z, 4)],
    landFrameEndT: round(end.t, 4),
    landFrameEndXZ: [round(end.x - p0.x, 4), round(end.z - p0.z, 4)],
    _apex: apex,
    _touch: touch,
    _end: { x: end.x - p0.x, z: end.z - p0.z },
  }
}

function spread(rows: ReturnType<typeof runCase>[]) {
  const apexes = rows.map((r) => r._apex)
  let dxz = 0
  let dxzEnd = 0
  for (const r of rows)
    for (const s of rows) {
      dxz = Math.max(dxz, Math.hypot(r._touch.x - s._touch.x, r._touch.z - s._touch.z))
      dxzEnd = Math.max(dxzEnd, Math.hypot(r._end.x - s._end.x, r._end.z - s._end.z))
    }
  return { dApex: Math.max(...apexes) - Math.min(...apexes), dXZ: dxz, dXZframeEnd: dxzEnd }
}

const results: Record<string, unknown> = {
  movementApexM: movement.apexM,
  thresholds: { dApexMax: MAX_DAPEX, dXZmax: MAX_DXZ },
}
let ok = true
for (const [name, sprint] of [
  ['walk', false],
  ['sprint', true],
] as const) {
  const rows = schedules().map((s) => runCase(s, sprint))
  const d = spread(rows)
  const pass = d.dApex <= MAX_DAPEX && d.dXZ <= MAX_DXZ
  ok &&= pass
  results[name] = {
    pass,
    dApex: round(d.dApex, 4),
    dXZ: round(d.dXZ, 4),
    dXZframeEnd_info: round(d.dXZframeEnd, 4),
    cases: rows.map(({ _apex, _touch, _end, ...r }) => r),
  }
  console.log(`TEST-31 ${name} ` + JSON.stringify(results[name]))
}

if (!ok) {
  console.log('TEST-31 FAIL ' + JSON.stringify(results))
  throw new Error('TEST-31 FAIL ' + JSON.stringify(results))
}
console.log('TEST-31 PASS ' + JSON.stringify(results))
