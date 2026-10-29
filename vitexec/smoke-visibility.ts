// TEST-28a (DIRECTIVE §7, smoke, G1): stubbed visibilitychange / blur (allowlist "synthetic: visibility/blur") →
// PAUSED before the next frame; hidden 5 s → Δposition 0, Δtimer <0.2 s. W stays held through the hidden period.
import { keyboard, mouse } from 'vitexec'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Full = { state: string; player: { pos: number[] }; run: { timerMs: number }; frame: number }
const full = () => (window as unknown as { __game: { snapshot(): Full } }).__game.snapshot()

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }
const canvas = await bootToPlaying()

async function clickResume(): Promise<void> {
  await sleep(300)
  const button = document.querySelector('.panel button')
  if (!(button instanceof HTMLButtonElement)) throw new Error('TEST-28a FAIL no Resume button')
  const r = button.getBoundingClientRect()
  await mouse.moveTo(r.x + r.width / 2, r.y + r.height / 2)
  await mouse.click()
  for (let i = 0; i < 120 && !(document.pointerLockElement === canvas && full().state === 'PLAYING'); i++) await nextFrame()
  if (!(document.pointerLockElement === canvas && full().state === 'PLAYING')) throw new Error('TEST-28a FAIL Resume did not re-lock into PLAYING')
  await sleep(300)
}

// ---- 1. visibilitychange → hidden while walking ----------------------------------------------------------------
await keyboard.down('KeyW')
await sleep(500)
const moving0 = full().player.pos
await sleep(200)
const moving1 = full().player.pos
const walkedBefore = Math.hypot(moving1[0] - moving0[0], moving1[2] - moving0[2])
if (walkedBefore < 0.3) failures.push(`setup: not walking before the stub (${r3(walkedBefore)} m in 200 ms)`)

console.log('synthetic: visibility/blur (visibilityState=hidden + visibilitychange)')
const frame0 = full().frame
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
document.dispatchEvent(new Event('visibilitychange'))
const stateSync = full().state // same task, before any further frame
const sameFrame = full().frame === frame0
const h0 = full()
await sleep(5000)
const h1 = full()
delete (document as unknown as Record<string, unknown>).visibilityState
const dPos = Math.hypot(h1.player.pos[0] - h0.player.pos[0], h1.player.pos[1] - h0.player.pos[1], h1.player.pos[2] - h0.player.pos[2])
const dTimerS = (h1.run.timerMs - h0.run.timerMs) / 1000
out.hidden = { stateBeforeNextFrame: stateSync, checkedInSameFrame: sameFrame, stateAfter5s: h1.state, dPos: r3(dPos), dTimerS: r3(dTimerS), restoredVisibility: document.visibilityState }
if (stateSync !== 'PAUSED') failures.push(`visibilitychange → hidden: state ${stateSync} before the next frame`)
if (h1.state !== 'PAUSED') failures.push(`not PAUSED after 5 s hidden (${h1.state})`)
if (dPos !== 0) failures.push(`moved ${dPos} m while hidden`)
if (!(dTimerS < 0.2)) failures.push(`timer advanced ${dTimerS} s while hidden`)
await keyboard.up('KeyW')
await clickResume()

// ---- 2. window blur while walking ------------------------------------------------------------------------------
await keyboard.down('KeyW')
await sleep(400)
console.log('synthetic: visibility/blur (window blur)')
const bFrame = full().frame
window.dispatchEvent(new Event('blur'))
const bState = full().state
const bSame = full().frame === bFrame
const b0 = full()
await sleep(1000)
const b1 = full()
await keyboard.up('KeyW')
const bdPos = Math.hypot(b1.player.pos[0] - b0.player.pos[0], b1.player.pos[2] - b0.player.pos[2])
out.blur = { stateBeforeNextFrame: bState, checkedInSameFrame: bSame, stateAfter1s: b1.state, dPos1s: r3(bdPos), dTimerMs1s: b1.run.timerMs - b0.run.timerMs }
if (bState !== 'PAUSED') failures.push(`blur: state ${bState} before the next frame`)
if (bdPos !== 0) failures.push(`moved ${bdPos} m after blur`)
await clickResume()

if (failures.length > 0) {
  console.log('TEST-28a numbers ' + JSON.stringify(out))
  throw new Error('TEST-28a FAIL ' + failures.join('; '))
}
console.log('TEST-28a PASS ' + JSON.stringify(out))
