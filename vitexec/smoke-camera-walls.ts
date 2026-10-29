// TEST-10 (DIRECTIVE §7, smoke, G1): orbit 360° at 3 positions near walls → 0 frames with the camera inside a collider;
// strafing past the 10 cm pole → distance unchanged; camera distance ≥0.35.
// Positions are reached by walking (mouse aims the camera, W walks; no teleport — not allowlisted for TEST-10):
// beside the thin wall, beside the thick wall, and in the inside corner. At each one the camera orbits 2π with real
// relative mouse movement at the default pitch and at +35° (camera low, near the floor). Every rAF sample's
// __game.camera.pos is tested strictly inside every collider box (static blockout boxes with their rotation, and the
// movers' live colliders). The pole strafe: the character stands so the pole lies between it and the camera and
// strafes across it with D; distance must equal the zoom (±0.002) with no blocker hit, and the camera ray must
// actually cross the pole axis in at least one sample (validity).
import { mouse } from 'vitexec'
import { Euler, Matrix4, Vector3 } from 'three'
import { BLOCKOUT } from '/src/level/blockout.ts'
import { game as liveGame } from '/src/game/game.ts'
import { Recorder, bootToPlaying, game, logRenderer, nextFrame, r3, sleep, turnToYaw, wrap } from '/vitexec/lib/move-smoke.ts'

type Cam = { yaw: number; pitch: number; distance: number; zoom: number; lastHit: number | null; pos: number[] }
type Full = { player: { pos: number[] }; camera: Cam; state: string }
const full = () => (window as unknown as { __game: { snapshot(): Full } }).__game.snapshot()

const MIN_DIST = 0.35
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }
const canvas = await bootToPlaying()
const H = canvas.getBoundingClientRect().height
const rec = new Recorder()
rec.start()

// ---- collider inside test ---------------------------------------------------------------------------------------
type Box = { id: string; inv: Matrix4 | null; half: Vector3; live?: () => Matrix4 }
const boxes: Box[] = BLOCKOUT.filter((b) => b.collider && !b.motion).map((b) => {
  const m = new Matrix4().makeRotationFromEuler(new Euler(b.rotX ?? 0, b.rotY ?? 0, 0, 'YXZ')).setPosition(new Vector3(...b.pos))
  return { id: b.id, inv: m.clone().invert(), half: new Vector3(...b.size).multiplyScalar(0.5) }
})
for (const p of liveGame.motion.platforms.values()) {
  const size = new Vector3()
  p.collider.geometry.boundingBox!.getSize(size)
  boxes.push({ id: p.id, inv: null, half: size.multiplyScalar(0.5), live: () => p.collider.matrixWorld })
}
const local = new Vector3()
const inv = new Matrix4()
function insideAny(pos: number[]): string | null {
  for (const b of boxes) {
    const m = b.inv ?? inv.copy(b.live!()).invert()
    local.set(pos[0], pos[1], pos[2]).applyMatrix4(m)
    if (Math.abs(local.x) < b.half.x && Math.abs(local.y) < b.half.y && Math.abs(local.z) < b.half.z) return b.id
  }
  return null
}

// ---- per-frame camera sampler -----------------------------------------------------------------------------------
type CamSample = { t: number; phase: string; cam: Cam; feet: number[] }
const camSamples: CamSample[] = []
let phase = 'walk'
let sampling = true
const tick = () => {
  if (!sampling) return
  const s = full()
  camSamples.push({ t: performance.now(), phase, cam: s.camera, feet: s.player.pos })
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

// ---- movement helpers (real input only) --------------------------------------------------------------------------
async function walkTo(tx: number, tz: number, label: string) {
  for (let i = 0; i < 14; i++) {
    const p = full().player.pos
    const d = Math.hypot(tx - p[0], tz - p[2])
    if (d < 0.3) break
    await turnToYaw(Math.atan2(-(tx - p[0]), -(tz - p[2])))
    await rec.hold('KeyW', Math.min(1500, Math.max(120, (d / 3) * 1000)))
    await sleep(80)
    const q = full().player.pos
    if (Math.hypot(q[0] - p[0], q[2] - p[2]) < 0.03) break // blocked (against the wall)
  }
  const p = full().player.pos
  return { label, target: [tx, tz], reached: [r3(p[0]), r3(p[2])], offM: r3(Math.hypot(tx - p[0], tz - p[2])) }
}

async function setPitch(target: number) {
  for (let i = 0; i < 3; i++) {
    const err = target - full().camera.pitch
    const dy = Math.round((-err * H) / 4)
    if (Math.abs(dy) < 1) return
    await mouse.move(0, dy)
    for (let k = 0; k < 3; k++) await nextFrame()
  }
}

async function orbit(label: string) {
  const startIdx = camSamples.length
  const yaw0 = full().camera.yaw
  phase = label
  const totalPx = Math.round((-2 * Math.PI * H) / 4) // yaw +2π
  const steps = 12
  let swept = 0
  let prevYaw = yaw0
  for (let i = 0; i < steps; i++) {
    await mouse.move(Math.round(totalPx / steps), 0, { durationMs: 150 })
    for (let k = 0; k < 2; k++) await nextFrame()
    const y = full().camera.yaw
    swept += wrap(y - prevYaw)
    prevYaw = y
  }
  phase = 'idle'
  const s = camSamples.slice(startIdx)
  const insides = s.map((x) => insideAny(x.cam.pos)).filter((x): x is string => x != null)
  return {
    label,
    samples: s.length,
    sweptRad: r3(swept),
    pitch: s.length ? s[0].cam.pitch : null,
    minDist: r3(Math.min(...s.map((x) => x.cam.distance))),
    pulledInSamples: s.filter((x) => x.cam.distance < x.cam.zoom - 0.001).length,
    insideSamples: insides.length,
    insideOf: [...new Set(insides)],
  }
}

const DEG = Math.PI / 180
const spots: Array<[string, number, number]> = [
  ['thin wall (west face)', 8.15, 6],
  ['thick wall (east face)', -12.4, 8],
  ['inside corner', -12.4, 12.4],
]
const orbits: unknown[] = []
const walks: unknown[] = []
for (const [label, x, z] of spots) {
  walks.push(await walkTo(x, z, label))
  await sleep(200)
  await setPitch(-20 * DEG)
  const o1 = await orbit(`${label} @ -20°`)
  await setPitch(35 * DEG)
  const o2 = await orbit(`${label} @ +35°`)
  orbits.push(o1, o2)
  for (const o of [o1, o2]) {
    if (o.insideSamples > 0) failures.push(`${o.label}: camera inside ${o.insideOf.join(',')} in ${o.insideSamples} frames`)
    if (o.minDist < MIN_DIST) failures.push(`${o.label}: distance ${o.minDist} < ${MIN_DIST}`)
    if (Math.abs(o.sweptRad) < 2 * Math.PI - 0.1) failures.push(`${o.label}: orbit swept only ${o.sweptRad} rad`)
    if (o.samples < 30) failures.push(`${o.label}: only ${o.samples} samples`)
  }
  await setPitch(-20 * DEG)
}
out.walks = walks
out.orbits = orbits
const wallPulls = (orbits as Array<{ pulledInSamples: number }>).reduce((n, o) => n + o.pulledInSamples, 0)
out.wallPulledInSamples = wallPulls
if (wallPulls === 0) failures.push('setup: no orbit sample pulled the camera in — positions are not near walls')

// ---- pole strafe -------------------------------------------------------------------------------------------------
walks.push(await walkTo(1, 1, 'pole strafe start'))
await turnToYaw(0)
await setPitch(-20 * DEG)
await sleep(300)
const strafeStart = camSamples.length
phase = 'strafe'
await rec.hold('KeyD', 1400)
await sleep(100)
phase = 'idle'
const strafe = camSamples.slice(strafeStart)
const POLE: [number, number] = [3, 4]
const segDist = (ax: number, az: number, bx: number, bz: number, px: number, pz: number) => {
  const vx = bx - ax
  const vz = bz - az
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)))
  return Math.hypot(ax + t * vx - px, az + t * vz - pz)
}
const crossings = strafe.filter((s) => segDist(s.feet[0], s.feet[2], s.cam.pos[0], s.cam.pos[2], POLE[0], POLE[1]) <= 0.05).length
const distChanged = strafe.filter((s) => Math.abs(s.cam.distance - s.cam.zoom) > 0.002 || s.cam.lastHit != null).length
const xs = strafe.map((s) => s.feet[0])
out.strafe = { samples: strafe.length, feetX: [r3(Math.min(...xs)), r3(Math.max(...xs))], zoom: strafe[0]?.cam.zoom, distRange: [r3(Math.min(...strafe.map((s) => s.cam.distance))), r3(Math.max(...strafe.map((s) => s.cam.distance)))], rayCrossedPoleSamples: crossings, distChangedSamples: distChanged }
if (distChanged > 0) failures.push(`pole strafe: distance changed or blocker hit in ${distChanged} samples`)
if (crossings === 0) failures.push('setup: the camera ray never crossed the pole during the strafe')

sampling = false
rec.stop()
const all = camSamples.map((s) => s.cam.distance)
out.allSamples = { n: all.length, minDist: r3(Math.min(...all)), insideAnyFrame: camSamples.filter((s) => insideAny(s.cam.pos) != null).length }
if (Math.min(...all) < MIN_DIST) failures.push(`distance ${Math.min(...all)} < ${MIN_DIST} somewhere in the run`)

if (failures.length > 0) {
  console.log('TEST-10 numbers ' + JSON.stringify(out))
  throw new Error('TEST-10 FAIL ' + failures.join('; '))
}
console.log('TEST-10 PASS ' + JSON.stringify(out))
