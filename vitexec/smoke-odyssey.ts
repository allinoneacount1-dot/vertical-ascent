// TEST-46: E2E smoke test for Fase 3 Mode Odyssey 1000 m (Z5-Z8)
// Verifies: Odyssey mode toggle -> 1000 m target, Z5 Updraft Thermal vertical lift,
// Z6 Airship kinematic carry, Z7 Aether Low-Gravity 0.65x activation & HUD badge,
// Z8 Orbiting platform kinematic carry, and 1000 m Celestial Throne victory trigger.
import { Vector3 } from 'three'
import { game as liveGame } from '/src/game/game.ts'
import { ODYSSEY_UPDRAFS } from '/src/level/odyssey.ts'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Api = {
  snapshot(): {
    state: string
    player: { pos: number[]; vel: number[]; groundedRaw: boolean }
  }
  __debugTeleport(p: number[]): void
  __debugSetOdyssey(on: boolean): void
}

const api = () => (window as unknown as { __game: Api }).__game
const full = () => api().snapshot()
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 6; i++) await nextFrame()

// 1. Enable Odyssey 1000 m mode
api().__debugSetOdyssey(true)
await sleep(300)
const heightText = document.querySelector('[data-testid=hud-height]')?.textContent ?? ''
out.odysseyHud = { heightText, odysseyMode: liveGame.odysseyMode }
if (!heightText.includes('1000')) failures.push(`HUD target did not switch to 1000 m: "${heightText}"`)

// 2. Z5 Updraft Thermal lift (z5-updraft-1 @ [78, 503, -22])
const up = ODYSSEY_UPDRAFS[0]
api().__debugTeleport([up.pos[0], up.pos[1] + 2.0, up.pos[2]])
let maxY = 0
for (let i = 0; i < 24; i++) {
  await sleep(30)
  const y = full().player.pos[1]
  if (y > maxY) maxY = y
}
const riseM = r3(maxY - (up.pos[1] + 2.0))
out.updraft = { startY: up.pos[1] + 2.0, maxY: r3(maxY), riseM }
if (riseM < 2.5) failures.push(`Z5 Updraft Thermal did not lift player enough: riseM=${riseM}`)

// 3. Z6 Airship kinematic carry (z6-airship-1)
const ship = liveGame.motion.platforms.get('z6-airship-1')
if (!ship) {
  failures.push('z6-airship-1 not registered in PlatformMotion')
} else {
  const sp = new Vector3().setFromMatrixPosition(ship.cur)
  api().__debugTeleport([sp.x, sp.y + 0.65, sp.z])
  await sleep(350)
  const p0 = full().player.pos.slice()
  let grounded = full().player.groundedRaw
  for (let i = 0; i < 18; i++) {
    await sleep(35)
    if (full().player.groundedRaw) grounded = true
  }
  const p1 = full().player.pos
  const moved = r3(Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]))
  out.airshipCarry = { grounded, moved }
  if (!grounded || moved < 0.2) failures.push(`Z6 Airship carry failed: grounded=${grounded}, moved=${moved}`)
}

// 4. Z7 Aether Low-Gravity 0.65x (y = 774 m on z7-crystal-1)
api().__debugTeleport([34, 775.0, -8])
await sleep(350)
const lowGActive = liveGame.aetherLowG
const hasLowGBadge = document.querySelector('[data-testid=hud-lowg]') != null
out.aetherLowG = { lowGActive, hasLowGBadge }
if (!lowGActive || !hasLowGBadge) failures.push(`Z7 Low-G failed: active=${lowGActive}, badge=${hasLowGBadge}`)

// 5. Z8 Orbiting Celestial Platform carry (z8-orbit-1)
const orb = liveGame.motion.platforms.get('z8-orbit-1')
if (!orb) {
  failures.push('z8-orbit-1 not registered in PlatformMotion')
} else {
  const op = new Vector3().setFromMatrixPosition(orb.cur)
  api().__debugTeleport([op.x, op.y + 0.65, op.z])
  await sleep(350)
  const p0 = full().player.pos.slice()
  let grounded = full().player.groundedRaw
  for (let i = 0; i < 18; i++) {
    await sleep(35)
    if (full().player.groundedRaw) grounded = true
  }
  const p1 = full().player.pos
  const moved = r3(Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]))
  out.orbitCarry = { grounded, moved }
  if (!grounded || moved < 0.25) failures.push(`Z8 Orbit carry failed: grounded=${grounded}, moved=${moved}`)
}

// 6. 1000 m Celestial Throne Victory Trigger
api().__debugTeleport([55, 1001.2, 0])
await sleep(500)
const finalState = full().state
out.victory1000m = { state: finalState, inOdysseyFinish: liveGame.inOdysseyFinish }
if (finalState !== 'VICTORY') failures.push(`1000 m Celestial Throne did not trigger VICTORY: state=${finalState}`)

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-46-odyssey-1000m', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-46 FAILED: ${failures.join('; ')}`)
