// TEST-17 (DIRECTIVE §7, smoke, G4): Cold load -> one click -> AudioContext running and footstep <= 2 s;
// wind bed gain at 0 / 50 / 100 % height; every volume slider reaches gain 0.
import { keyboard } from 'vitexec'
import { bootToPlaying, clickElement, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Full = {
  state: string
  audio: { master: number; sfx: number; ambience: number; wind: number; footstepCount: number; contextState: string }
}
type Api = { snapshot(): Full; __debugTeleport(p: number[]): void }
const api = () => (window as unknown as { __game: Api }).__game
const full = () => api().snapshot()
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()

// 1. AudioContext running + footstep <= 2 s when walking
await keyboard.down('KeyW')
await sleep(700)
await keyboard.up('KeyW')
await sleep(100)
const a1 = full().audio
out.afterWalk = a1
if (a1.contextState !== 'running') failures.push(`AudioContext state=${a1.contextState} (want running)`)
if (a1.footstepCount < 1) failures.push(`footstepCount=${a1.footstepCount} (want >= 1)`)

// 2. Wind bed gain at 0%, 50% (250 m), 100% (500 m)
const windAt: Record<string, number> = {}
for (const [label, y] of [
  ['h0', 0.1],
  ['h50', 250],
  ['h100', 495],
] as const) {
  api().__debugTeleport([0, y, 0])
  await sleep(150)
  for (let i = 0; i < 4; i++) await nextFrame()
  windAt[label] = full().audio.wind
}
out.windAt = windAt
if (!(windAt.h0 < windAt.h50 && windAt.h50 < windAt.h100)) failures.push(`wind did not rise with height: ${JSON.stringify(windAt)}`)
if (Math.abs(windAt.h0 - 0.05) > 0.05) failures.push(`wind at 0% = ${r3(windAt.h0)} (want ~0.05)`)
if (Math.abs(windAt.h50 - 0.25) > 0.05) failures.push(`wind at 50% = ${r3(windAt.h50)} (want ~0.25)`)
if (Math.abs(windAt.h100 - 0.45) > 0.05) failures.push(`wind at 100% = ${r3(windAt.h100)} (want ~0.45)`)

// 3. Every volume slider reaches gain 0
await keyboard.press('KeyP')
await sleep(300)
await clickElement(document.querySelector('[data-testid=panel-pause] [data-testid=settings]') as HTMLElement)
await sleep(200)
for (const id of ['set-vol-master', 'set-vol-sfx', 'set-vol-ambience']) {
  const el = document.querySelector(`[data-testid=${id}]`) as HTMLElement
  await clickElement(el)
  await keyboard.press('Home')
  await sleep(100)
}
const aZero = full().audio
out.slidersZero = { master: aZero.master, sfx: aZero.sfx, ambience: aZero.ambience }
if (aZero.master !== 0 || aZero.sfx !== 0 || aZero.ambience !== 0) failures.push(`sliders did not reach 0: ${JSON.stringify(out.slidersZero)}`)

if (failures.length) {
  console.log('TEST-17 numbers ' + JSON.stringify(out))
  throw new Error('TEST-17 FAIL ' + failures.join('; '))
}
console.log('TEST-17 PASS ' + JSON.stringify(out))
