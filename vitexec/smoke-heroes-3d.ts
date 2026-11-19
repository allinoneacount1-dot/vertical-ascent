// TEST-50: E2E smoke test for Tahap 3 — 4 Real 3D Hero Models (AvatarSample_F, G, E + Stylized Automaton Mannequin)
import { Mesh } from 'three'
import { game as liveGame } from '/src/game/game.ts'
import { HEROES } from '/src/character/heroes.ts'
import { bootToPlaying, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 6; i++) await nextFrame()

const seenUuids = new Set<string>()
const report: Array<{ id: string; uuid: string; meshes: number; scale: number }> = []

for (const h of HEROES) {
  const prevUuid = liveGame.model?.scene.uuid ?? ''
  liveGame.setHero(h.id)
  const deadline = performance.now() + 12_000
  while (performance.now() < deadline) {
    const cur = liveGame.model?.scene.uuid ?? ''
    if (cur && (h.id === 'sora' || cur !== prevUuid)) break
    await sleep(120)
  }
  for (let i = 0; i < 4; i++) await nextFrame()
  const scene = liveGame.model?.scene
  let meshes = 0
  scene?.traverse((o) => {
    if (o instanceof Mesh) meshes++
  })
  const uuid = scene?.uuid ?? ''
  const scale = Math.round((scene?.scale.x ?? 0) * 100) / 100
  report.push({ id: h.id, uuid, meshes, scale })
  if (!uuid) failures.push(`Hero ${h.id} failed to load model`)
  if (meshes < 1) failures.push(`Hero ${h.id} has 0 meshes`)
  seenUuids.add(uuid)
}

// Restore default Sora
liveGame.setHero('sora')
await sleep(300)

out.heroes = report
out.distinctModels = seenUuids.size
if (seenUuids.size < 4) failures.push(`Expected 4 distinct 3D hero models, got ${seenUuids.size}`)

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-50-multi-hero-3d', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-50 FAILED: ${failures.join('; ')}`)
