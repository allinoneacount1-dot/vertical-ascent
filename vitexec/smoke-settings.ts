// TEST-39 (DIRECTIVE §7, smoke, G3): every Settings control changes its target (D-021) and is stored in
// va.settings.v1: rebinding (stored as KeyboardEvent.code), WASD/Arrows presets, FOV, sensitivity, invert-Y, raw input,
// UI scale, showTimer, sprint mode, edge guard, recentre key. Volume is TEST-17 (G4). Real input only (vitexec mouse +
// keyboard; no debug teleport — 39 is not on the allowlist). Runs on the slice: --path ?level=slice.
import { keyboard, mouse } from 'vitexec'
import { clickElement, logRenderer, nextFrame, r3, seedNoRawInput, sleep, wrap } from '/vitexec/lib/move-smoke.ts'

type Full = {
  state: string
  player: { pos: number[]; groundedRaw: boolean; sprintActive: boolean; facingYaw: number }
  camera: { yaw: number; pitch: number; fov: number; effectiveFov: number }
  settings: Record<string, unknown> & { bindings: Record<string, string[]> }
  lockOptions: { unadjustedMovement: boolean } | null
  events: Array<{ t: number; type: string }>
}
const full = () => (window as unknown as { __game: { snapshot(): Full } }).__game.snapshot()
const stored = () => JSON.parse(localStorage.getItem('va.settings.v1') ?? '{}') as Record<string, unknown> & { bindings: Record<string, string[]> }
const $ = (sel: string) => {
  const el = document.querySelector(sel)
  if (!(el instanceof HTMLElement)) throw new Error(`TEST-39 FAIL missing ${sel}`)
  return el
}
const click = async (sel: string) => clickElement($(sel))
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }
const canvas = document.querySelector('canvas') as HTMLCanvasElement

async function until(fn: () => boolean, frames = 180): Promise<boolean> {
  for (let i = 0; i < frames; i++) {
    if (fn()) return true
    await nextFrame()
  }
  return fn()
}

/** Sets a range input with real keys: focus by clicking its thumb area, Home, then ArrowRight n times. */
async function setRange(sel: string, steps: number): Promise<void> {
  await click(sel)
  await keyboard.press('Home')
  for (let i = 0; i < steps; i++) await keyboard.press('ArrowRight', { durationMs: 20 })
  await sleep(100)
}

async function enterFromPanel(sel: string): Promise<void> {
  await click(sel)
  if (!(await until(() => full().state === 'PLAYING' && document.pointerLockElement === canvas))) {
    await sleep(450)
    await click(sel) // lock rejected once under Playwright (D-043)
    if (!(await until(() => full().state === 'PLAYING' && document.pointerLockElement === canvas))) throw new Error(`TEST-39 FAIL ${sel} did not enter PLAYING`)
  }
  await sleep(300)
}

async function pauseToSettings(): Promise<void> {
  await keyboard.press('KeyP')
  await until(() => full().state === 'PAUSED')
  await sleep(450)
  await click('[data-testid=panel-pause] [data-testid=settings]')
  await until(() => document.querySelector('[data-testid=panel-settings]') != null)
}

const H = () => canvas.getBoundingClientRect().height
async function measureRotation(dx: number, dy: number): Promise<{ dYaw: number; dPitch: number }> {
  const a = full().camera
  await mouse.move(dx, dy, { durationMs: 120 })
  for (let i = 0; i < 6; i++) await nextFrame()
  const b = full().camera
  return { dYaw: wrap(b.yaw - a.yaw), dPitch: b.pitch - a.pitch }
}

// ---- MENU → Settings: change controls with real input ----------------------------------------------------------------
while (full().state !== 'MENU') await sleep(100)
seedNoRawInput()
await click('[data-testid=settings]')
await until(() => document.querySelector('[data-testid=panel-settings]') != null)

await click('[data-testid=set-show-timer]')
await setRange('[data-testid=set-fov]', 25) // 60 + 25 = 85
await setRange('[data-testid=set-sensitivity]', 18) // 0.2 + 1.8 = 2.0
await click('[data-testid=set-invert-y]')
await setRange('[data-testid=set-ui-scale]', 5) // 1.0 + 0.5 = 1.5
const uiZoom = Number(getComputedStyle($('[data-testid=panel-settings]')).zoom)
// sprint mode: focus the select via its label, ArrowDown toggle → hold
$('[data-testid=set-sprint-mode]').focus()
await keyboard.press('ArrowDown')
await click('[data-testid=set-edge-guard]')
await click('[data-testid=bind-jump]')
await keyboard.press('KeyJ')
await sleep(100)
await click('[data-testid=bind-recentre]')
await keyboard.press('KeyT')
await sleep(150)
const s1 = stored()
out.storedAfterMenu = { showTimer: s1.showTimer, fov: s1.fov, sensitivity: s1.sensitivity, invertY: s1.invertY, uiScale: s1.uiScale, uiZoom, sprintMode: s1.sprintMode, edgeGuard: s1.edgeGuard, jump: s1.bindings?.jump, recentre: s1.bindings?.recentre }
if (s1.showTimer !== false) failures.push('showTimer not stored false')
if (s1.fov !== 85) failures.push(`fov stored ${String(s1.fov)} (want 85)`)
if (Math.abs(Number(s1.sensitivity) - 2) > 1e-6) failures.push(`sensitivity stored ${String(s1.sensitivity)} (want 2)`)
if (s1.invertY !== true) failures.push('invertY not stored true')
if (Math.abs(Number(s1.uiScale) - 1.5) > 1e-6) failures.push(`uiScale stored ${String(s1.uiScale)}`)
if (Math.abs(uiZoom - 1.5) > 0.01) failures.push(`panel zoom ${uiZoom} (want 1.5)`)
if (s1.sprintMode !== 'hold') failures.push(`sprintMode stored ${String(s1.sprintMode)} (want hold)`)
if (s1.edgeGuard !== true) failures.push('edgeGuard not stored true')
if (JSON.stringify(s1.bindings?.jump) !== '["KeyJ"]') failures.push(`jump binding ${JSON.stringify(s1.bindings?.jump)}`)
if (JSON.stringify(s1.bindings?.recentre) !== '["KeyT"]') failures.push(`recentre binding ${JSON.stringify(s1.bindings?.recentre)}`)
await click('[data-testid=settings-back]')
await sleep(200)

// ---- PLAYING: targets -------------------------------------------------------------------------------------------------
await enterFromPanel('[data-testid=play]')
const cam = full().camera
out.fov = { setting: cam.fov, effective: cam.effectiveFov }
if (cam.fov !== 85 || Math.abs(cam.effectiveFov - 85) > 0.5) failures.push(`camera fov ${cam.fov}/${cam.effectiveFov} (want 85)`)
const timerShown = document.querySelector('[data-testid=hud-timer]') != null
out.timerShown = timerShown
if (timerShown) failures.push('HUD timer shown with showTimer off')

// sensitivity: library formula dYaw = -(dx / canvas height) · 4 per unit sensitivity (ref/04)
const rot1 = await measureRotation(200, 0)
const expectYaw = (-(200 / H()) * 4) * 2
out.sensitivity = { dYaw: r3(rot1.dYaw), expected: r3(expectYaw) }
if (Math.abs(rot1.dYaw / expectYaw - 1) > 0.06) failures.push(`yaw ${r3(rot1.dYaw)} vs expected ${r3(expectYaw)} at sensitivity 2`)
const pitchInv = await measureRotation(0, 40)

// sprint mode hold: active only while Shift is held
await keyboard.down('KeyW')
await keyboard.down('ShiftLeft')
await sleep(400)
const sprintHeld = full().player.sprintActive
await keyboard.up('ShiftLeft')
await sleep(300)
const sprintReleased = full().player.sprintActive
await keyboard.up('KeyW')
out.sprintHold = { held: sprintHeld, released: sprintReleased }
if (!sprintHeld || sprintReleased) failures.push(`hold mode: held ${sprintHeld}, released ${sprintReleased}`)
await sleep(500)

// rebinding: Space no longer jumps, J does
const takeoffs = () => full().events.filter((e) => e.type === 'takeoff').length
const t0 = takeoffs()
await keyboard.press('Space')
await sleep(600)
const tSpace = takeoffs()
await keyboard.press('KeyJ')
await sleep(900)
const tJ = takeoffs()
out.rebinding = { afterSpace: tSpace - t0, afterJ: tJ - tSpace }
if (tSpace !== t0) failures.push('Space still jumps after rebinding jump to KeyJ')
if (tJ - tSpace !== 1) failures.push(`KeyJ produced ${tJ - tSpace} takeoffs`)

// recentre on KeyT: camera yaw → facing yaw
await mouse.move(300, 0, { durationMs: 120 })
await sleep(200)
await keyboard.press('KeyT')
await sleep(500)
const rc = full()
out.recentre = { yaw: r3(rc.camera.yaw), facing: r3(rc.player.facingYaw) }
if (Math.abs(wrap(rc.camera.yaw - rc.player.facingYaw)) > 0.05) failures.push(`KeyT recentre left yaw ${r3(rc.camera.yaw)} vs facing ${r3(rc.player.facingYaw)}`)

// edge guard: walk to 0.8 m before the first pad (slice s-r01: centre (0, 0.6, -5), 4 × 4 m), jump on with J,
// then keep walking across it: the guard must stop the player at the far edge
const sens = () => Number(full().settings.sensitivity) || 1
async function aimAt(x: number, z: number): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const p = full().player.pos
    const want = Math.atan2(-(x - p[0]), -(z - p[2]))
    const err = wrap(want - full().camera.yaw)
    if (Math.abs(err) <= 0.03) return
    await mouse.move(Math.max(-700, Math.min(700, Math.round((-err * H()) / (4 * sens())))), 0, { durationMs: 60 })
    for (let k = 0; k < 3; k++) await nextFrame()
  }
}
async function walkTo(x: number, z: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const p = full().player.pos
    const d = Math.hypot(x - p[0], z - p[2])
    if (d < 0.15) return
    await aimAt(x, z)
    await keyboard.press('KeyW', { durationMs: Math.max(25, Math.min(400, Math.round((d / 3) * 1000 * 0.7))) })
    await sleep(30)
  }
}
await walkTo(0, -2.2)
await aimAt(0, -7)
await keyboard.down('KeyW')
await sleep(120)
await keyboard.press('KeyJ')
await until(() => full().player.groundedRaw && full().player.pos[1] > 0.5, 180)
await sleep(2500)
await keyboard.up('KeyW')
await sleep(300)
const onPad = full().player.pos
out.edgeGuardOn = { pos: onPad.map(r3) }
if (!(onPad[1] > 0.55)) failures.push(`edge guard on: fell off the pad (y ${r3(onPad[1])})`)

// ---- Pause → Settings: Arrows preset, invert off, edge guard off, raw input on --------------------------------------
await pauseToSettings()
await click('[data-testid=preset-arrows]')
await click('[data-testid=set-invert-y]')
await click('[data-testid=set-edge-guard]')
await click('[data-testid=set-raw-input]')
await sleep(150)
const s2 = stored()
out.storedAfterPause = { forward: s2.bindings?.forward, invertY: s2.invertY, edgeGuard: s2.edgeGuard, rawInput: s2.rawInput }
if (JSON.stringify(s2.bindings?.forward) !== '["ArrowUp"]') failures.push(`arrows preset forward ${JSON.stringify(s2.bindings?.forward)}`)
if (s2.invertY !== false || s2.edgeGuard !== false || s2.rawInput !== true) failures.push('pause settings not stored')
await click('[data-testid=settings-back]')
await sleep(300)
await enterFromPanel('[data-testid=resume]')
out.lockOptions = full().lockOptions
if (full().lockOptions?.unadjustedMovement !== true) failures.push(`raw input on: lock options ${JSON.stringify(full().lockOptions)}`)
const pitchNormal = await measureRotation(0, 40)
out.invert = { inverted: r3(pitchInv.dPitch), normal: r3(pitchNormal.dPitch) }
if (!(Math.sign(pitchInv.dPitch) !== 0 && Math.sign(pitchInv.dPitch) === -Math.sign(pitchNormal.dPitch))) failures.push(`invert-Y: pitch ${r3(pitchInv.dPitch)} inverted vs ${r3(pitchNormal.dPitch)} normal`)

// arrows move, edge guard off lets the player walk off
const a0 = full().player.pos
await keyboard.down('ArrowUp')
await sleep(2500)
await keyboard.up('ArrowUp')
await sleep(800)
const a1 = full().player.pos
out.arrowsAndEdgeOff = { from: a0.map(r3), to: a1.map(r3) }
// the walk ends against the side of the next pad (s-r02 starts 1.0 m past the first pad), so ≥0.5 m is the bar
if (Math.hypot(a1[0] - a0[0], a1[2] - a0[2]) < 0.5) failures.push('ArrowUp did not move with the Arrows preset')
if (!(a1[1] < 0.3)) failures.push(`edge guard off: still on the pad (y ${r3(a1[1])})`)

// restore defaults for the next test in this browser profile (vitexec profiles are fresh anyway)
await pauseToSettings()
await click('[data-testid=preset-wasd]')
await click('[data-testid=settings-back]')
if (failures.length) {
  console.log('TEST-39 numbers ' + JSON.stringify(out))
  throw new Error('TEST-39 FAIL ' + failures.join('; '))
}
console.log('TEST-39 PASS ' + JSON.stringify(out))
