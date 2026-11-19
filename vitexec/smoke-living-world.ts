// TEST-49: E2E smoke test for Fase 6 Gelombang A — Living Ghibli World, Artifacts, Windmills, God Rays & Character VFX
import { game as liveGame } from '/src/game/game.ts'
import { bootToPlaying, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 8; i++) await nextFrame()

const snap = (window as unknown as { __game: { livingWorld?: Record<string, number> } }).__game
out.livingWorldMeta = snap.livingWorld ?? null
if (!snap.livingWorld || snap.livingWorld.grassCount < 500) {
  failures.push(`livingWorld meta missing or invalid: ${JSON.stringify(snap.livingWorld)}`)
}

// Verify Living World scene nodes exist via scene traversal from visualRoot parent
const scene = liveGame.visualRoot?.parent
const expectedNames = [
  'living-ghibli-world',
  'living-grass',
  'living-banners',
  'living-shrines',
  'living-windmills',
  'living-godrays',
  'living-cumulus',
  'living-relic-altars',
  'player-dust-vfx',
  'player-jump-ring',
]
const found: Record<string, boolean> = {}
for (const name of expectedNames) {
  const ok = scene?.getObjectByName(name) != null
  found[name] = ok
  if (!ok) failures.push(`Missing LivingWorld scene node: ${name}`)
}
out.nodes = found

// Verify windmill blades rotate over time
const mill = scene?.getObjectByName('mill-z1-w')
const blades = mill?.children[2]
const rot0 = blades?.rotation.z ?? 0
await sleep(300)
for (let i = 0; i < 6; i++) await nextFrame()
const rot1 = blades?.rotation.z ?? 0
const bladeDelta = Math.abs(rot1 - rot0)
out.windmillDelta = Math.round(bladeDelta * 1000) / 1000
if (bladeDelta < 0.05) failures.push(`Windmill blades did not rotate: delta=${bladeDelta}`)

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-49-living-world', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-49 FAILED: ${failures.join('; ')}`)
