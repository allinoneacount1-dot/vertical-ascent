// TEST-15 (DIRECTIVE §7, smoke, G2): 20 restarts from random positions (__debugTeleport, allowlist "debug-setup") →
// spawn ±0.05, v = 0, timer 0, height 0, no held keys, world clock = t0; the confirmation dialog is mandatory.
// Restart path = real input only: KeyP (pause) → click Restart → confirmation dialog → click Restart in the dialog.
// W is held down through the whole restart to prove no key stays held in the new run.
import { keyboard, mouse } from 'vitexec'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Full = { state: string; frame: number; worldClock: number; player: { pos: number[]; vel: number[] }; run: { timerMs: number; heightM: number }; records: { restartCount: number } }
type G = { snapshot(): Full; __debugTeleport(p: [number, number, number]): void }
const g = () => (window as unknown as { __game: G }).__game

const canvas = (logRenderer(), await bootToPlaying())
const click = async (selector: string) => {
  const el = document.querySelector(selector)
  if (!(el instanceof HTMLElement)) throw new Error(`TEST-15 FAIL missing ${selector}`)
  const r = el.getBoundingClientRect()
  await mouse.moveTo(r.x + r.width / 2, r.y + r.height / 2)
  await mouse.click()
}
const waitFor = async (pred: () => boolean, ms: number) => {
  const t0 = performance.now()
  while (!pred()) {
    if (performance.now() - t0 > ms) return false
    await nextFrame()
  }
  return true
}

// seeded positions: route pad tops and mid-air above them — never the finish pad (landing there is a victory)
let seed = 1515
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296)
const spots: Array<[number, number, number]> = [
  [0, 0.6, -5], [3.5, 2.4, -12.5], [7, 3.2, -12.5], [11, 4, -1], [2.5, 4.8, 1], [-4.5, 4.8, 1], [-8.5, 6.4, -5.5], [-1.5, 8, -7.5],
]

// one Cancel check first: the dialog must not restart by itself
await keyboard.press('KeyP')
await waitFor(() => g().snapshot().state === 'PAUSED', 60)
await sleep(250)
await click('[data-testid=restart]')
const dialogText = (await waitFor(() => document.querySelector('[data-testid=panel-confirm-restart]') != null, 60)) ? document.querySelector('[data-testid=panel-confirm-restart]')!.textContent : null
const cancelBtn = [...document.querySelectorAll('[data-testid=panel-confirm-restart] button')].find((b) => /cancel|batal/i.test(b.textContent ?? ''))
if (!cancelBtn) throw new Error('TEST-15 FAIL no Cancel in the dialog')
{
  const r = cancelBtn.getBoundingClientRect()
  await mouse.moveTo(r.x + r.width / 2, r.y + r.height / 2)
  await mouse.click()
}
await sleep(200)
const afterCancel = { state: g().snapshot().state, pausePanel: document.querySelector('[data-testid=panel-pause]') != null }
await click('.panel button') // Resume
await waitFor(() => document.pointerLockElement === canvas && g().snapshot().state === 'PLAYING', 120)
await sleep(300)

const rows: Array<Record<string, unknown>> = []
const restarts0 = g().snapshot().records.restartCount
for (let i = 0; i < 20; i++) {
  const base = spots[Math.floor(rand() * spots.length)]
  const p: [number, number, number] = [base[0] + (rand() - 0.5), base[1] + (rand() < 0.5 ? 0 : 1 + rand() * 3), base[2] + (rand() - 0.5)]
  await keyboard.down('KeyW')
  g().__debugTeleport(p)
  await sleep(200 + Math.floor(rand() * 300))
  await keyboard.press('KeyP')
  if (!(await waitFor(() => g().snapshot().state === 'PAUSED', 60))) {
    const ev = (g().snapshot() as unknown as { events: Array<{ t: number; type: string; data?: unknown }> }).events.filter((e) => e.type === 'state' || e.type === 'lockRejected').slice(-10)
    throw new Error(`TEST-15 FAIL restart ${i}: P did not pause; state=${g().snapshot().state} locked=${document.pointerLockElement === canvas} active=${document.activeElement?.tagName} events=${JSON.stringify(ev)}`)
  }
  await sleep(400)
  let dialog = false
  let stillPausedWithDialog = false
  let entry: Full | null = null
  let lockRetries = 0
  // a rejected pointer-lock request leaves the pause menu with the "Click again" hint (D-004): click again like a person
  for (let attempt = 0; attempt < 2 && entry == null; attempt++) {
    if (attempt > 0) {
      lockRetries++
      await sleep(400)
    }
    await click('[data-testid=restart]')
    dialog = await waitFor(() => document.querySelector('[data-testid=panel-confirm-restart]') != null, 60)
    stillPausedWithDialog = g().snapshot().state === 'PAUSED'
    await click('[data-testid=confirm-restart]')
    if (await waitFor(() => g().snapshot().state === 'PLAYING' && document.pointerLockElement === canvas, 120)) entry = g().snapshot()
  }
  // 10 frames with W still physically held: the new run must not move
  const f0 = g().snapshot().frame
  let maxH = 0
  while (g().snapshot().frame < f0 + 10) {
    const v = g().snapshot().player.vel
    maxH = Math.max(maxH, Math.hypot(v[0], v[2]))
    await nextFrame()
  }
  await keyboard.up('KeyW')
  const s = entry
  rows.push({
    i,
    from: p.map((x) => r3(x)),
    dialog,
    stillPausedWithDialog,
    entered: s != null,
    pos: s?.player.pos,
    vel: s?.player.vel,
    timerMs: s?.run.timerMs,
    heightM: s?.run.heightM,
    worldClock: s?.worldClock,
    maxHorizontalSpeed10Frames: r3(maxH),
    lockRetries,
  })
  await sleep(300)
}
const restarts = g().snapshot().records.restartCount - restarts0
const lockRejected = (g().snapshot() as unknown as { events: Array<{ type: string }> }).events.filter((e) => e.type === 'lockRejected').length
const failures: string[] = []
if (!dialogText || !/height will be lost|ketinggianmu/i.test(dialogText)) failures.push(`dialog text: ${dialogText}`)
if (afterCancel.state !== 'PAUSED' || !afterCancel.pausePanel) failures.push(`Cancel did not keep the pause menu (${JSON.stringify(afterCancel)})`)
for (const r of rows) {
  const id = `restart ${r.i}`
  if (!r.dialog || !r.stillPausedWithDialog) failures.push(`${id}: no confirmation dialog before restarting`)
  if (!r.entered) {
    failures.push(`${id}: did not re-enter PLAYING`)
    continue
  }
  const pos = r.pos as number[]
  const vel = r.vel as number[]
  if (Math.hypot(pos[0], pos[1], pos[2]) > 0.05) failures.push(`${id}: pos ${pos}`)
  if (Math.hypot(vel[0], vel[1], vel[2]) !== 0) failures.push(`${id}: v ${vel}`)
  if (r.timerMs !== 0) failures.push(`${id}: timer ${r.timerMs}`)
  if (r.heightM !== 0) failures.push(`${id}: height ${r.heightM}`)
  if (r.worldClock !== 0) failures.push(`${id}: world clock ${r.worldClock}`)
  if ((r.maxHorizontalSpeed10Frames as number) !== 0) failures.push(`${id}: moved with W held (${r.maxHorizontalSpeed10Frames} m/s)`)
}
if (restarts !== 20) failures.push(`restartCount +${restarts} (expected 20)`)
const numbers = { dialogText, afterCancel, restarts, lockRejected, rows }
if (failures.length) {
  console.log('TEST-15 numbers ' + JSON.stringify(numbers))
  throw new Error('TEST-15 FAIL ' + failures.slice(0, 8).join('; '))
}
console.log('debug-setup: 20 × __debugTeleport (positions above)')
console.log('TEST-15 PASS ' + JSON.stringify(numbers))
