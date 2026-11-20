// TEST-14a (DIRECTIVE §7, smoke, G1): document.exitPointerLock() (stand-in for Esc) → PAUSED within 1 frame; paused
// in the air for 3 s → Δposition 0, Δtimer 0, Δmixer time 0; Resume continues the arc; P pauses without the lock.
// Input: vitexec mouse/keyboard only; the single synthetic step is the allowlisted "stand-in: exitPointerLock".
import { mouse } from 'vitexec'
import { Recorder, bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Full = { state: string; player: { pos: number[]; vel: number[]; groundedRaw: boolean }; run: { timerMs: number }; anim: { mixerTime: number }; frame: number; events: Array<{ t: number; type: string }> }
const full = () => (window as unknown as { __game: { snapshot(): Full } }).__game.snapshot()

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }
const canvas = await bootToPlaying()
const rec = new Recorder()
rec.start()

async function clickResume(): Promise<void> {
  const button = document.querySelector('.panel button')
  if (!(button instanceof HTMLButtonElement)) throw new Error('TEST-14a FAIL no Resume button')
  const r = button.getBoundingClientRect()
  await mouse.moveTo(r.x + r.width / 2, r.y + r.height / 2)
  await mouse.click()
  for (let i = 0; i < 120 && !(document.pointerLockElement === canvas && full().state === 'PLAYING'); i++) await nextFrame()
  if (!(document.pointerLockElement === canvas && full().state === 'PLAYING')) throw new Error('TEST-14a FAIL Resume did not re-lock into PLAYING')
}

// timer runs: start it with a movement input, then wait until grounded
await rec.tap('KeyW')
for (let i = 0; i < 120 && !full().player.groundedRaw; i++) await nextFrame()
await sleep(400)

// ---- 1. jump, then exitPointerLock while rising --------------------------------------------------------------
await rec.tap('Space')
await sleep(150)
const before = full()
if (before.player.groundedRaw) failures.push('setup: not airborne 150 ms after the jump')
console.log('stand-in: exitPointerLock')
const frameAtExit = full().frame
document.exitPointerLock()
await nextFrame()
const afterOne = full()
const framesToPause = afterOne.frame - frameAtExit
out.pauseObservedAfterAppFrames = framesToPause
out.stateNextFrame = afterOne.state
if (afterOne.state !== 'PAUSED') failures.push(`state ${afterOne.state} one frame after exitPointerLock`)
if (framesToPause > 1) failures.push(`PAUSED only after ${framesToPause} app frames`)

// ---- 2. 3 s paused in the air --------------------------------------------------------------------------------
const p0 = full()
await sleep(3000)
const p1 = full()
const dPos = Math.hypot(p1.player.pos[0] - p0.player.pos[0], p1.player.pos[1] - p0.player.pos[1], p1.player.pos[2] - p0.player.pos[2])
const dTimer = p1.run.timerMs - p0.run.timerMs
const dMixer = p1.anim.mixerTime - p0.anim.mixerTime
out.paused3s = { pos: p0.player.pos, vel: p0.player.vel, dPos: r3(dPos), dTimerMs: dTimer, dMixer: r3(dMixer), state: p1.state, airborneY: r3(p0.player.pos[1]) }
if (p1.state !== 'PAUSED') failures.push(`left PAUSED during the 3 s (${p1.state})`)
if (dPos !== 0) failures.push(`position moved ${dPos} m while paused`)
if (dTimer !== 0) failures.push(`timer moved ${dTimer} ms while paused`)
if (dMixer !== 0) failures.push(`mixer time moved ${dMixer} while paused`)

// ---- 3. Resume continues the arc ----------------------------------------------------------------------------
const tResume = performance.now()
await clickResume()
const landing = await (async () => {
  const deadline = performance.now() + 3000
  for (;;) {
    const e = full().events.find((x) => x.type === 'land' && x.t > tResume)
    if (e) return e
    if (performance.now() > deadline) return null
    await nextFrame()
  }
})()
const arc = rec.between(tResume, performance.now()).filter((s) => !s.grounded)
const firstMoving = arc.find((s) => Math.abs(s.pos[1] - p0.player.pos[1]) > 1e-6)
const vyPaused = p0.player.vel[1]
out.resume = {
  vyAtPause: vyPaused,
  firstMovingSample: firstMoving ? { pos: firstMoving.pos, vy: firstMoving.vel[1] } : null,
  airborneSamplesAfterResume: arc.length,
  landed: landing != null,
}
// continuity: the first moving sample is within one frame of the paused state (|Δy| ≤ 0.3 m, |Δvy| ≤ 1.5 m/s at ≤75 fps)
if (firstMoving == null) failures.push('no airborne motion after Resume')
else {
  if (Math.abs(firstMoving.pos[1] - p0.player.pos[1]) > 0.3) failures.push(`arc jumped by ${firstMoving.pos[1] - p0.player.pos[1]} m on resume`)
  if (Math.abs(firstMoving.vel[1] - vyPaused) > 1.5) failures.push(`vertical velocity jumped from ${vyPaused} to ${firstMoving.vel[1]} on resume`)
}
if (landing == null) failures.push('no landing after Resume')

// ---- 4. P pauses (the app also releases the lock) ------------------------------------------------------------
await sleep(500)
if (full().state !== 'PLAYING') failures.push('setup: not PLAYING before the P test')
const frameAtP = full().frame
await rec.tap('KeyP')
const pState = full().state
await nextFrame()
out.pKey = { state: pState, stateNextFrame: full().state, appFramesSinceP: full().frame - frameAtP, lockReleased: document.pointerLockElement == null }
if (full().state !== 'PAUSED') failures.push(`P did not pause (${full().state})`)
if (document.pointerLockElement != null) failures.push('pointer lock still held after P')
await sleep(300)
await clickResume()
rec.stop()

if (failures.length > 0) {
  console.log('TEST-14a numbers ' + JSON.stringify(out))
  throw new Error('TEST-14a FAIL ' + failures.join('; '))
}
console.log('TEST-14a PASS ' + JSON.stringify(out))
