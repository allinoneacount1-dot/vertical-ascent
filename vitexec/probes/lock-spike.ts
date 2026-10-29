// One-off probe: which pointermove events (movementX/Y) arrive around pointer lock acquisition? Not evidence.
import { mouse } from 'vitexec'

type G = { state: string; camera: { yaw: number; pitch: number } }
const g = () => (window as unknown as { __game: G }).__game
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
while (g()?.state !== 'MENU') await sleep(100)
const canvas = document.querySelector('canvas')!
const log: Array<Record<string, unknown>> = []
const t0 = performance.now()
const rec = (type: string) => (e: Event) => {
  const m = e as PointerEvent
  log.push({ t: Math.round(performance.now() - t0), type, mx: m.movementX, my: m.movementY, x: m.clientX, y: m.clientY, locked: document.pointerLockElement === canvas, target: (e.target as Element)?.tagName })
}
document.addEventListener('pointermove', rec('pointermove'), true)
document.addEventListener('mousemove', rec('mousemove'), true)
document.addEventListener('pointerlockchange', () => log.push({ t: Math.round(performance.now() - t0), type: 'lockchange', locked: document.pointerLockElement === canvas, cam: { ...g().camera } }))
const button = [...document.querySelectorAll('button')][0]
const r = button.getBoundingClientRect()
await mouse.moveTo(r.x + r.width / 2, r.y + r.height / 2)
console.log('cam before click ' + JSON.stringify(g().camera))
await mouse.click()
await sleep(800)
console.log('cam after ' + JSON.stringify(g().camera))
console.log('events ' + JSON.stringify(log.filter((e) => e.type !== 'pointermove' || e.locked || (e.t as number) > -1).slice(-30)))
