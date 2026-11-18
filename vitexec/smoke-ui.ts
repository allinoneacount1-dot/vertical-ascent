// TEST-02 (DIRECTIVE §7, smoke, G3): Play / Continue / New climb / Settings / Controls / Credits / Best open and close;
// focus returns to canvas; aria-live region exists; HUD contrast >= 4.5:1 at ground, cloud, and summit heights.
import { keyboard } from 'vitexec'
import { clickElement, logRenderer, nextFrame, seedNoRawInput, sleep } from '/vitexec/lib/move-smoke.ts'

type Full = {
  state: string
  player: { pos: number[] }
  run: { heightM: number; timerMs: number }
}
type Api = { snapshot(): Full; __debugTeleport(p: number[]): void }
const api = () => (window as unknown as { __game: Api }).__game
const full = () => api().snapshot()
const canvas = document.querySelector('canvas') as HTMLCanvasElement
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

async function until(fn: () => boolean, frames = 180): Promise<boolean> {
  for (let i = 0; i < frames; i++) {
    if (fn()) return true
    await nextFrame()
  }
  return fn()
}

const $ = (sel: string) => {
  const el = document.querySelector(sel)
  if (!(el instanceof HTMLElement)) throw new Error(`TEST-02 FAIL missing ${sel}`)
  return el
}

async function click(sel: string): Promise<void> {
  await clickElement($(sel))
}

async function enterPlaying(sel: string): Promise<void> {
  await click(sel)
  if (!(await until(() => full().state === 'PLAYING' && document.pointerLockElement === canvas))) {
    await sleep(450)
    await click(sel)
    if (!(await until(() => full().state === 'PLAYING' && document.pointerLockElement === canvas))) {
      throw new Error(`TEST-02 FAIL ${sel} did not enter locked PLAYING`)
    }
  }
  await sleep(250)
}

function parseRgba(s: string): [number, number, number, number] {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s)
  if (!m) return [0, 0, 0, 1]
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])]
}

function relLum(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = relLum(fg[0], fg[1], fg[2])
  const l2 = relLum(bg[0], bg[1], bg[2])
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

function measureHudContrast(): { minRatio: number; labelRatio: number; valueRatio: number } {
  const block = $('.hud-block')
  const label = $('.hud-label')
  const val = $('.hud-value')
  const bg = parseRgba(getComputedStyle(block).backgroundColor)
  // Composite semi-transparent backplate over worst-case white (#ffffff) sky/cloud background
  const comp: [number, number, number] = [
    Math.round(bg[0] * bg[3] + 255 * (1 - bg[3])),
    Math.round(bg[1] * bg[3] + 255 * (1 - bg[3])),
    Math.round(bg[2] * bg[3] + 255 * (1 - bg[3])),
  ]
  const fgLabel = parseRgba(getComputedStyle(label).color)
  const fgVal = parseRgba(getComputedStyle(val).color)
  const labelRatio = Math.round(contrastRatio([fgLabel[0], fgLabel[1], fgLabel[2]], comp) * 100) / 100
  const valueRatio = Math.round(contrastRatio([fgVal[0], fgVal[1], fgVal[2]], comp) * 100) / 100
  return { minRatio: Math.min(labelRatio, valueRatio), labelRatio, valueRatio }
}

// 1. Wait for MENU and verify aria-live region
await until(() => full().state === 'MENU', 300)
seedNoRawInput()
const ariaLiveCount = document.querySelectorAll('[aria-live]').length
out.ariaLiveCount = ariaLiveCount
if (ariaLiveCount < 1) failures.push('no [aria-live] region in DOM')

// 2. Open and close Settings, Controls, Credits, Best from MENU
const panels = [
  ['[data-testid=settings]', '[data-testid=panel-settings]', '[data-testid=settings-back]'],
  ['[data-testid=controls]', '[data-testid=panel-controls]', '[data-testid=controls-back]'],
  ['[data-testid=credits]', '[data-testid=panel-credits]', '[data-testid=credits-back]'],
  ['[data-testid=best]', '[data-testid=panel-best]', '[data-testid=best-back]'],
] as const
const opened: string[] = []
for (const [btn, panel, back] of panels) {
  await click(btn)
  if (!(await until(() => document.querySelector(panel) != null))) failures.push(`failed to open ${panel}`)
  else opened.push(panel)
  await click(back)
  if (!(await until(() => document.querySelector('[data-testid=panel-menu]') != null))) failures.push(`failed to close ${panel}`)
}
out.menuPanels = opened

// 3. Play -> PLAYING -> canvas locked -> Save & quit -> Continue -> New climb
await enterPlaying('[data-testid=play]')
if (document.pointerLockElement !== canvas) failures.push('focus/pointerLock not on canvas after Play')
await keyboard.press('KeyW', { durationMs: 250 })
await sleep(200)
await keyboard.press('KeyP')
await until(() => full().state === 'PAUSED')
await sleep(300)
await click('[data-testid=save-quit]')
if (!(await until(() => full().state === 'MENU' && document.querySelector('[data-testid=continue]') != null))) {
  failures.push('Continue button not offered after Save & quit')
}

await enterPlaying('[data-testid=continue]')
if (document.pointerLockElement !== canvas) failures.push('focus/pointerLock not on canvas after Continue')
await keyboard.press('KeyP')
await until(() => full().state === 'PAUSED')
await sleep(300)
await click('[data-testid=save-quit]')
await until(() => full().state === 'MENU')
await click('[data-testid=new-climb]')
await until(() => document.querySelector('[data-testid=confirm-new-climb]') != null)
await enterPlaying('[data-testid=confirm-new-climb]')
if (document.pointerLockElement !== canvas) failures.push('focus/pointerLock not on canvas after New climb')
out.flow = 'Play -> Save&Quit -> Continue -> Save&Quit -> New climb PASS'

// 4. HUD contrast >= 4.5:1 at ground (0m), cloud (~237m), summit (~495m)
const spots: Array<{ name: string; pos: [number, number, number] }> = [
  { name: 'ground', pos: [0, 0.1, 0] },
  { name: 'cloud', pos: [-59.65, 237.6, 25.45] },
  { name: 'summit', pos: [78, 495.2, -29.15] },
]
const contrast: Record<string, unknown> = {}
for (const s of spots) {
  api().__debugTeleport(s.pos)
  await sleep(400)
  const c = measureHudContrast()
  contrast[s.name] = { ...c, heightM: full().run.heightM }
  if (c.minRatio < 4.5) failures.push(`${s.name} HUD contrast ${c.minRatio} < 4.5`)
}
out.contrast = contrast

if (failures.length) {
  console.log('TEST-02 numbers ' + JSON.stringify(out))
  throw new Error('TEST-02 FAIL ' + failures.join('; '))
}
console.log('TEST-02 PASS ' + JSON.stringify(out))
