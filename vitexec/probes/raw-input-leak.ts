// D-040 probe: pointermove events that reach the page while vitexec sends NO mouse input, for 6 s with a raw-input
// (unadjustedMovement) pointer lock and 6 s with a plain lock. Any event during the idle windows comes from outside
// vitexec (the machine's physical mouse). Diagnostic only; sets game.rawInput directly for the second lock.
import { mouse } from 'vitexec'
import { bootToPlaying, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'
import { game } from '/src/game/game.ts'
localStorage.removeItem('va.settings.v1')
const canvas = await bootToPlaying(() => undefined)
const rec = (ms: number) => new Promise<unknown>((res) => {
  const ev: Array<{ mx: number; my: number }> = []
  const h = (e: PointerEvent) => { if (document.pointerLockElement === canvas && e.isTrusted) ev.push({ mx: e.movementX, my: e.movementY }) }
  document.addEventListener('pointermove', h, true)
  const yaw0 = game.cameraRig!.yaw
  setTimeout(() => { document.removeEventListener('pointermove', h, true); res({ n: ev.length, sumX: ev.reduce((a, e) => a + e.mx, 0), sumY: ev.reduce((a, e) => a + e.my, 0), dYaw: r3(game.cameraRig!.yaw - yaw0), rawLock: game.rawInput }) }, ms)
})
game.rawInput = true
document.exitPointerLock(); await sleep(400)
const click = async () => { const b = document.querySelector('.panel button') as HTMLButtonElement; const r = b.getBoundingClientRect(); await mouse.moveTo(r.x + r.width / 2, r.y + r.height / 2); await mouse.click(); for (let i = 0; i < 120 && document.pointerLockElement !== canvas; i++) await nextFrame(); await sleep(300) }
await click()
const raw = await rec(6000)
document.exitPointerLock(); await sleep(400)
game.rawInput = false
await click()
const plain = await rec(6000)
console.log('raw-input-leak ' + JSON.stringify({ rawLockIdle6s: raw, plainLockIdle6s: plain }))
