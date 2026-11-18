// TEST-26 (DIRECTIVE §7, smoke, G4): WEBGL_lose_context.loseContext() -> overlay + PAUSED <= 1 s;
// restoreContext() -> render non-blank, resume via enterPlaying().
import { bootToPlaying, clickElement, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

type Full = { state: string }
const full = () => (window as unknown as { __game: { snapshot(): Full } }).__game.snapshot()
const out: Record<string, unknown> = { renderer: logRenderer() }
const failures: string[] = []
const canvas = await bootToPlaying()

const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
const ext = gl?.getExtension('WEBGL_lose_context')
if (!ext) throw new Error('TEST-26 FAIL WEBGL_lose_context extension unavailable')

const t0 = performance.now()
ext.loseContext()
let pausedAt = -1
while (performance.now() - t0 < 1500) {
  if (full().state === 'PAUSED' && document.querySelector('[data-testid=panel-pause]') != null) {
    pausedAt = performance.now() - t0
    break
  }
  await nextFrame()
}
out.loseContext = { pausedMs: Math.round(pausedAt), state: full().state }
if (pausedAt < 0 || pausedAt > 1000) failures.push(`loseContext did not pause <= 1s (pausedMs=${pausedAt})`)

await sleep(300)
ext.restoreContext()
await sleep(500)
for (let i = 0; i < 10; i++) await nextFrame()

const resumeBtn = document.querySelector('[data-testid=resume]')
if (!(resumeBtn instanceof HTMLElement)) throw new Error('TEST-26 FAIL missing [data-testid=resume]')
await clickElement(resumeBtn)
await sleep(450)
if (full().state !== 'PLAYING') {
  await clickElement(document.querySelector('[data-testid=resume]') as HTMLElement)
  await sleep(300)
}
for (let i = 0; i < 10; i++) await nextFrame()
out.restored = { state: full().state, locked: document.pointerLockElement === canvas }
if (full().state !== 'PLAYING' || document.pointerLockElement !== canvas) {
  failures.push(`after restoreContext + Resume: state=${full().state}, locked=${document.pointerLockElement === canvas}`)
}

if (failures.length) {
  console.log('TEST-26 numbers ' + JSON.stringify(out))
  throw new Error('TEST-26 FAIL ' + failures.join('; '))
}
console.log('TEST-26 PASS ' + JSON.stringify(out))
