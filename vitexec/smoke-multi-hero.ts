// TEST-50: E2E smoke test for Fase 6 Gelombang B — 4 Distinct Real 3D Hero Models (3 VRMs + 1 Mannequin Automaton)
import { game as liveGame } from '/src/game/game.ts'
import type { HeroId } from '/src/character/heroes.ts'
import { bootToPlaying, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 6; i++) await nextFrame()

async function waitForModelChange(prevUuid: string, timeoutMs = 10000): Promise<string> {
  const start = performance.now()
  while (performance.now() - start < timeoutMs) {
    const cur = liveGame.model?.scene.uuid ?? ''
    if (cur && cur !== prevUuid) return cur
    await sleep(100)
  }
  return liveGame.model?.scene.uuid ?? ''
}

const order: HeroId[] = ['sora', 'kaze', 'aoi', 'ren']
const loaded: Record<string, { uuid: string; scale: number; meshes: number }> = {}
const seenUuids = new Set<string>()

let prevUuid = ''
for (const hero of order) {
  liveGame.setHero(hero)
  const uuid = hero === 'sora' ? (liveGame.model?.scene.uuid ?? '') : await waitForModelChange(prevUuid)
  for (let i = 0; i < 4; i++) await nextFrame()
  let meshes = 0
  liveGame.model?.scene.traverse((o) => {
    if ((o as { isMesh?: boolean }).isMesh) meshes++
  })
  const scale = Math.round((liveGame.model?.scene.scale.x ?? 0) * 100) / 100
  loaded[hero] = { uuid, scale, meshes }
  if (!uuid) failures.push(`Hero ${hero} failed to load a 3D model`)
  else seenUuids.add(uuid)
  if (meshes < 1) failures.push(`Hero ${hero} has 0 meshes`)
  if (hero === 'aoi' && Math.abs(scale - 1.12) > 0.02) failures.push(`Hero aoi expected scale 1.12, got ${scale}`)
  prevUuid = uuid
}

if (seenUuids.size !== 4) {
  failures.push(`Expected 4 distinct 3D model UUIDs across sora/kaze/aoi/ren, got ${seenUuids.size}`)
}

// Restore default sora
liveGame.setHero('sora')
await waitForModelChange(prevUuid)

out.heroes = loaded
out.distinctModels = seenUuids.size
const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-50-multi-hero-3d', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-50 FAILED: ${failures.join('; ')}`)
