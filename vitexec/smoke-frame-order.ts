// TEST-32 (smoke, G1): per-frame update order platform(-3) → controller(-2) → camera(-1) → mixer/HUD(0), 0 violations
// during 2 s of real movement (keyboard W + mouse.move under pointer lock). Order probe (ref/06 allowlist,
// "synthetic: order-probe"): the five prototype methods are wrapped to record their call order, then restored.
// A frame starts at a platform event (PlatformMotion.beginFrame, priority -3). In every frame with a controller
// event: platform < every controller < every camera < every mixer and every HUD event, each kind present.
import { keyboard, mouse } from 'vitexec'
import { AnimationMixer } from 'three'
import { CharacterCameraBehavior } from '@pmndrs/viverse'
import { PlatformMotion } from '/src/level/motion.ts'
import { CharacterController } from '/src/controller/character-controller.ts'
import { HudSampler } from '/src/ui/HudSampler.tsx'
import { seedNoRawInput } from '/vitexec/lib/move-smoke.ts'

type Snap = { state: string; player: { pos: number[] }; camera: { yaw: number; pitch: number } }
type G = Snap & { snapshot(): Snap }
const g = () => (window as unknown as { __game?: G }).__game
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r))
const r3 = (v: number) => Math.round(v * 1000) / 1000

// renderer string, same as vitexec/probes/env.ts
{
  const gl = document.createElement('canvas').getContext('webgl2')
  if (!gl) throw new Error('no webgl2')
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
  console.log('env ' + JSON.stringify({ ua: navigator.userAgent, renderer, vendor, dpr: devicePixelRatio, ext: !!ext }))
  if (/swiftshader|llvmpipe/i.test(String(renderer))) console.warn('software renderer')
}

// observation only (diagnostic numbers): pointer movement the page receives, before and during the probe
const pm = { phase: 'menu' as 'menu' | 'locked' | 'probe', menu: { n: 0, sx: 0, sy: 0 }, locked: { n: 0, sx: 0, sy: 0 }, probe: { n: 0, sx: 0, sy: 0, maxAbsX: 0 } }
document.addEventListener(
  'pointermove',
  (e) => {
    const b = pm[pm.phase] as { n: number; sx: number; sy: number; maxAbsX?: number }
    b.n++
    b.sx += e.movementX
    b.sy += e.movementY
    if (b.maxAbsX != null) b.maxAbsX = Math.max(b.maxAbsX, Math.abs(e.movementX))
  },
  true,
)

// ---- MENU → real click on Play → pointer lock → PLAYING -----------------------------------------------------------
const tMenu0 = performance.now()
while (g()?.state !== 'MENU') {
  if (performance.now() - tMenu0 > 30000) throw new Error('TEST-32 FAIL no MENU, state=' + g()?.state)
  await sleep(50)
}
seedNoRawInput() // D-040 test isolation from the machine's physical mouse
const button = document.querySelector('.panel button')
if (!(button instanceof HTMLElement)) throw new Error('TEST-32 FAIL no Play button')
const rect = button.getBoundingClientRect()
await mouse.moveTo(rect.x + rect.width / 2, rect.y + rect.height / 2)
pm.phase = 'locked'
await mouse.click()
const canvas = document.querySelector('canvas')
for (let i = 0; i < 120 && !(document.pointerLockElement === canvas && g()?.state === 'PLAYING'); i++) await nextFrame()
if (!(document.pointerLockElement === canvas && g()?.state === 'PLAYING')) {
  throw new Error('TEST-32 FAIL no PLAYING + pointer lock after Play: ' + JSON.stringify({ state: g()?.state, locked: document.pointerLockElement === canvas }))
}
const camAtPlaying = g()!.snapshot().camera
await sleep(300)

// ---- order probe --------------------------------------------------------------------------------------------------
type Kind = 'platform' | 'controller' | 'camera' | 'mixer' | 'hud'
const calls: Kind[] = []
let recording = false
const restores: Array<() => void> = []
const originals: Array<{ p: Record<string, unknown>; method: string; original: unknown }> = []
function probe(proto: object, method: string, kind: Kind): void {
  const p = proto as Record<string, unknown>
  const original = p[method]
  if (typeof original !== 'function') throw new Error(`TEST-32 FAIL ${kind}: ${method} is not a prototype method`)
  p[method] = function (this: unknown, ...args: unknown[]) {
    if (recording) calls.push(kind)
    return (original as (...a: unknown[]) => unknown).apply(this, args)
  }
  originals.push({ p, method, original })
  restores.push(() => {
    p[method] = original
  })
}

console.log('synthetic: order-probe')
const before = g()!.snapshot()
let after: Snap
let tMove = 0
try {
  probe(PlatformMotion.prototype, 'beginFrame', 'platform')
  probe(CharacterController.prototype, 'stepFrame', 'controller')
  probe(CharacterCameraBehavior.prototype, 'update', 'camera')
  probe(AnimationMixer.prototype, 'update', 'mixer')
  probe(HudSampler.prototype, 'sample', 'hud')
  recording = true
  pm.phase = 'probe'
  const t0 = performance.now()
  await keyboard.down('KeyW', { releaseAfterMs: 2000 })
  await mouse.move(300, -40, { durationMs: 1000 })
  while (performance.now() - t0 < 2000) await sleep(10)
  tMove = performance.now() - t0
  recording = false
  after = g()!.snapshot()
} finally {
  recording = false
  for (const restore of restores.reverse()) restore()
}
await keyboard.up('KeyW')
const restored = originals.length === 5 && originals.every((o) => o.p[o.method] === o.original)

// ---- evaluate -----------------------------------------------------------------------------------------------------
const frames: Kind[][] = []
let leading = 0
for (const k of calls) {
  if (k === 'platform') frames.push([k])
  else if (frames.length === 0) leading++
  else frames[frames.length - 1].push(k)
}
const indexes = (f: Kind[], kind: Kind) => f.flatMap((k, i) => (k === kind ? [i] : []))
let controllerFrames = 0
let framesWithoutController = 0
const violations: Array<{ frame: number; seq: string }> = []
frames.forEach((f, n) => {
  const ctl = indexes(f, 'controller')
  if (ctl.length === 0) {
    framesWithoutController++
    return
  }
  controllerFrames++
  const plat = indexes(f, 'platform')
  const cam = indexes(f, 'camera')
  const mix = indexes(f, 'mixer')
  const hud = indexes(f, 'hud')
  const ok =
    plat.length === 1 &&
    plat[0] === 0 &&
    cam.length > 0 &&
    mix.length > 0 &&
    hud.length > 0 &&
    Math.max(...ctl) < Math.min(...cam) &&
    Math.max(...cam) < Math.min(...mix) &&
    Math.max(...cam) < Math.min(...hud)
  if (!ok) violations.push({ frame: n, seq: f.join('>') })
})
const counts: Record<Kind, number> = { platform: 0, controller: 0, camera: 0, mixer: 0, hud: 0 }
for (const k of calls) counts[k]++
const p0 = before.player.pos
const p1 = after!.player.pos
const numbers = {
  moveMs: Math.round(tMove),
  frames: frames.length,
  controllerFrames,
  framesWithoutController,
  leadingCallsBeforeFirstFrame: leading,
  violations: violations.length,
  firstViolations: violations.slice(0, 5),
  counts,
  sampleFrame: frames[Math.floor(frames.length / 2)]?.join('>') ?? null,
  movedM: r3(Math.hypot(p1[0] - p0[0], p1[2] - p0[2])),
  yaw: [camAtPlaying.yaw, before.camera.yaw, after!.camera.yaw],
  pitch: [camAtPlaying.pitch, before.camera.pitch, after!.camera.pitch],
  prototypesRestored: restored,
  pointermove: { menu: pm.menu, locked: pm.locked, probe: pm.probe, canvasH: canvas?.clientHeight ?? null },
}

const failures: string[] = []
if (violations.length > 0) failures.push(`${violations.length} order violations`)
if (controllerFrames < 30) failures.push(`only ${controllerFrames} frames with a controller event (need ≥30)`)
if (!restored) failures.push('prototypes not restored')
if (!(numbers.movedM > 1)) failures.push(`player did not move during the probe (${numbers.movedM} m)`)
if (failures.length > 0) {
  console.log('TEST-32 numbers ' + JSON.stringify(numbers))
  throw new Error('TEST-32 FAIL ' + failures.join('; '))
}
console.log('TEST-32 PASS ' + JSON.stringify(numbers))
