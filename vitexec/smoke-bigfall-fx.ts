// TEST-12b (DIRECTIVE §7, smoke, G4): Big fall -> wind gain rises, camera +1 m, HUD "-NN m", toast "Lost NN m".
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Full = {
  state: string
  player: { pos: number[]; groundedRaw: boolean; bigFall: boolean }
  camera: { zoom: number }
  audio: { wind: number }
}
type Api = { snapshot(): Full; __debugTeleport(p: number[]): void }
const api = () => (window as unknown as { __game: Api }).__game
const full = () => api().snapshot()
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
const zoom0 = full().camera.zoom
const wind0 = full().audio.wind

// Ground on a high pad (~63 m) first so lastGroundedY updates, then step into open air to fall to y = 0
api().__debugTeleport([23.4, 64.0, 10.5])
for (let i = 0; i < 60 && !full().player.groundedRaw; i++) await nextFrame()
await sleep(150)
api().__debugTeleport([0, 200, 15])
let sawBigFall = false
let zoomDuring = zoom0
let windDuring = wind0
const t0 = performance.now()
while (performance.now() - t0 < 8000) {
  const s = full()
  if (s.player.bigFall) {
    sawBigFall = true
    zoomDuring = Math.max(zoomDuring, s.camera.zoom)
    windDuring = Math.max(windDuring, s.audio.wind)
  }
  if (sawBigFall && s.player.groundedRaw) break
  await nextFrame()
}
await sleep(250)

const hudLost = document.querySelector('[data-testid=hud-lost]')?.textContent ?? null
const toastText = document.querySelector('[data-testid=toasts]')?.textContent ?? ''
out.bigFall = { sawBigFall, zoom0: r3(zoom0), zoomDuring: r3(zoomDuring), wind0: r3(wind0), windDuring: r3(windDuring), hudLost, toastText }

if (!sawBigFall) failures.push('bigFall never became true')
if (zoomDuring < zoom0 + 0.8) failures.push(`camera zoom ${r3(zoomDuring)} did not pull back +1 m from ${r3(zoom0)}`)
if (windDuring <= wind0 + 0.2) failures.push(`wind gain ${r3(windDuring)} did not rise from ${r3(wind0)}`)
if (!hudLost || !/−\d+\s*m/.test(hudLost)) failures.push(`HUD lost counter missing/invalid: ${String(hudLost)}`)
if (!/(Lost|Turun)\s+\d+\s*m/.test(toastText)) failures.push(`toast missing Lost NN m: ${toastText}`)

if (failures.length) {
  console.log('TEST-12b numbers ' + JSON.stringify(out))
  throw new Error('TEST-12b FAIL ' + failures.join('; '))
}
console.log('TEST-12b PASS ' + JSON.stringify(out))
