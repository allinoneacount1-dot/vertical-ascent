// TEST-09 (DIRECTIVE §7, smoke, G1): yaw/pitch respond to mouse.move; distance ∈ [2.5, 6]; run+jump loop 10 s →
// per-frame distance change ≤2 m except during collision; pitch ∈ [-75°, 50°].
// Method: real click on Play (pointer lock verified), then only vitexec trusted mouse/keyboard input.
// - Response: mouse.move(+180, 0) and mouse.move(0, +90) against the app mapping dYaw = -(dx / H) * 4,
//   dPitch = -(dy / H) * 4 (H = canvas height). "Responds" = measured change has the mapped sign and at least half the
//   mapped magnitude (ratio logged).
// - Pitch clamp: push 1200 px down (≈ -6.7 rad requested), 1200 px + 600 px up (≈ +10 rad); the pitch must sit at
//   the limits and never leave [-75°, 50°] in any rAF sample of the whole script (tolerance 0.0005 rad = rounding of
//   __game, which reports 3 decimals). KeyR recentres afterwards.
// - Distance: every rAF sample: zoom (configured distance) ∈ [2.5, 6]; actual distance ≤ zoom and ≥ 0.35.
//   Outside collision the actual distance equals the zoom, so it is in [2.5, 6] too. Collision frame = camera.lastHit
//   != null (a blocker hit within the camera ray) in that sample or the previous one, or the camera still pulled in
//   (distance < zoom - 0.001, ease-out after a hit).
// - Loop: hold W, toggle sprint (default sprint mode), Space every 1 s, steer a 6 × 16 m rectangle on the open floor
//   (x -2..4, z 8..24) by re-aiming the yaw with mouse.move from fresh state for 10 s. Per-frame |Δdistance| ≤ 2 m
//   for every consecutive sample pair in the loop where neither sample is a collision frame (lastHit != null).
import { keyboard, mouse } from 'vitexec'

type V3 = [number, number, number]
type Snap = {
  state: string
  frame: number
  player: { pos: V3; vel: V3; groundedRaw: boolean; sprintActive: boolean }
  camera: { yaw: number; pitch: number; distance: number; zoom: number; lastHit: number | null; pos: V3 }
  events: Array<{ t: number; type: string; data?: unknown }>
}
type G = { state: string; snapshot(): Snap }
const g = () => (window as unknown as { __game?: G }).__game
const snap = () => (g() as G).snapshot()
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r))
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await nextFrame()
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const r4 = (v: number) => Math.round(v * 1e4) / 1e4
const DEG = Math.PI / 180

const ID = 'TEST-09'
const MIN_PITCH = -75 * DEG
const MAX_PITCH = 50 * DEG
const ROUND_TOL = 0.0005
const ZOOM_MIN = 2.5
const ZOOM_MAX = 6
const MIN_DIST = 0.35
const MAX_STEP_M = 2
const LOOP_MS = 10000

// renderer string, exactly as vitexec/probes/env.ts
{
  const gl = document.createElement('canvas').getContext('webgl2')
  if (!gl) throw new Error('no webgl2')
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
  console.log('env ' + JSON.stringify({ ua: navigator.userAgent, renderer, vendor, dpr: devicePixelRatio, ext: !!ext }))
  if (/swiftshader|llvmpipe/i.test(String(renderer))) console.warn('software renderer')
}

// ---- boot: MENU → real click on Play → pointer lock → PLAYING ------------------------------------------------
const tBoot = performance.now()
while (g()?.state !== 'MENU') {
  if (performance.now() - tBoot > 30000) throw new Error(`${ID} FAIL setup: no MENU, state=${g()?.state}`)
  await sleep(100)
}
const canvas = document.querySelector('canvas')
const play = document.querySelector<HTMLButtonElement>('.panel button')
if (!canvas || !play) throw new Error(`${ID} FAIL setup: canvas or Play button missing`)
{
  const r = play.getBoundingClientRect()
  await mouse.moveTo(r.x + r.width / 2, r.y + r.height / 2)
  await mouse.click()
}
for (let i = 0; i < 120 && !(document.pointerLockElement === canvas && g()?.state === 'PLAYING'); i++) await nextFrame()
if (!(document.pointerLockElement === canvas && g()?.state === 'PLAYING')) {
  throw new Error(`${ID} FAIL setup: not PLAYING with lock (state=${g()?.state}, locked=${document.pointerLockElement === canvas})`)
}
await sleep(300) // D-033: first delta discarded, rotation ignored for 150 ms after lock
const H = canvas.getBoundingClientRect().height

// ---- per-rAF sampler -----------------------------------------------------------------------------------------
type Sample = { f: number; t: number; phase: string; state: string; yaw: number; pitch: number; dist: number; zoom: number; hit: number | null; pos: V3; sprint: boolean }
let phase = 'start'
const samples: Sample[] = []
let sampling = true
let lastFrame = -1
const sampleLoop = () => {
  if (!sampling) return
  const s = snap()
  if (s.frame !== lastFrame) {
    lastFrame = s.frame
    const c = s.camera
    samples.push({ f: s.frame, t: performance.now(), phase, state: s.state, yaw: c.yaw, pitch: c.pitch, dist: c.distance, zoom: c.zoom, hit: c.lastHit, pos: s.player.pos, sprint: s.player.sprintActive })
  }
  requestAnimationFrame(sampleLoop)
}
requestAnimationFrame(sampleLoop)
await frames(3)

/** Turns the camera yaw to `target` with settled relative moves (≤1200 px per call). */
async function aimYaw(target: number): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const err = wrap(target - snap().camera.yaw)
    const px = Math.round((-err * H) / 4)
    if (Math.abs(px) < 1) return
    await mouse.move(Math.max(-1200, Math.min(1200, px)), 0)
    await frames(2)
  }
}

// ---- 1. yaw / pitch respond to mouse.move ---------------------------------------------------------------------
phase = 'yaw'
const PX_YAW = 180
const PX_PITCH = 90
let a = snap()
await mouse.move(PX_YAW, 0)
await frames(3)
let b = snap()
const yawDelta = b.camera.yaw - a.camera.yaw
const yawExpected = -(PX_YAW / H) * 4
await mouse.move(-PX_YAW, 0)
await frames(3)

phase = 'pitch'
a = snap()
await mouse.move(0, PX_PITCH)
await frames(3)
b = snap()
const pitchDelta = b.camera.pitch - a.camera.pitch
const pitchExpected = -(PX_PITCH / H) * 4
await mouse.move(0, -PX_PITCH)
await frames(3)

const responds = (d: number, e: number) => Math.sign(d) === Math.sign(e) && Math.abs(d) >= 0.5 * Math.abs(e)

// ---- 2. pitch limits: push far beyond both ----------------------------------------------------------------------
phase = 'pitch-down'
await mouse.move(0, 1200)
await frames(3)
const pitchAtDown = snap().camera.pitch
phase = 'pitch-up'
await mouse.move(0, -1200)
await frames(3)
const pitchAtUp1 = snap().camera.pitch
await mouse.move(0, -600)
await frames(3)
const pitchAtUp2 = snap().camera.pitch
phase = 'recentre'
await keyboard.press('KeyR')
await sleep(500)
const afterRecentre = snap().camera

// ---- 3. run + jump loop, 10 s --------------------------------------------------------------------------------
const WAYPOINTS: Array<[number, number]> = [
  [-2, 8],
  [-2, 24],
  [4, 24],
  [4, 8],
]
const towards = (s: Snap, tx: number, tz: number) => Math.atan2(-(tx - s.player.pos[0]), -(tz - s.player.pos[2]))
await aimYaw(towards(snap(), WAYPOINTS[0][0], WAYPOINTS[0][1]))
await sleep(100)
phase = 'loop'
const takeoffsBefore = snap().events.filter((e) => e.type === 'takeoff').length
const loopStartIdx = samples.length
await keyboard.down('KeyW')
await sleep(120)
await keyboard.press('ShiftLeft') // toggle sprint on (default sprint mode 'toggle')
const tLoop = performance.now()
let wi = 0
let nextJump = tLoop + 300
let sprintFixed = false
while (performance.now() - tLoop < LOOP_MS) {
  const s = snap()
  if (Math.hypot(WAYPOINTS[wi][0] - s.player.pos[0], WAYPOINTS[wi][1] - s.player.pos[2]) < 2) wi = (wi + 1) % WAYPOINTS.length
  const err = wrap(towards(s, WAYPOINTS[wi][0], WAYPOINTS[wi][1]) - s.camera.yaw)
  const px = Math.round((-err * H) / 4)
  if (Math.abs(px) >= 3) await mouse.move(Math.max(-600, Math.min(600, px)), 0, { durationMs: 80 })
  else await sleep(40)
  if (performance.now() >= nextJump) {
    await keyboard.press('Space')
    nextJump = performance.now() + 1000
  }
  if (!sprintFixed && performance.now() - tLoop > 600) {
    sprintFixed = true
    if (!snap().player.sprintActive) await keyboard.press('ShiftLeft')
  }
}
const loopEndIdx = samples.length
phase = 'end'
await keyboard.up('KeyW')
await frames(3)
sampling = false
const end = snap()
const takeoffs = end.events.filter((e) => e.type === 'takeoff').length - takeoffsBefore

// ---- evaluation ----------------------------------------------------------------------------------------------
const failures: string[] = []
const loop = samples.slice(loopStartIdx, loopEndIdx)

let pitchMin = Infinity
let pitchMax = -Infinity
let zoomMin = Infinity
let zoomMax = -Infinity
let distMin = Infinity
let distMax = -Infinity
let distOverZoom = 0
let distOutsideRange = 0
for (let i = 0; i < samples.length; i++) {
  const s = samples[i]
  pitchMin = Math.min(pitchMin, s.pitch)
  pitchMax = Math.max(pitchMax, s.pitch)
  zoomMin = Math.min(zoomMin, s.zoom)
  zoomMax = Math.max(zoomMax, s.zoom)
  distMin = Math.min(distMin, s.dist)
  distMax = Math.max(distMax, s.dist)
  if (s.dist > s.zoom + 0.001) distOverZoom++
  const prev = samples[i - 1]
  const collision = s.hit != null || (prev != null && prev.hit != null) || s.dist < s.zoom - 0.001
  if (!collision && (s.dist < ZOOM_MIN || s.dist > ZOOM_MAX)) distOutsideRange++
}

let loopMaxStep = 0
let loopMaxStepAll = 0
let loopCollisionPairs = 0
let loopPathM = 0
for (let i = 1; i < loop.length; i++) {
  const d = Math.abs(loop[i].dist - loop[i - 1].dist)
  loopMaxStepAll = Math.max(loopMaxStepAll, d)
  loopPathM += Math.hypot(loop[i].pos[0] - loop[i - 1].pos[0], loop[i].pos[2] - loop[i - 1].pos[2])
  if (loop[i].hit != null || loop[i - 1].hit != null) {
    loopCollisionPairs++
    continue
  }
  loopMaxStep = Math.max(loopMaxStep, d)
}
const loopSprintShare = loop.length ? loop.filter((s) => s.sprint).length / loop.length : 0
const loopMs = loop.length ? loop[loop.length - 1].t - loop[0].t : 0

const numbers = {
  H,
  yaw: { px: PX_YAW, delta: r4(yawDelta), expected: r4(yawExpected), ratio: r4(yawDelta / yawExpected) },
  pitch: { px: PX_PITCH, delta: r4(pitchDelta), expected: r4(pitchExpected), ratio: r4(pitchDelta / pitchExpected) },
  clamp: { atDown: pitchAtDown, atUp1: pitchAtUp1, atUp2: pitchAtUp2, limits: [r4(MIN_PITCH), r4(MAX_PITCH)], recentre: { yaw: afterRecentre.yaw, pitch: afterRecentre.pitch } },
  all: { samples: samples.length, pitchMin, pitchMax, zoomMin, zoomMax, distMin, distMax, distOverZoom, distOutsideRangeNoCollision: distOutsideRange },
  loop: { samples: loop.length, ms: Math.round(loopMs), maxStepNoCollision: r4(loopMaxStep), maxStepAll: r4(loopMaxStepAll), collisionPairs: loopCollisionPairs, takeoffs, sprintShare: r4(loopSprintShare), pathM: r4(loopPathM) },
  endState: end.state,
}

if (!responds(yawDelta, yawExpected)) failures.push(`yaw did not respond as mapped (Δ ${r4(yawDelta)} vs ${r4(yawExpected)})`)
if (!responds(pitchDelta, pitchExpected)) failures.push(`pitch did not respond as mapped (Δ ${r4(pitchDelta)} vs ${r4(pitchExpected)})`)
if (Math.abs(pitchAtDown - MIN_PITCH) > ROUND_TOL + 0.0005) failures.push(`pitch not clamped at -75° after pushing down (${pitchAtDown})`)
if (Math.abs(pitchAtUp1 - MAX_PITCH) > ROUND_TOL + 0.0005 || Math.abs(pitchAtUp2 - MAX_PITCH) > ROUND_TOL + 0.0005) failures.push(`pitch not clamped at 50° after pushing up (${pitchAtUp1}, ${pitchAtUp2})`)
if (pitchMin < MIN_PITCH - ROUND_TOL || pitchMax > MAX_PITCH + ROUND_TOL) failures.push(`pitch left [-75°, 50°]: [${pitchMin}, ${pitchMax}]`)
if (zoomMin < ZOOM_MIN || zoomMax > ZOOM_MAX) failures.push(`zoom left [2.5, 6]: [${zoomMin}, ${zoomMax}]`)
if (distMax > ZOOM_MAX + ROUND_TOL) failures.push(`distance > 6: ${distMax}`)
if (distMin < MIN_DIST - ROUND_TOL) failures.push(`distance < 0.35: ${distMin}`)
if (distOverZoom > 0) failures.push(`distance > zoom in ${distOverZoom} samples`)
if (distOutsideRange > 0) failures.push(`distance outside [2.5, 6] without collision in ${distOutsideRange} samples`)
if (loopMaxStep > MAX_STEP_M) failures.push(`per-frame distance change ${r4(loopMaxStep)} m > 2 m outside collision`)
// setup validity: the loop really ran, sprinted and jumped for 10 s
if (loopMs < LOOP_MS - 200) failures.push(`setup: loop sampled only ${Math.round(loopMs)} ms`)
if (takeoffs < 5) failures.push(`setup: only ${takeoffs} takeoffs in the loop`)
if (loopSprintShare < 0.5) failures.push(`setup: sprint active in only ${r4(loopSprintShare)} of loop samples`)
if (end.state !== 'PLAYING') failures.push(`setup: state ${end.state} at the end`)

if (failures.length > 0) {
  console.log(`${ID} numbers ` + JSON.stringify(numbers))
  throw new Error(`${ID} FAIL ${failures.join('; ')} ` + JSON.stringify(numbers))
}
console.log(`${ID} PASS ` + JSON.stringify(numbers))
