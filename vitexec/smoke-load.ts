// TEST-01 (smoke, G1): within 15 s of navigation the canvas exists, ≥60 app frames ran and worldReady === true;
// every BVH bake (physics and camera worlds) is logged; then, while PLAYING and walking, the model scene uuid
// stays the same for 600 frames while the zustand store read by the DOM overlay changes exactly once in every
// 100 ms slot of the page clock that the window crosses (D-035: no slot skipped = ≥10 Hz).
// Timing: performance.now() counts from navigation start (timeOrigin). Runner error lines: scripts/run-test.mjs.
import { keyboard, mouse } from 'vitexec'
import { useUi } from '/src/game/store.ts'
import { seedNoRawInput } from '/vitexec/lib/move-smoke.ts'

type Snap = {
  state: string
  worldReady: boolean
  frame: number
  model: { uuid: string }
  player: { pos: number[] }
  bvh: { buildMs: Record<string, number>; tris: Record<string, number> }
  events: Array<{ t: number; type: string; data?: unknown }>
}
type G = Snap & { snapshot(): Snap }
const g = () => (window as unknown as { __game?: G }).__game
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r))
const r2 = (v: number) => Math.round(v * 100) / 100

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

let pageErrors = 0
window.addEventListener('error', () => pageErrors++)
window.addEventListener('unhandledrejection', () => pageErrors++)

const failures: string[] = []
const LOAD_DEADLINE_MS = 15000

// ---- 1. load: canvas, ≥60 app frames, worldReady, all within 15 s of navigation -------------------------------
const tScript = performance.now()
let tCanvas: number | null = null
let tWorldReady: number | null = null
let tFrames60: number | null = null
let rafWithCanvas = 0
for (;;) {
  const now = performance.now()
  const canvas = document.querySelector('canvas')
  if (canvas != null) {
    if (tCanvas == null) tCanvas = now
    rafWithCanvas++
  }
  const s = g()?.snapshot()
  if (tWorldReady == null && s?.worldReady === true) tWorldReady = now
  if (tFrames60 == null && (s?.frame ?? 0) >= 60) tFrames60 = now
  if (tCanvas != null && tWorldReady != null && tFrames60 != null) break
  if (now > LOAD_DEADLINE_MS) break
  await nextFrame()
}
const tLoaded = Math.max(tCanvas ?? Infinity, tWorldReady ?? Infinity, tFrames60 ?? Infinity)
const load = {
  tScriptMs: Math.round(tScript),
  tCanvasMs: tCanvas == null ? null : Math.round(tCanvas),
  tWorldReadyMs: tWorldReady == null ? null : Math.round(tWorldReady),
  tFrames60Ms: tFrames60 == null ? null : Math.round(tFrames60),
  appFramesAtLoad: g()?.frame ?? 0,
  rafWithCanvas,
}
console.log('load ' + JSON.stringify(load))
if (!(tLoaded <= LOAD_DEADLINE_MS)) failures.push(`load not complete within ${LOAD_DEADLINE_MS} ms: ${JSON.stringify(load)}`)

// ---- 2. MENU, then BVH bake times of every world ---------------------------------------------------------------
const tMenu0 = performance.now()
while (g()?.state !== 'MENU') {
  if (performance.now() - tMenu0 > 30000) throw new Error('TEST-01 FAIL no MENU, state=' + g()?.state + ' ' + JSON.stringify(load))
  await sleep(50)
}
const tMenu = performance.now()
const menuSnap = g()!.snapshot()
const bvh = menuSnap.bvh
const bvhEvents = menuSnap.events.filter((e) => e.type === 'bvhBuild')
console.log('bvh ' + JSON.stringify(bvh))
for (const e of bvhEvents) console.log('bvhBuild ' + JSON.stringify({ t: r2(e.t), ...(e.data as object) }))
const names = Object.keys(bvh.buildMs)
const perWorld: Record<string, { bodies: number; ms: number; tris: number }> = {}
for (const n of names) {
  const world = n.split(':')[0]
  const w = (perWorld[world] ??= { bodies: 0, ms: 0, tris: 0 })
  w.bodies++
  w.ms = r2(w.ms + bvh.buildMs[n])
  w.tris += bvh.tris[n] ?? 0
}
console.log('bvh per world ' + JSON.stringify(perWorld))
for (const world of ['physics', 'camera']) {
  if (perWorld[world] == null) failures.push(`no BVH bake logged for the ${world} world`)
}
for (const n of names) {
  if (!Number.isFinite(bvh.buildMs[n]) || bvh.buildMs[n] < 0) failures.push(`bad BVH bake time ${n}=${bvh.buildMs[n]}`)
}

// ---- 3. Play (real click), pointer lock on the canvas, PLAYING -------------------------------------------------
seedNoRawInput() // D-040 test isolation from the machine's physical mouse
const button = document.querySelector('.panel button')
if (!(button instanceof HTMLElement)) throw new Error('TEST-01 FAIL no Play button')
const rect = button.getBoundingClientRect()
await mouse.moveTo(rect.x + rect.width / 2, rect.y + rect.height / 2)
await mouse.click()
const canvas = document.querySelector('canvas')
for (let i = 0; i < 120 && !(document.pointerLockElement === canvas && g()?.state === 'PLAYING'); i++) await nextFrame()
if (!(document.pointerLockElement === canvas && g()?.state === 'PLAYING')) {
  throw new Error('TEST-01 FAIL no PLAYING + pointer lock after Play: ' + JSON.stringify({ state: g()?.state, locked: document.pointerLockElement === canvas }))
}
console.log('playing ' + JSON.stringify({ locked: true, active: document.activeElement?.tagName }))
await sleep(300)

// ---- 4. 600-frame window while walking ------------------------------------------------------------------------
type Change = { t: number; hud: boolean; keys: string[] }
const changes: Change[] = []
const unsubscribe = useUi.subscribe((s, prev) => {
  const t = performance.now()
  const keys = (Object.keys(s) as Array<keyof typeof s>).filter((k) => s[k] !== prev[k])
  changes.push({ t, hud: s.hud !== prev.hud, keys })
})
let domMutations = 0
const overlay = document.querySelector('.overlay')
const mo = new MutationObserver((list) => (domMutations += list.length))
if (overlay) mo.observe(overlay, { subtree: true, childList: true, characterData: true, attributes: true })

const WINDOW_FRAMES = 600
const uuids = new Set<string>()
let uuidEmpty = 0
let tStart = 0
let tEnd = 0
let tAfter = 0
let appFrame0 = 0
let appFrame1 = 0
let stateChanges = 0
let maxRafGap = 0
let lastRaf = 0
let pos0: number[] = []
let pos1: number[] = []
const windowDone = new Promise<void>((resolve) => {
  let n = 0
  const tick = () => {
    const now = performance.now()
    const s = g()!.snapshot()
    if (n === 0) {
      tStart = now
      appFrame0 = s.frame
      pos0 = s.player.pos
    } else {
      maxRafGap = Math.max(maxRafGap, now - lastRaf)
    }
    lastRaf = now
    if (n < WINDOW_FRAMES) {
      if (s.model.uuid === '') uuidEmpty++
      else uuids.add(s.model.uuid)
      if (s.state !== 'PLAYING') stateChanges++
    }
    n++
    if (n === WINDOW_FRAMES) {
      tEnd = now
      appFrame1 = s.frame
      pos1 = s.player.pos
    }
    // one more frame: a slot boundary crossed after that frame's HUD sample but before tEnd is written next frame
    if (n === WINDOW_FRAMES + 1) {
      tAfter = now
      resolve()
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

// walk back and forth along the clear +Z lane from spawn (S = away from the camera's -Z view, W = back)
let walking = true
const walk = (async () => {
  let key: 'KeyS' | 'KeyW' = 'KeyS'
  while (walking) {
    await keyboard.down(key)
    const t0 = performance.now()
    while (walking && performance.now() - t0 < 2000) await sleep(50)
    await keyboard.up(key)
    key = key === 'KeyS' ? 'KeyW' : 'KeyS'
  }
})()
await windowDone
walking = false
await walk
unsubscribe()
mo.disconnect()

// ---- 5. evaluate ------------------------------------------------------------------------------------------------
const firstSlot = Math.floor(tStart / 100) + 1 // first boundary crossed after the window started
const lastSlot = Math.floor(tEnd / 100) // last boundary crossed by the 600th frame
const inWindow = changes.filter((c) => c.t <= tAfter)
const perSlot = new Map<number, Change[]>()
for (const c of inWindow) {
  const k = Math.floor(c.t / 100)
  if (k < firstSlot || k > lastSlot) continue
  const list = perSlot.get(k) ?? []
  list.push(c)
  perSlot.set(k, list)
}
const badSlots: Array<{ slot: number; n: number; offsetsMs: number[]; keys: string[][] }> = []
for (let k = firstSlot; k <= lastSlot; k++) {
  const list = perSlot.get(k) ?? []
  if (list.length !== 1) badSlots.push({ slot: k, n: list.length, offsetsMs: list.map((c) => r2(c.t - k * 100)), keys: list.map((c) => c.keys) })
}
const slotsCrossed = lastSlot - firstSlot + 1
const checkedChanges = [...perSlot.values()].reduce((a, l) => a + l.length, 0)
const windowS = (tEnd - tStart) / 1000
const nonHudChanges = inWindow.filter((c) => c.t >= tStart && c.t <= tEnd && !(c.keys.length === 1 && c.keys[0] === 'hud')).length
const dist = Math.hypot((pos1[0] ?? 0) - (pos0[0] ?? 0), (pos1[2] ?? 0) - (pos0[2] ?? 0))
const minBoundaryOffsetMs = inWindow.length ? r2(Math.min(...inWindow.map((c) => c.t % 100))) : null

const numbers = {
  ...load,
  tMenuMs: Math.round(tMenu),
  bvhWorlds: perWorld,
  bvhBodies: names.length,
  windowFrames: WINDOW_FRAMES,
  appFrames: appFrame1 - appFrame0,
  windowS: r2(windowS),
  maxRafGapMs: r2(maxRafGap),
  uuid: [...uuids][0] ?? null,
  uuidDistinct: uuids.size,
  uuidEmpty,
  slotsCrossed,
  slotsWithOneChange: slotsCrossed - badSlots.length,
  badSlots: badSlots.slice(0, 10),
  storeChanges: checkedChanges,
  changesPerS: r2(inWindow.filter((c) => c.t >= tStart && c.t <= tEnd).length / windowS),
  nonHudChanges,
  minBoundaryOffsetMs,
  domMutations,
  stateLeftPlaying: stateChanges,
  walkedM: r2(dist),
  pageErrors,
}

if (uuids.size !== 1 || uuidEmpty > 0) failures.push(`model scene uuid not stable over ${WINDOW_FRAMES} frames: distinct=${uuids.size} empty=${uuidEmpty}`)
if (slotsCrossed < 1) failures.push('window crossed no 100 ms slot')
if (badSlots.length > 0) failures.push(`${badSlots.length} of ${slotsCrossed} 100 ms slots without exactly one store change`)
if (stateChanges > 0) failures.push(`state left PLAYING during the window (${stateChanges} frames)`)
if (pageErrors > 0) failures.push(`${pageErrors} page errors`)

if (failures.length > 0) {
  console.log('TEST-01 numbers ' + JSON.stringify(numbers))
  throw new Error('TEST-01 FAIL ' + failures.join('; '))
}
console.log('TEST-01 PASS ' + JSON.stringify(numbers))
