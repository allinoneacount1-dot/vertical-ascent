// TEST-25 (DIRECTIVE §7, smoke, G4): Resize the canvas container 1280x720 -> 800x1000 (in-page):
// canvas dimensions match, camera.aspect within 1e-3, HUD remains visible.
import { game as liveGame } from '/src/game/game.ts'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

const out: Record<string, unknown> = { renderer: logRenderer() }
const failures: string[] = []
const canvas = await bootToPlaying()

const app = document.querySelector('.app') as HTMLElement | null
if (!app) throw new Error('TEST-25 FAIL missing .app container')

const checkSize = (label: string, w: number, h: number) => {
  const rect = canvas.getBoundingClientRect()
  const cam = liveGame.cameraRig?.camera
  const aspect = cam?.aspect ?? NaN
  const wantAspect = w / h
  const hud = document.querySelector('.hud') as HTMLElement | null
  const hudRect = hud?.getBoundingClientRect()
  const hudVisible = hudRect != null && hudRect.width > 0 && hudRect.height > 0 && hudRect.right <= w && hudRect.bottom <= h
  const row = { css: [Math.round(rect.width), Math.round(rect.height)], buf: [canvas.width, canvas.height], aspect: r3(aspect), wantAspect: r3(wantAspect), hudVisible }
  out[label] = row
  if (Math.abs(rect.width - w) > 2 || Math.abs(rect.height - h) > 2) failures.push(`${label} canvas css ${rect.width}x${rect.height} != ${w}x${h}`)
  if (Math.abs(aspect - wantAspect) > 1e-3) failures.push(`${label} camera.aspect ${aspect} != ${wantAspect}`)
  if (!hudVisible) failures.push(`${label} HUD not visible`)
}

checkSize('initial', 1280, 720)
app.style.width = '800px'
app.style.height = '1000px'
window.dispatchEvent(new Event('resize'))
for (let i = 0; i < 15; i++) await nextFrame()
await sleep(200)
checkSize('resized', 800, 1000)

if (failures.length) {
  console.log('TEST-25 numbers ' + JSON.stringify(out))
  throw new Error('TEST-25 FAIL ' + failures.join('; '))
}
console.log('TEST-25 PASS ' + JSON.stringify(out))
