// TEST-05 shared body (DIRECTIVE §7 row 05, smoke): sprint 2 s = 2*run ±10 %; walk 2 s = 2*walk ±10 %; Toggle: tap → run,
// idle 3 s → the next W still runs, tap → walk; Hold and Always correct; glyph shown in Toggle/Always (never in Hold).
// The sprint mode is seeded in localStorage['va.settings.v1'] right before the real Play click (allowlist
// "synthetic: settings-seed"; settings are read at run start, D-034). Input: vitexec keyboard/mouse only.
// Distances: horizontal feet displacement between the keydown and keyup timestamps of a 2 s W hold (positions
// interpolated between rAF samples). All movement happens along the clear +Z lane from the spawn (camera yaw π).
import { keyboard } from 'vitexec'
import { LOCOMOTION } from '/src/controller/locomotion.ts'
import { Recorder, bootToPlaying, game, hspeed, logRenderer, r3, sleep, turnToYaw } from '/vitexec/lib/move-smoke.ts'
import type { Sample } from '/vitexec/lib/move-smoke.ts'

type Mode = 'toggle' | 'hold' | 'always'
const TOL = 0.1
const HOLD_MS = 2000

export async function sprintTest(mode: Mode): Promise<void> {
  const id = 'TEST-05'
  const renderer = logRenderer()
  await bootToPlaying(() => {
    localStorage.setItem('va.settings.v1', JSON.stringify({ v: 1, sprintMode: mode }))
    console.log('synthetic: settings-seed ' + JSON.stringify({ sprintMode: mode }))
  })
  const rec = new Recorder()
  rec.start()
  const turn = await turnToYaw(Math.PI) // forward = +Z, the clear lane
  await sleep(200)

  const failures: string[] = []
  const out: Record<string, unknown> = { mode, renderer, turn }

  /** 2 s W hold: distance, mean speed, sprint/glyph shares while held. */
  const leg = async (name: string) => {
    const { down, up } = await rec.hold('KeyW', HOLD_MS)
    await sleep(150)
    const a = rec.posAt(down.t)
    const b = rec.posAt(up.t)
    const held = rec.between(down.t + 50, up.t)
    const share = (f: (s: Sample) => boolean) => (held.length ? r3(held.filter(f).length / held.length) : 0)
    const r = {
      heldMs: r3(up.t - down.t),
      distM: r3(Math.hypot(b[0] - a[0], b[2] - a[2])),
      sprintShare: share((s) => s.sprint),
      glyphShare: share((s) => s.glyph),
      samples: held.length,
    }
    out[name] = r
    return r
  }
  const inRange = (d: number, speed: number) => Math.abs(d - 2 * speed) <= TOL * 2 * speed
  /** Short W hold, median horizontal speed while held. */
  const speedCheck = async (name: string) => {
    const { down, up } = await rec.hold('KeyW', 600)
    await sleep(100)
    const held = rec.between(down.t + 80, up.t)
    const sp = held.map((s) => hspeed(s.vel)).sort((x, y) => x - y)
    const r = { medianSpeed: sp.length ? r3(sp[Math.floor(sp.length / 2)]) : 0, sprint: held.length ? held[held.length - 1].sprint : false, glyph: held.length ? held[held.length - 1].glyph : false }
    out[name] = r
    return r
  }
  const close = (v: number, target: number) => Math.abs(v - target) <= TOL * target

  if (mode === 'toggle') {
    const walk = await leg('walk2s')
    if (!inRange(walk.distM, LOCOMOTION.walkSpeed)) failures.push(`walk 2 s ${walk.distM} m ≠ ${2 * LOCOMOTION.walkSpeed} ±10 %`)
    if (walk.sprintShare !== 0 || walk.glyphShare !== 0) failures.push('sprint/glyph active while walking')
    await keyboard.press('ShiftLeft') // tap → run
    await sleep(200)
    const run = await leg('sprint2s')
    if (!inRange(run.distM, LOCOMOTION.runSpeed)) failures.push(`sprint 2 s ${run.distM} m ≠ ${2 * LOCOMOTION.runSpeed} ±10 %`)
    if (run.sprintShare < 1) failures.push(`sprint not active for the whole toggle run (${run.sprintShare})`)
    if (run.glyphShare < 0.9) failures.push(`glyph missing while sprinting in toggle (${run.glyphShare})`)
    await sleep(3000) // idle 3 s
    const still = await speedCheck('afterIdle3s')
    if (!close(still.medianSpeed, LOCOMOTION.runSpeed) || !still.sprint) failures.push(`after 3 s idle W is not run (${JSON.stringify(still)})`)
    await keyboard.press('ShiftLeft') // tap → walk
    await sleep(200)
    const back = await speedCheck('afterSecondTap')
    if (!close(back.medianSpeed, LOCOMOTION.walkSpeed) || back.sprint || back.glyph) failures.push(`second tap did not return to walk (${JSON.stringify(back)})`)
  } else if (mode === 'hold') {
    const walk = await leg('walk2s')
    if (!inRange(walk.distM, LOCOMOTION.walkSpeed)) failures.push(`walk 2 s ${walk.distM} m ≠ ${2 * LOCOMOTION.walkSpeed} ±10 %`)
    await keyboard.down('ShiftLeft')
    await sleep(100)
    const run = await leg('sprint2sShiftHeld')
    await keyboard.up('ShiftLeft')
    await sleep(150)
    if (!inRange(run.distM, LOCOMOTION.runSpeed)) failures.push(`sprint 2 s (Shift held) ${run.distM} m ≠ ${2 * LOCOMOTION.runSpeed} ±10 %`)
    if (run.sprintShare < 1) failures.push(`sprint not active while Shift held (${run.sprintShare})`)
    const after = await speedCheck('afterShiftRelease')
    if (!close(after.medianSpeed, LOCOMOTION.walkSpeed) || after.sprint) failures.push(`still running after Shift release in hold mode (${JSON.stringify(after)})`)
    const anyGlyph = rec.samples.some((s) => s.glyph)
    out.glyphEverShown = anyGlyph
    if (anyGlyph) failures.push('glyph shown in hold mode')
  } else {
    const run = await leg('always2s')
    if (!inRange(run.distM, LOCOMOTION.runSpeed)) failures.push(`always-run 2 s ${run.distM} m ≠ ${2 * LOCOMOTION.runSpeed} ±10 %`)
    if (run.sprintShare < 1) failures.push(`sprint not active in always mode (${run.sprintShare})`)
    if (run.glyphShare < 0.9) failures.push(`glyph missing in always mode (${run.glyphShare})`)
    await keyboard.press('ShiftLeft') // Shift has no effect in always mode
    await sleep(200)
    const still = await speedCheck('afterShiftTap')
    if (!close(still.medianSpeed, LOCOMOTION.runSpeed) || !still.sprint) failures.push(`always mode left run after Shift (${JSON.stringify(still)})`)
  }
  rec.stop()
  out.endPos = game().snapshot().player.pos
  out.failures = failures
  if (failures.length > 0) {
    console.log(`${id} numbers ` + JSON.stringify(out))
    throw new Error(`${id} FAIL (${mode}) ${failures.join('; ')}`)
  }
  console.log(`${id} PASS ` + JSON.stringify(out))
}
