// TEST-29 (DIRECTIVE §7, smoke, G2): __debugTeleport below the kill plane (allowlist "debug-setup") → fade, spawn, the
// timer continues, run.killPlaneRespawns++, HUD 0 m within 1 s, |v| < 0.5 two frames later. Also the horizontal
// bound (outside floorAABB + 10 m, D-007).
import { keyboard } from 'vitexec'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Full = { state: string; frame: number; player: { pos: number[]; vel: number[] }; run: { timerMs: number; killPlaneRespawns: number; heightM: number }; level: string }
type G = { snapshot(): Full; __debugTeleport(p: [number, number, number]): void }
const g = () => (window as unknown as { __game: G }).__game

logRenderer()
await bootToPlaying()
await keyboard.press('KeyW') // starts the run timer (first movement input)
await sleep(1200)

async function trial(label: string, p: [number, number, number], expectedCount: number) {
  const before = g().snapshot()
  console.log(`debug-setup: __debugTeleport(${JSON.stringify(p)}) (${label})`)
  const tCall = performance.now()
  g().__debugTeleport(p)
  // wait for the respawn: position back at the spawn
  let respawnAt: number | null = null
  let sawFade = false
  let respawnFrame = 0
  while (performance.now() - tCall < 2000) {
    const s = g().snapshot()
    if (document.querySelector('.fade')) sawFade = true
    if (respawnAt == null && s.run.killPlaneRespawns === expectedCount) {
      respawnAt = performance.now()
      respawnFrame = s.frame
    }
    if (respawnAt != null) break
    await nextFrame()
  }
  // two app frames later
  while (g().snapshot().frame < respawnFrame + 2) await nextFrame()
  const after2 = g().snapshot()
  // HUD 0 m within 1 s
  let hudZeroAt: number | null = null
  while (performance.now() - tCall < 1500) {
    if (/^0 \//.test(document.querySelector('[data-testid=hud-height]')?.textContent ?? '')) {
      hudZeroAt = performance.now()
      break
    }
    await nextFrame()
  }
  await sleep(300)
  const later = g().snapshot()
  const toast = [...document.querySelectorAll('[data-testid=toasts] .toast')].map((x) => x.textContent)
  return {
    label,
    respawnMs: respawnAt == null ? null : r3(respawnAt - tCall),
    sawFade,
    posAfter: after2.player.pos,
    speedAfter2Frames: r3(Math.hypot(...after2.player.vel)),
    hudZeroMs: hudZeroAt == null ? null : r3(hudZeroAt - tCall),
    timerBefore: before.run.timerMs,
    timerLater: later.run.timerMs,
    killPlaneRespawns: later.run.killPlaneRespawns,
    state: later.state,
    toast,
  }
}

const below = await trial('below y -20', [0, -25, 5], 1)
await sleep(800)
const outside = await trial('outside floorAABB + 10 m', [200, 5, 0], 2)
const failures: string[] = []
for (const r of [below, outside]) {
  if (r.respawnMs == null) failures.push(`${r.label}: no respawn`)
  if (!r.sawFade) failures.push(`${r.label}: no fade`)
  if (Math.hypot(r.posAfter[0], r.posAfter[1], r.posAfter[2]) > 0.05) failures.push(`${r.label}: not at the spawn (${r.posAfter})`)
  if (!(r.speedAfter2Frames < 0.5)) failures.push(`${r.label}: |v| ${r.speedAfter2Frames} two frames after respawn`)
  if (r.hudZeroMs == null || r.hudZeroMs > 1000) failures.push(`${r.label}: HUD 0 m after ${r.hudZeroMs} ms`)
  if (!(r.timerLater > r.timerBefore)) failures.push(`${r.label}: timer did not continue (${r.timerBefore} → ${r.timerLater})`)
  if (r.state !== 'PLAYING') failures.push(`${r.label}: state ${r.state}`)
  if (!r.toast.some((x) => /fell out|jatuh keluar/i.test(x ?? ''))) failures.push(`${r.label}: no "Fell out of the world" toast`)
}
if (below.killPlaneRespawns !== 1 || outside.killPlaneRespawns !== 2) failures.push(`respawn counter ${below.killPlaneRespawns}, ${outside.killPlaneRespawns}`)
const numbers = { below, outside }
if (failures.length) {
  console.log('TEST-29 numbers ' + JSON.stringify(numbers))
  throw new Error('TEST-29 FAIL ' + failures.join('; '))
}
console.log('TEST-29 PASS ' + JSON.stringify(numbers))
