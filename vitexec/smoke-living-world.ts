// TEST-49: E2E smoke test for Fase 6 Gelombang A (LivingWorld Ghibli Atmosphere, Artifacts, God Rays & PlayerVfx)
import { game as liveGame } from '/src/game/game.ts'
import { bootToPlaying, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 8; i++) await nextFrame()

// 1. Check LivingWorld & PlayerVfx nodes in the Three.js scene graph
const rootScene = liveGame.visualRoot?.parent?.parent ?? liveGame.playerRoot?.parent
const expectedNames = [
  'living-world',
  'living-grass',
  'living-flowers',
  'living-banners',
  'living-shrines',
  'living-windmills',
  'living-god-rays',
  'living-cumulus',
  'living-relic-altars',
  'living-camp-props',
  'player-vfx',
]
const found: Record<string, boolean> = {}
for (const name of expectedNames) {
  found[name] = Boolean(rootScene?.getObjectByName(name))
  if (!found[name]) failures.push(`Missing scene object: ${name}`)
}
out.sceneObjects = found

// 2. Teleport near East Plaza Toro Shrine ([7.4, 0, -4.2]) to verify proximity activation
const w = window as unknown as { __game?: { __debugTeleport?: (p: [number, number, number]) => void } }
w.__game?.__debugTeleport?.([7.0, 0.2, -4.0])
await sleep(300)
for (let i = 0; i < 6; i++) await nextFrame()

out.litShrines = liveGame.livingWorld.litShrines
if (liveGame.livingWorld.litShrines < 1) {
  failures.push(`Expected Toro shrine proximity activation (>= 1), got ${liveGame.livingWorld.litShrines}`)
}

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-49-living-world', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-49 FAILED: ${failures.join('; ')}`)
