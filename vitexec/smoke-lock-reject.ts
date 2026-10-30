// TEST-14b (DIRECTIVE §7, smoke part, G3): with requestPointerLock stubbed to reject (allowlisted "synthetic:
// lock-reject-stub"), clicking Resume keeps PAUSED and shows the "Click again" hint; with the stub restored, Resume
// enters PLAYING only after pointerlockchange → canvas (D-004, D-019). The real Esc + 1.25 s cooldown part is manual
// (owner playtest) and recorded separately. Input: vitexec mouse/keyboard only.
import { keyboard } from 'vitexec'
import { bootToPlaying, clickElement, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

type Full = { state: string; events: Array<{ t: number; type: string; data?: { to?: string; event?: string } }> }
const full = () => (window as unknown as { __game: { snapshot(): Full } }).__game.snapshot()
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

const canvas = await bootToPlaying()
await keyboard.press('KeyP')
for (let i = 0; i < 60 && full().state !== 'PAUSED'; i++) await nextFrame()
if (full().state !== 'PAUSED') throw new Error('TEST-14b FAIL P did not pause')
await sleep(400)

// ---- 1. rejected lock: stays PAUSED with the hint ------------------------------------------------------------------
const proto = HTMLCanvasElement.prototype as unknown as { requestPointerLock: (...a: unknown[]) => unknown }
const original = proto.requestPointerLock
console.log('synthetic: lock-reject-stub')
proto.requestPointerLock = () => Promise.reject(new DOMException('', 'SecurityError'))
const resume = () => document.querySelector('[data-testid=resume]')
await clickElement(resume() as Element)
await sleep(500)
const hint = document.querySelector('.panel .hint')?.textContent ?? null
out.rejected = { state: full().state, hint, locked: document.pointerLockElement === canvas, rejectedEvents: full().events.filter((e) => e.type === 'lockRejected').length }
if (full().state !== 'PAUSED') failures.push(`state ${full().state} after a rejected lock (want PAUSED)`)
if (!hint) failures.push('no "Click again" hint after a rejected lock')
proto.requestPointerLock = original
console.log('synthetic: lock-reject-stub restored')

// ---- 2. restored: PLAYING only after pointerlockchange → canvas -----------------------------------------------------
let lockAt = -1
let playingAtLock: string | null = null
document.addEventListener(
  'pointerlockchange',
  () => {
    if (document.pointerLockElement === canvas && lockAt < 0) {
      lockAt = performance.now()
      playingAtLock = full().state
    }
  },
  { capture: true },
)
let firstPlayingAt = -1
const t0 = performance.now()
const watch = (async () => {
  while (performance.now() - t0 < 5000) {
    if (full().state === 'PLAYING' && firstPlayingAt < 0) firstPlayingAt = performance.now()
    await nextFrame()
  }
})()
await sleep(450)
await clickElement(resume() as Element)
for (let i = 0; i < 180 && !(full().state === 'PLAYING' && document.pointerLockElement === canvas); i++) await nextFrame()
await sleep(200)
await watch.catch(() => undefined)
out.restored = { state: full().state, locked: document.pointerLockElement === canvas, lockAt: Math.round(lockAt), firstPlayingAt: Math.round(firstPlayingAt), stateWhenLockEventFired: playingAtLock }
if (full().state !== 'PLAYING' || document.pointerLockElement !== canvas) failures.push('restored stub: Resume did not reach locked PLAYING')
if (lockAt < 0) failures.push('no pointerlockchange → canvas observed')
else if (playingAtLock === 'PLAYING') failures.push('state was already PLAYING before pointerlockchange → canvas')
if (firstPlayingAt >= 0 && lockAt >= 0 && firstPlayingAt < lockAt) failures.push('PLAYING observed before pointerlockchange')

out.manual = 'Esc + 1.25 s re-lock cooldown: manual part (owner playtest in a headed browser), not covered here'
if (failures.length) {
  console.log('TEST-14b numbers ' + JSON.stringify(out))
  throw new Error('TEST-14b FAIL ' + failures.join('; '))
}
console.log('TEST-14b PASS ' + JSON.stringify(out))
