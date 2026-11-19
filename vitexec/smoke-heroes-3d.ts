// TEST-50: E2E smoke test for Fase 6 Gelombang B (4 Real 3D Hero Models: Sora F, Victoria G, Vivi E, Automaton GLB)
import { Mesh } from 'three'
import { game as liveGame } from '/src/game/game.ts'
import { HEROES } from '/src/character/heroes.ts'
import type { HeroId } from '/src/character/heroes.ts'
import { bootToPlaying, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 8; i++) await nextFrame()

async function waitForModelChange(prevUuid: string, timeoutMs = 12000): Promise<string> {
  const start = performance.now()
  while (performance.now() - start < timeoutMs) {
    const cur = liveGame.model?.scene.uuid ?? ''
    if (cur && cur !== prevUuid) return cur
    await sleep(120)
    await nextFrame()
  }
  return liveGame.model?.scene.uuid ?? ''
}

function countMeshes(): number {
  let n = 0
  liveGame.model?.scene.traverse((o) => {
    if (o instanceof Mesh) n++
  })
  return n
}

const results: Record<string, { uuid: string; meshes: number; scale: number }> = {}
const seenUuids = new Set<string>()

// First record default sora
const soraUuid = liveGame.model?.scene.uuid ?? ''
results.sora = { uuid: soraUuid, meshes: countMeshes(), scale: liveGame.model?.scene.scale.x ?? 0 }
if (soraUuid) seenUuids.add(soraUuid)

// Swap through kaze (Victoria VRM), aoi (Vivi VRM), ren (Automaton GLB)
for (const id of ['kaze', 'aoi', 'ren'] as HeroId[]) {
  const prev = liveGame.model?.scene.uuid ?? ''
  liveGame.setHero(id)
  const nextUuid = await waitForModelChange(prev)
  for (let i = 0; i < 4; i++) await nextFrame()
  const meshes = countMeshes()
  const scale = Math.round((liveGame.model?.scene.scale.x ?? 0) * 100) / 100
  results[id] = { uuid: nextUuid, meshes, scale }
  if (!nextUuid || nextUuid === prev) failures.push(`Hero ${id} did not load a new 3D model`)
  if (meshes < 1) failures.push(`Hero ${id} has 0 meshes`)
  seenUuids.add(nextUuid)
}

// Restore default sora
liveGame.setHero('sora')
await sleep(300)

out.heroes = results
out.distinctModelCount = seenUuids.size
if (seenUuids.size !== HEROES.length) {
  failures.push(`Expected ${HEROES.length} distinct 3D hero models, got ${seenUuids.size}`)
}

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-50-heroes-3d', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-50 FAILED: ${failures.join('; ')}`)
