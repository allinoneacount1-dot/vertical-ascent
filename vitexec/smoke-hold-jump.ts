// TEST-08, smoke part (DIRECTIVE §7 row 08): live app, real keyboard only. Hold Space for 2 s → exactly one takeoff.
// Counts 'takeoff' events (any kind, so a stray air jump would also fail) from the keydown until 1 s after release.
import { keyboard } from 'vitexec'
import { Recorder, bootToPlaying, game, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Ev = { t: number; type: string; data?: { kind?: string } }
const events = () => (window as unknown as { __game: { events: Ev[] } }).__game.events

logRenderer()
await bootToPlaying()
for (let i = 0; i < 300 && !game().snapshot().player.groundedRaw; i++) await nextFrame()
const rec = new Recorder()
rec.start()
const tStart = performance.now()
const held = await rec.hold('Space', 2000)
await sleep(1000)
rec.stop()
const takeoffs = events().filter((e) => e.type === 'takeoff' && e.t >= tStart)
const keydowns = rec.keys.filter((k) => k.code === 'Space' && k.type === 'keydown')
const numbers = {
  part: 'smoke-hold',
  holdMs: r3(held.up.t - held.down.t),
  keydowns: keydowns.length,
  keydownRepeats: keydowns.filter((k) => k.repeat).length,
  takeoffs: takeoffs.length,
  kinds: takeoffs.map((e) => e.data?.kind),
}
if (numbers.takeoffs === 1 && numbers.holdMs >= 1990) console.log('TEST-08 PASS ' + JSON.stringify(numbers))
else {
  console.log('TEST-08 FAIL ' + JSON.stringify(numbers))
  throw new Error('TEST-08 FAIL ' + JSON.stringify(numbers))
}
