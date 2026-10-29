// TEST-04 (DIRECTIVE §7, smoke, G1): keyboard W → displacement ≥0.1 m within 100 ms; release → speed <0.05 m/s
// within 300 ms; A/S/D correct relative to the camera yaw.
// Method: real click on Play (pointer lock verified), camera turned with real mouse movement to ~π (looking +Z, clear
// lane) and later to ~3π/4 (not axis-aligned). At each yaw, W/A/S/D are held 400 ms each through vitexec's trusted
// keyboard. 100 ms are counted from the keydown event.timeStamp (window capture listener); positions come from
// per-rAF samples of __game.snapshot() (latest sample at or before keydown + 100 ms: conservative). Speed =
// horizontal |vel|. Direction: horizontal displacement keydown → keyup + 600 ms against the yaw-relative expectation
// forward = (-sin yaw, 0, -cos yaw), right = (cos yaw, 0, -sin yaw); tolerance cosine ≥ 0.98 (≈11.5°).
import { bootToPlaying, hdist, hspeed, logRenderer, r3, Recorder, sleep, turnToYaw, wrap } from '/vitexec/lib/move-smoke.ts'
import type { Vec3 } from '/vitexec/lib/move-smoke.ts'

const D100_MIN_M = 0.1 // spec: ≥0.1 m within 100 ms of W
const D100_WINDOW_MS = 100
const STOP_SPEED = 0.05 // spec: <0.05 m/s ...
const STOP_WITHIN_MS = 300 // ... within 300 ms of release
const COS_MIN = 0.98 // stated direction tolerance
const MOVED_MIN_M = 0.1 // a key that moves less than this has no direction to judge
const HOLD_MS = 400
const OBSERVE_AFTER_UP_MS = 600

const renderer = logRenderer()
await bootToPlaying()
const rec = new Recorder()
rec.start()

function expectedDir(code: string, yaw: number): [number, number] {
  const fwd: [number, number] = [-Math.sin(yaw), -Math.cos(yaw)]
  const right: [number, number] = [Math.cos(yaw), -Math.sin(yaw)]
  if (code === 'KeyW') return fwd
  if (code === 'KeyS') return [-fwd[0], -fwd[1]]
  if (code === 'KeyD') return right
  return [-right[0], -right[1]] // KeyA
}

async function pressAndMeasure(code: string) {
  const { down, up } = await rec.hold(code, HOLD_MS)
  await sleep(OBSERVE_AFTER_UP_MS + 100)
  const base = rec.lastAtOrBefore(down.t)
  const at100 = rec.lastAtOrBefore(down.t + D100_WINDOW_MS)
  const d100 = at100.t > down.t ? hdist(base.pos, at100.pos) : 0
  // release: first sample after keyup from which every sample until keyup + 600 ms has horizontal speed < 0.05
  const after = rec.between(up.t, up.t + OBSERVE_AFTER_UP_MS).filter((s) => s.t > up.t)
  let stopMs: number | null = null
  for (let i = 0; i < after.length; i++) {
    if (after.slice(i).every((s) => hspeed(s.vel) < STOP_SPEED)) {
      stopMs = after[i].t - up.t
      break
    }
  }
  const end = rec.lastAtOrBefore(up.t + OBSERVE_AFTER_UP_MS)
  const disp: [number, number] = [end.pos[0] - base.pos[0], end.pos[2] - base.pos[2]]
  const len = Math.hypot(disp[0], disp[1])
  const exp = expectedDir(code, base.yaw)
  const cos = len > 0 ? (disp[0] * exp[0] + disp[1] * exp[1]) / len : 0
  // same displacement judged against the world-fixed (yaw 0) expectation, to show the yaw actually matters
  const exp0 = expectedDir(code, 0)
  const cosYaw0 = len > 0 ? (disp[0] * exp0[0] + disp[1] * exp0[1]) / len : 0
  const held = rec.between(down.t + 50, up.t)
  const heldSpeed = held.length ? held.map((s) => hspeed(s.vel)).sort((a, b) => a - b)[Math.floor(held.length / 2)] : 0
  return {
    code,
    yaw: base.yaw,
    yawEnd: end.yaw,
    heldMs: r3(up.t - down.t),
    keyTarget: down.target,
    keyLocked: down.locked,
    d100: r3(d100),
    d100SampleMs: r3(at100.t - down.t),
    framesIn100: rec.between(down.t, down.t + D100_WINDOW_MS).length,
    stopMs: stopMs == null ? null : r3(stopMs),
    speedAtStopWindowEnd: r3(hspeed(rec.lastAtOrBefore(up.t + STOP_WITHIN_MS).vel)),
    heldSpeedMedian: r3(heldSpeed),
    disp: [r3(disp[0]), r3(disp[1])],
    len: r3(len),
    expected: [r3(exp[0]), r3(exp[1])],
    cos: r3(cos),
    cosYaw0: r3(cosYaw0),
    maxGapMs: r3(rec.maxGap(down.t - 50, up.t + OBSERVE_AFTER_UP_MS)),
    endPos: end.pos as Vec3,
  }
}

const results: Array<Awaited<ReturnType<typeof pressAndMeasure>>> = []
const turns: unknown[] = []
const failures: string[] = []

// yaw ≈ π: forward = +Z (clear lane); then yaw ≈ 3π/4 (diagonal) so a world-axis mix-up cannot pass by sign alone
for (const target of [Math.PI, (3 * Math.PI) / 4]) {
  const turn = await turnToYaw(target)
  turns.push({ target: r3(target), ...turn })
  // precondition: the real mouse movement actually rotated the camera away from the spawn yaw 0
  if (Math.abs(wrap(turn.to)) < 1) failures.push(`camera yaw not rotated by mouse: ${turn.to}`)
  await sleep(300)
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) results.push(await pressAndMeasure(code))
}
rec.stop()

for (const r of results) {
  if (r.code === 'KeyW') {
    if (!(r.d100 >= D100_MIN_M)) failures.push(`W at yaw ${r.yaw}: ${r.d100} m in ${D100_WINDOW_MS} ms < ${D100_MIN_M}`)
    if (r.stopMs == null || r.stopMs > STOP_WITHIN_MS) failures.push(`W at yaw ${r.yaw}: speed < ${STOP_SPEED} only after ${r.stopMs} ms (> ${STOP_WITHIN_MS})`)
  }
  if (!(r.len >= MOVED_MIN_M)) failures.push(`${r.code} at yaw ${r.yaw}: moved only ${r.len} m`)
  if (!(r.cos >= COS_MIN)) failures.push(`${r.code} at yaw ${r.yaw}: direction cos ${r.cos} < ${COS_MIN} (disp ${r.disp}, expected ${r.expected})`)
}

const numbers = {
  renderer,
  tolerance: { cosMin: COS_MIN, d100MinM: D100_MIN_M, stopSpeed: STOP_SPEED, stopWithinMs: STOP_WITHIN_MS },
  turns,
  presses: results,
}
if (failures.length > 0) {
  console.log('TEST-04 numbers ' + JSON.stringify(numbers))
  throw new Error('TEST-04 FAIL ' + JSON.stringify(failures))
}
console.log('TEST-04 PASS ' + JSON.stringify(numbers))
