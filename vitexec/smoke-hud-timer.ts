// TEST-13 (DIRECTIVE §7, smoke, G2): HUD height = floor(feet.y − spawn.y) ±0.1 at 5 points; timer vs wall clock ±1 %
// over 10 s; each D-008 timer rule as its own scenario (New climb → TEST-30, Focus → G4 optional). Real input only
// (no teleport: TEST-13 is not on the debug-setup allowlist). Rules not reproducible with real input here are taken
// from their own evidence and named in the log: hidden tab → TEST-28a (visibility stub is allowlisted only there),
// unscaled delta clamped ≤0.1 s → TEST-28b (FrameClock; the run timer adds FrameClock.dt).
import { keyboard, mouse } from 'vitexec'
import { runRoute } from '/vitexec/lib/route-bot.ts'
import type { Route } from '/vitexec/lib/route-bot.ts'
import route from '/vitexec/routes/slice.json'
import level from '/level/slice.json'
import { nextFrame, r3, sleep, wrap } from '/vitexec/lib/move-smoke.ts'

type Full = { state: string; frame: number; player: { pos: number[]; vel: number[]; groundedRaw: boolean; sprintActive: boolean }; camera: { yaw: number }; run: { timerMs: number; heightM: number; started: boolean; killPlaneRespawns: number } }
const snap = (): Full => (window as unknown as { __game: { snapshot(): Full } }).__game.snapshot()
const hudHeight = () => Number((document.querySelector('[data-testid=hud-height]')?.textContent ?? '').split('/')[0].trim())
const failures: string[] = []
const out: Record<string, unknown> = {}

// ---- rule: frozen at VICTORY (climb the slice with the route bot, real input) --------------------------------------
await runRoute(route as unknown as Route, (level as unknown as { platforms: never[] }).platforms, 'test13-climb')
const v0 = snap().run.timerMs
await sleep(2000)
const v1 = snap().run.timerMs
out.victoryFrozen = { state: snap().state, timerAtVictory: v0, timer2sLater: v1 }
if (snap().state !== 'VICTORY' || v1 !== v0) failures.push(`timer not frozen at VICTORY (${v0} → ${v1})`)

const canvas = document.querySelector('canvas') as HTMLCanvasElement
const H = canvas.getBoundingClientRect().height
const clickSel = async (sel: string) => {
  const el = document.querySelector(sel)
  if (!(el instanceof HTMLElement)) throw new Error(`TEST-13 FAIL missing ${sel}`)
  const r = el.getBoundingClientRect()
  await mouse.moveTo(r.x + r.width / 2, r.y + r.height / 2)
  await mouse.click()
}
const waitPlaying = async () => {
  for (let i = 0; i < 150; i++) {
    if (snap().state === 'PLAYING' && document.pointerLockElement === canvas) return true
    await nextFrame()
  }
  return false
}

// ---- Replay → new run; rule: the timer starts on the first movement input ------------------------------------------
await clickSel('[data-testid=panel-victory] button')
if (!(await waitPlaying())) {
  await sleep(400)
  await clickSel('[data-testid=panel-victory] button') // lock rejected once (D-043): click again
  if (!(await waitPlaying())) throw new Error('TEST-13 FAIL Replay did not enter PLAYING')
}
await sleep(2000)
const idle = snap().run
await keyboard.press('KeyW')
await sleep(600)
const moved = snap().run
out.firstInput = { idle2s: { timerMs: idle.timerMs, started: idle.started }, after600ms: { timerMs: moved.timerMs, started: moved.started } }
if (idle.timerMs !== 0 || idle.started) failures.push(`timer ran before the first movement input (${idle.timerMs})`)
if (!(moved.timerMs > 400)) failures.push(`timer did not start after W (${moved.timerMs})`)

// ---- HUD height at 5 points: spawn floor, r01..r04 (mini climber, same method as the route bot) --------------------
type WP = { id: string; takeoff: number[]; target: number[]; needsSprint: boolean }
const wps = (route as unknown as { waypoints: WP[] }).waypoints.slice(0, 4)
const aim = async (want: number) => {
  for (let i = 0; i < 8; i++) {
    const err = wrap(want - snap().camera.yaw)
    if (Math.abs(err) <= 0.03) return
    await mouse.move(Math.max(-700, Math.min(700, Math.round((-err * H) / 4))), 0, { durationMs: 60 })
    await nextFrame()
  }
}
const yawTo = (p: number[], x: number, z: number) => Math.atan2(-(x - p[0]), -(z - p[2]))
const walkTo = async (x: number, z: number) => {
  if (snap().player.sprintActive) await keyboard.press('ShiftLeft')
  for (let i = 0; i < 400; i++) {
    const p = snap().player.pos
    const d = Math.hypot(x - p[0], z - p[2])
    if (d < 0.15) return
    await aim(yawTo(p, x, z))
    await keyboard.press('KeyW', { durationMs: Math.max(25, Math.min(400, Math.round((d / 3) * 1000 * 0.7))) })
    await sleep(30)
  }
}
const checks: Array<{ at: string; feetY: number; expected: number; hud: number }> = []
const checkHud = async (at: string) => {
  await sleep(250) // ≥ one 100 ms HUD slot
  const y = snap().player.pos[1]
  checks.push({ at, feetY: r3(y), expected: Math.floor(y), hud: hudHeight() })
}
const tWall0 = performance.now()
const tTimer0 = snap().run.timerMs
await checkHud('spawn floor')
for (const wp of wps) {
  await walkTo(wp.takeoff[0], wp.takeoff[2])
  await aim(yawTo(snap().player.pos, wp.target[0], wp.target[2]))
  if (wp.needsSprint && !snap().player.sprintActive) await keyboard.press('ShiftLeft')
  await keyboard.down('KeyW')
  await keyboard.press('Space')
  let air = false
  for (let i = 0; i < 300; i++) {
    const s = snap()
    if (!s.player.groundedRaw) air = true
    if (Math.hypot(wp.target[0] - s.player.pos[0], wp.target[2] - s.player.pos[2]) < 0.3) await keyboard.up('KeyW')
    if (air && s.player.groundedRaw) break
    await nextFrame()
  }
  await keyboard.up('KeyW')
  await checkHud(wp.id)
}
for (const c of checks) if (Math.abs(c.hud - c.expected) > 0.1) failures.push(`HUD ${c.hud} m at ${c.at}, expected ${c.expected} (feet ${c.feetY})`)
const reached = new Set(checks.map((c) => c.expected)).size
if (reached < 4) failures.push(`setup: only ${reached} distinct heights reached`)
out.hudHeights = checks

// ---- timer vs wall clock over ≥10 s of PLAYING (the climb above plus walking) ---------------------------------------
while (performance.now() - tWall0 < 10500) {
  await keyboard.press('KeyA', { durationMs: 200 })
  await keyboard.press('KeyD', { durationMs: 200 })
}
const wallS = (performance.now() - tWall0) / 1000
const timerS = (snap().run.timerMs - tTimer0) / 1000
out.timerVsWall = { wallS: r3(wallS), timerS: r3(timerS), ratio: r3(timerS / wallS) }
if (Math.abs(timerS / wallS - 1) > 0.01) failures.push(`timer/wall ${r3(timerS / wallS)} outside ±1 %`)

// ---- rule: not running while PAUSED --------------------------------------------------------------------------------
await keyboard.press('KeyP')
await sleep(100)
const p0 = snap().run.timerMs
await sleep(2000)
const p1 = snap().run.timerMs
out.paused = { state: snap().state, timerBefore: p0, timer2sLater: p1 }
if (snap().state !== 'PAUSED' || p1 !== p0) failures.push(`timer moved while PAUSED (${p0} → ${p1})`)
await sleep(300)
await clickSel('[data-testid=panel-pause] button')
if (!(await waitPlaying())) {
  await sleep(400)
  await clickSel('[data-testid=panel-pause] button')
  if (!(await waitPlaying())) throw new Error('TEST-13 FAIL Resume did not enter PLAYING')
}

// ---- rule: continues through a kill-plane respawn (walk off the floor edge) ----------------------------------------
// drop from the pad first, then sprint to +Z past the floor edge (z = 26)
await aim(Math.PI)
if (!snap().player.sprintActive) await keyboard.press('ShiftLeft')
const k0 = { timer: snap().run.timerMs, wall: performance.now(), respawns: snap().run.killPlaneRespawns }
await keyboard.down('KeyW')
for (let i = 0; i < 900 && snap().run.killPlaneRespawns === k0.respawns; i++) {
  const s = snap()
  const err = wrap(Math.PI - s.camera.yaw)
  if (Math.abs(err) > 0.05) await mouse.move(Math.round((-err * H) / 4), 0, { durationMs: 40 })
  else await nextFrame()
}
await keyboard.up('KeyW')
await sleep(500)
const k1 = { timer: snap().run.timerMs, wall: performance.now(), respawns: snap().run.killPlaneRespawns }
out.killPlane = { respawned: k1.respawns - k0.respawns, timerDeltaS: r3((k1.timer - k0.timer) / 1000), wallDeltaS: r3((k1.wall - k0.wall) / 1000) }
if (k1.respawns !== k0.respawns + 1) failures.push('setup: no kill-plane respawn')
else if (Math.abs((k1.timer - k0.timer) / (k1.wall - k0.wall) - 1) > 0.02) failures.push(`timer did not continue through the respawn (${JSON.stringify(out.killPlane)})`)

// ---- rule: reset only by Restart -----------------------------------------------------------------------------------
const beforeRestart = snap().run.timerMs
await keyboard.press('KeyP')
await sleep(450)
await clickSel('[data-testid=restart]')
await sleep(100)
await clickSel('[data-testid=confirm-restart]')
if (!(await waitPlaying())) {
  await sleep(450)
  await clickSel('[data-testid=restart]')
  await sleep(100)
  await clickSel('[data-testid=confirm-restart]')
  if (!(await waitPlaying())) throw new Error('TEST-13 FAIL Restart did not enter PLAYING')
}
const r = snap().run
out.restart = { timerBefore: beforeRestart, timerAfter: r.timerMs, heightAfter: r.heightM, startedAfter: r.started }
if (!(beforeRestart > 0) || r.timerMs !== 0 || r.heightM !== 0 || r.started) failures.push(`Restart did not reset the run (${JSON.stringify(out.restart)})`)

out.referencedRules = { hiddenTab: 'TEST-28a (Δtimer < 0.2 s over 5 s hidden)', deltaClamp: 'TEST-28b (dt 5.0 → 0.1 s)' }
if (failures.length) {
  console.log('TEST-13 numbers ' + JSON.stringify(out))
  throw new Error('TEST-13 FAIL ' + failures.join('; '))
}
console.log('TEST-13 PASS ' + JSON.stringify(out))
