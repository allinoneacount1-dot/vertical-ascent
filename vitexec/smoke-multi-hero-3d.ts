// TEST-50: E2E smoke test for Fase 6 Gelombang B — 4 Real 3D Hero Models (Sora/Kaze/Aoi VRM + Ren Automaton Mannequin)
import { game as liveGame } from '/src/game/game.ts'
import type { HeroId } from '/src/character/heroes.ts'
import { bootToPlaying, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 6; i++) await nextFrame()

async function waitForNewModel(prevUuid: string, timeoutMs = 15000): Promise<string> {
  const t0 = performance.now()
  while (performance.now() - t0 < timeoutMs) {
    await nextFrame()
    const uuid = liveGame.model?.scene.uuid ?? ''
    if (uuid && uuid !== prevUuid) return uuid
    await sleep(60)
  }
  return liveGame.model?.scene.uuid ?? ''
}

const results: Array<{ hero: HeroId; uuid: string; url: string; scale: number }> = []
const seenUuids = new Set<string>()

// Record default sora
const soraUuid = liveGame.model?.scene.uuid ?? ''
const gApi = (window as unknown as { __game: { hero?: { id: string; modelUrl: string } } }).__game
results.push({ hero: 'sora', uuid: soraUuid, url: gApi.hero?.modelUrl ?? '', scale: liveGame.model?.scene.scale.x ?? 0 })
if (soraUuid) seenUuids.add(soraUuid)

// Switch across all 3 new real 3D models: kaze (protagonist-g.vrm), aoi (protagonist-e.vrm), ren (mannequin-f.glb)
const targets: Array<{ id: HeroId; expectedFile: string; expectedScale: number }> = [
  { id: 'kaze', expectedFile: 'protagonist-g.vrm', expectedScale: 1 },
  { id: 'aoi', expectedFile: 'protagonist-e.vrm', expectedScale: 1.12 },
  { id: 'ren', expectedFile: 'mannequin-f.glb', expectedScale: 1 },
]

let lastUuid = soraUuid
for (const t of targets) {
  liveGame.setHero(t.id)
  const nextUuid = await waitForNewModel(lastUuid)
  await sleep(120)
  const url = gApi.hero?.modelUrl ?? ''
  const scale = Math.round((liveGame.model?.scene.scale.x ?? 0) * 100) / 100
  results.push({ hero: t.id, uuid: nextUuid, url, scale })
  if (!nextUuid || nextUuid === lastUuid) failures.push(`Hero ${t.id} did not load a new 3D model`)
  if (!url.includes(t.expectedFile)) failures.push(`Hero ${t.id} URL mismatch: expected ${t.expectedFile}, got ${url}`)
  if (Math.abs(scale - t.expectedScale) > 0.02) failures.push(`Hero ${t.id} scale mismatch: expected ${t.expectedScale}, got ${scale}`)
  if (nextUuid) seenUuids.add(nextUuid)
  lastUuid = nextUuid
}

// Restore default sora
liveGame.setHero('sora')
await waitForNewModel(lastUuid)

out.heroes = results
out.uniqueModelsLoaded = seenUuids.size
if (seenUuids.size < 4) failures.push(`Expected 4 distinct 3D models, got ${seenUuids.size}`)

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-50-multi-hero-3d', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-50 FAILED: ${failures.join('; ')}`)
