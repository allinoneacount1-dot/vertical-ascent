// TEST-40 (DIRECTIVE §7, smoke, G3): Victory — input locked 2 ±0.1 s; complete summary (time, Δ vs best or
// "New best!", big falls, meters lost, kill-plane respawns, restarts); Replay → new run; Free roam → no timer, PB,
// save or finish; Menu → MENU (D-023, ref/02 §State table). Setup: window.__game.__debugTeleport onto the finish pad
// (allowlisted for TEST-40, logged "debug-setup"); every button press is a real vitexec click.
import { keyboard } from 'vitexec'
import { bootToPlaying, clickElement, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'
import { currentLevelId, loadLevel } from '/src/level/levels.ts'

type Full = {
  state: string
  mode: string
  inputLocked: boolean
  player: { pos: number[]; groundedRaw: boolean }
  run: { timerMs: number; heightM: number; started: boolean }
  records: { bestTimeMs: number | null; bestHeightM: number; completions: number }
}
type Api = { snapshot(): Full; __debugTeleport(p: number[]): void }
const api = () => (window as unknown as { __game: Api }).__game
const full = () => api().snapshot()
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }
const canvas = await bootToPlaying()

const level = loadLevel(currentLevelId())
const finish = level.data.platforms.find((p) => p.id === level.data.finish)
const prefab = finish ? level.prefabs.get(finish.prefab) : undefined
if (!finish || !prefab?.collider) throw new Error('TEST-40 FAIL no finish pad in the level data')
const top = finish.pos[1] + prefab.collider.offset[1] * prefab.scale + (prefab.collider.size[1] * prefab.scale) / 2
const onFinish = [finish.pos[0], top + 0.05, finish.pos[2]]
out.level = { id: level.id, finish: finish.id, top: r3(top) }

async function until(fn: () => boolean, frames = 240): Promise<boolean> {
  for (let i = 0; i < frames; i++) {
    if (fn()) return true
    await nextFrame()
  }
  return fn()
}
const $ = (sel: string) => document.querySelector(sel) as HTMLButtonElement | null

/** Starts the timer with a real key, teleports onto the finish (debug-setup) and waits for VICTORY. */
async function reachVictory(): Promise<number> {
  // a real climb lasts more than 1 s; ref/02 rejects a best time ≤ 1000 ms
  await keyboard.press('KeyW', { durationMs: 120 })
  await sleep(1600)
  console.log('debug-setup: teleport onto the finish pad ' + JSON.stringify(onFinish))
  api().__debugTeleport(onFinish)
  if (!(await until(() => full().state === 'VICTORY', 300))) throw new Error(`TEST-40 FAIL no VICTORY after landing on the finish (state ${full().state})`)
  return performance.now()
}

async function press(sel: string, want: () => boolean): Promise<void> {
  const el = $(sel)
  if (!el) throw new Error(`TEST-40 FAIL missing ${sel}`)
  await clickElement(el)
  if (!(await until(want))) {
    await sleep(450)
    await clickElement($(sel) as Element) // re-lock rejected once under Playwright (D-043)
    if (!(await until(want))) throw new Error(`TEST-40 FAIL ${sel} did not take effect`)
  }
}

// ---- 1. victory: 2 s lock, summary ------------------------------------------------------------------------------------
const tV = await reachVictory()
let unlockAt = -1
let buttonsEnabledAt = -1
const lockedAtStart = full().inputLocked
const disabledAtStart = $('[data-testid=replay]')?.disabled === true
while (performance.now() - tV < 3000) {
  if (unlockAt < 0 && !full().inputLocked) unlockAt = performance.now()
  if (buttonsEnabledAt < 0 && $('[data-testid=replay]')?.disabled === false) buttonsEnabledAt = performance.now()
  await nextFrame()
}
const lockMs = unlockAt - tV
const buttonsMs = buttonsEnabledAt - tV
const summary = {
  time: $('[data-testid=victory-time]')?.textContent ?? null,
  delta: document.querySelector('[data-testid=victory-delta]')?.textContent ?? null,
  bigFalls: document.querySelector('[data-testid=victory-bigfalls]')?.textContent ?? null,
  meters: document.querySelector('[data-testid=victory-meters]')?.textContent ?? null,
  respawns: document.querySelector('[data-testid=victory-respawns]')?.textContent ?? null,
  restarts: document.querySelector('[data-testid=victory-restarts]')?.textContent ?? null,
}
out.victory1 = { lockedAtStart, disabledAtStart, lockMs: Math.round(lockMs), buttonsMs: Math.round(buttonsMs), summary, records: full().records, pointerLocked: document.pointerLockElement === canvas }
if (!lockedAtStart || !disabledAtStart) failures.push('victory: input/buttons not locked at the start')
if (!(Math.abs(lockMs - 2000) <= 100)) failures.push(`input lock lasted ${Math.round(lockMs)} ms (want 2000 ±100)`)
if (!(Math.abs(buttonsMs - 2000) <= 100)) failures.push(`buttons enabled after ${Math.round(buttonsMs)} ms (want 2000 ±100)`)
for (const [k, v] of Object.entries(summary)) if (v == null || v === '') failures.push(`summary field ${k} missing`)
if (!/New best|Rekor baru/.test(summary.delta ?? '')) failures.push(`first completion should say New best (got ${summary.delta})`)
const rec1 = full().records
if (!(rec1.bestTimeMs != null && rec1.bestTimeMs > 1000)) failures.push(`best time not recorded (${rec1.bestTimeMs})`)
if (!(rec1.bestHeightM >= Math.floor(top - level.data.spawn[1]))) failures.push(`best height ${rec1.bestHeightM} below the summit ${Math.floor(top)}`)

// ---- 2. Replay → new run -----------------------------------------------------------------------------------------------
await press('[data-testid=replay]', () => full().state === 'PLAYING' && document.pointerLockElement === canvas)
await sleep(200)
const r = full()
out.replay = { state: r.state, mode: r.mode, timerMs: r.run.timerMs, pos: r.player.pos }
if (r.mode !== 'run' || r.run.timerMs !== 0 || Math.hypot(r.player.pos[0] - level.data.spawn[0], r.player.pos[2] - level.data.spawn[2]) > 0.05) failures.push(`Replay did not start a new run at the spawn: ${JSON.stringify(out.replay)}`)

// ---- 3. second victory → Free roam: no timer, no PB, no save, no finish ------------------------------------------------
await reachVictory()
const delta2 = document.querySelector('[data-testid=victory-delta]')?.textContent ?? null
const recordsBefore = full().records
await sleep(2150)
await press('[data-testid=free-roam]', () => full().state === 'PLAYING' && full().mode === 'freeRoam' && document.pointerLockElement === canvas)
await keyboard.press('KeyW', { durationMs: 800 })
await sleep(600)
const fr = full()
console.log('debug-setup: teleport onto the finish pad in free roam ' + JSON.stringify(onFinish))
api().__debugTeleport(onFinish)
await sleep(1500)
const frAfter = full()
await keyboard.press('KeyP')
await until(() => full().state === 'PAUSED')
const saveQuitShown = document.querySelector('[data-testid=save-quit]') != null
out.freeRoam = { delta2, timerMs: fr.run.timerMs, stateOnFinish: frAfter.state, records: frAfter.records, recordsBefore, saveQuitShown, runSave: localStorage.getItem('va.run.v1') }
if (fr.run.timerMs !== 0) failures.push(`free roam timer ${fr.run.timerMs} (want 0)`)
if (frAfter.state !== 'PLAYING') failures.push(`free roam on the finish → ${frAfter.state} (want no finish)`)
if (JSON.stringify(frAfter.records) !== JSON.stringify(recordsBefore)) failures.push('records changed in free roam')
if (saveQuitShown) failures.push('Save & quit offered in free roam')
if (localStorage.getItem('va.run.v1') != null) failures.push('a run save exists in free roam')
if (!(delta2 && /vs|Rekor|best/.test(delta2))) failures.push(`second completion shows no delta (got ${delta2})`)

// ---- 4. third victory → Menu -------------------------------------------------------------------------------------------
await press('[data-testid=restart]', () => document.querySelector('[data-testid=confirm-restart]') != null)
await press('[data-testid=confirm-restart]', () => full().state === 'PLAYING' && full().mode === 'run' && document.pointerLockElement === canvas)
await reachVictory()
await sleep(2150)
await press('[data-testid=victory-menu]', () => full().state === 'MENU')
out.menu = { state: full().state, playButton: document.querySelector('[data-testid=play]') != null }
if (full().state !== 'MENU') failures.push(`Menu → ${full().state}`)

if (failures.length) {
  console.log('TEST-40 numbers ' + JSON.stringify(out))
  throw new Error('TEST-40 FAIL ' + failures.join('; '))
}
console.log('TEST-40 PASS ' + JSON.stringify(out))
