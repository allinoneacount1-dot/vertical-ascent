// One-off G1 integration probe: MENU → real click on Play → pointer lock → W + jump. Not evidence.
import { keyboard, mouse } from 'vitexec'

type G = { state: string; worldReady: boolean; player: { pos: number[]; groundedRaw: boolean }; camera: unknown; bvh: unknown; anim: unknown; run: unknown }
const g = () => (window as unknown as { __game: G }).__game
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const frame = () => new Promise((r) => requestAnimationFrame(r))

const t0 = performance.now()
while (g()?.state !== 'MENU') {
  if (performance.now() - t0 > 20000) throw new Error('no MENU, state=' + g()?.state)
  await sleep(100)
}
console.log('menu after ms ' + Math.round(performance.now() - t0) + ' bvh ' + JSON.stringify(g().bvh))
const button = [...document.querySelectorAll('button')].find((b) => /play|main/i.test(b.textContent ?? ''))
if (!button) throw new Error('no play button')
const r = button.getBoundingClientRect()
await mouse.moveTo(r.x + r.width / 2, r.y + r.height / 2)
await mouse.click()
for (let i = 0; i < 60 && g().state !== 'PLAYING'; i++) await frame()
const canvas = document.querySelector('canvas')
console.log('after click ' + JSON.stringify({ state: g().state, locked: document.pointerLockElement === canvas, active: document.activeElement?.tagName }))
const camLog: unknown[] = []
const iv = setInterval(() => camLog.push({ t: Math.round(performance.now() - t0), cam: g().camera, pos: g().player.pos }), 100)
document.addEventListener('pointermove', (e) => {
  if (e.movementX || e.movementY) camLog.push({ t: Math.round(performance.now() - t0), pm: [e.movementX, e.movementY], locked: document.pointerLockElement != null })
})
await sleep(500)
const p0 = g().player.pos
await keyboard.down('KeyW', { releaseAfterMs: 1000 })
await sleep(300)
await keyboard.press('Space')
await sleep(1200)
clearInterval(iv)
console.log('camlog ' + JSON.stringify(camLog))
const p1 = g().player.pos
console.log('moved ' + JSON.stringify({ p0, p1, anim: g().anim, run: g().run, camera: g().camera, grounded: g().player.groundedRaw }))
