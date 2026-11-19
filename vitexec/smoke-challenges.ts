// Smoke test E2E untuk mekanik tantangan Only Up! x Ghibli (Tahap 1–3):
// Bounce canopy, Crumbling Laputa ruin (1.2s telegraph + collapse + 5s respawn),
// Moving Gondola carry, Wind Focus slow-mo & stamina bar, Crosswind Gust, Mode & HUD splits.
import { Vector3 } from 'three'
import { game as liveGame } from '/src/game/game.ts'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Snap = {
  state: string
  challengeMode: string
  checkpointIndex: number
  player: { pos: number[]; vel: number[]; groundedRaw: boolean; groundBody: string | null }
  challenges: {
    focusEnergy: number
    focusActive: boolean
    bounceCount: number
    crumbleTriggers: number
    wind: { phase: string; intensity: number }
    crumbles: Record<string, { phase: string; timer: number }>
  }
  audio: { focusMuffled: boolean }
}
type Api = {
  snapshot(): Snap
  __debugTeleport(p: number[]): void
  __debugSetFocus(held: boolean): void
  __debugSetMode(mode: 'hardcore' | 'relaxed', mods?: Record<string, boolean>): void
}

const api = () => (window as unknown as { __game: Api }).__game
const full = () => api().snapshot()
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 8; i++) await nextFrame()

// 1. HUD elements (Wind Focus bar + Speedrun Zone Splits + Mode)
const hasFocusBar = document.querySelector('[data-testid=hud-focus]') != null
const hasSplits = document.querySelector('[data-testid=hud-splits]') != null
const hasTimer = document.querySelector('[data-testid=hud-timer]') != null
out.hud = { hasFocusBar, hasSplits, hasTimer }
if (!hasFocusBar) failures.push('HUD missing wind focus bar')
if (!hasSplits) failures.push('HUD missing speedrun splits')

// 2. Bounce canopy (z1-bounce-canopy-plaza @ [8.5, 0.45, -4.5], top ~0.80)
api().__debugTeleport([-5.0, 0.95, 4.5])
let maxBounceY = 0
for (let i = 0; i < 40; i++) {
  await sleep(25)
  const y = full().player.pos[1]
  if (y > maxBounceY) maxBounceY = y
}
const afterBounce = full()
out.bounce = { count: afterBounce.challenges.bounceCount, maxY: r3(maxBounceY) }
if (afterBounce.challenges.bounceCount < 1 || maxBounceY < 5.0) {
  failures.push(`bounce failed: count=${afterBounce.challenges.bounceCount}, maxY=${r3(maxBounceY)}`)
}

// 3. Wind Focus (0.45x slow-mo + stamina drain + audio muffle)
api().__debugTeleport([0, 0.1, 0])
await sleep(250)
const eBefore = full().challenges.focusEnergy
api().__debugSetFocus(true)
await sleep(500)
const duringFocus = full()
api().__debugSetFocus(false)
await sleep(200)
const afterFocus = full()
out.windFocus = {
  eBefore,
  activeDuring: duringFocus.challenges.focusActive,
  eDuring: duringFocus.challenges.focusEnergy,
  muffled: duringFocus.audio.focusMuffled,
  activeAfter: afterFocus.challenges.focusActive,
}
if (!duringFocus.challenges.focusActive || duringFocus.challenges.focusEnergy >= eBefore - 0.05) {
  failures.push(`windFocus failed: active=${duringFocus.challenges.focusActive}, e=${duringFocus.challenges.focusEnergy}/${eBefore}`)
}

// 4. Moving Gondola carry momentum (z2-gondola-1)
const gond = liveGame.motion.platforms.get('z2-gondola-1')
if (!gond) {
  failures.push('z2-gondola-1 not registered in PlatformMotion')
} else {
  const gp = new Vector3().setFromMatrixPosition(gond.cur)
  api().__debugTeleport([gp.x, gp.y + 0.55, gp.z])
  await sleep(400)
  const p1 = full().player
  await sleep(600)
  const p2 = full().player
  const moved = Math.hypot(p2.pos[0] - p1.pos[0], p2.pos[1] - p1.pos[1], p2.pos[2] - p1.pos[2])
  out.movingCarry = { groundBody1: p1.groundBody, groundBody2: p2.groundBody, moved: r3(moved) }
  if (p1.groundBody !== 'z2-gondola-1' && p2.groundBody !== 'z2-gondola-1') {
    failures.push(`gondola carry failed: groundBody=${p1.groundBody}/${p2.groundBody}`)
  }
}

// 5. Crumbling Laputa Ruin (z3-crumble-1 @ [14.0, 218.0, 24.0], top 218.4): telegraph -> collapsed -> respawn
api().__debugTeleport([14.0, 218.55, 24.0])
await sleep(350)
const cShake = full().challenges.crumbles['z3-crumble-1']
// Move safely away so we don't fall far while waiting for collapse + respawn
api().__debugTeleport([0, 0.1, 0])
await sleep(1250)
const cCollapsed = full().challenges.crumbles['z3-crumble-1']
await sleep(5300)
const cRespawned = full().challenges.crumbles['z3-crumble-1']
out.crumbling = { shake: cShake?.phase, collapsed: cCollapsed?.phase, respawned: cRespawned?.phase }
if (cShake?.phase !== 'shaking' || cCollapsed?.phase !== 'collapsed' || cRespawned?.phase !== 'solid') {
  failures.push(`crumbling failed: ${cShake?.phase} -> ${cCollapsed?.phase} -> ${cRespawned?.phase}`)
}

// 6. Relaxed Mode Checkpoint + Constant Storm Crosswind
api().__debugSetMode('relaxed', { constantStorm: true })
api().__debugTeleport([-46.0, 125.45, -66.8])
await sleep(2200)
const afterMode = full()
out.modeAndWind = {
  mode: afterMode.challengeMode,
  checkpointIndex: afterMode.checkpointIndex,
  windPhase: afterMode.challenges.wind.phase,
}
if (afterMode.challengeMode !== 'relaxed' || afterMode.checkpointIndex < 0) {
  failures.push(`relaxed checkpoint failed: mode=${afterMode.challengeMode}, cp=${afterMode.checkpointIndex}`)
}
if (afterMode.challenges.wind.phase === 'calm') {
  failures.push(`constantStorm wind stayed calm`)
}

if (failures.length) {
  console.log('TEST-CHALLENGES numbers ' + JSON.stringify(out))
  throw new Error('TEST-CHALLENGES FAIL ' + failures.join('; '))
}
console.log('TEST-CHALLENGES PASS ' + JSON.stringify(out))
