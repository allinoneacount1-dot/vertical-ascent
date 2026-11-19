// TEST-49: E2E smoke test for Fase 6 Gelombang A (Living Ghibli World, Artifacts, God Rays, Windmills & CharacterJuice)
import { game as liveGame } from '/src/game/game.ts'
import { bootToPlaying, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 8; i++) await nextFrame()

// Traverse live Three.js scene via visualRoot's parent (the Scene)
const scene = liveGame.visualRoot?.parent
if (!scene) {
  failures.push('Scene root not found via liveGame.visualRoot.parent')
} else {
  const living = scene.getObjectByName('living-world')
  const juice = scene.getObjectByName('character-juice')
  const grass = scene.getObjectByName('living-grass') as { count?: number } | undefined
  const altars = scene.getObjectByName('relic-altars') as { count?: number } | undefined
  const godrays = scene.getObjectByName('living-godrays')
  const cumulus = scene.getObjectByName('living-cumulus') as { count?: number } | undefined
  const shrineStart = scene.getObjectByName('toro-start-e')
  const windmillPlaza = scene.getObjectByName('windmill-plaza')
  const bannerStart = scene.getObjectByName('banner-start-1')

  // Check windmill rotor actually rotates over 400 ms
  const rotorBefore = windmillPlaza?.children?.[2]?.rotation?.z ?? 0
  await sleep(400)
  for (let i = 0; i < 4; i++) await nextFrame()
  const rotorAfter = windmillPlaza?.children?.[2]?.rotation?.z ?? 0
  const rotorDelta = Math.abs(rotorAfter - rotorBefore)

  out.livingWorld = {
    mounted: Boolean(living),
    characterJuiceMounted: Boolean(juice),
    grassCount: grass?.count ?? 0,
    altarCount: altars?.count ?? 0,
    godRayCount: godrays?.children?.length ?? 0,
    cumulusCount: cumulus?.count ?? 0,
    hasShrine: Boolean(shrineStart),
    hasWindmill: Boolean(windmillPlaza),
    hasBanner: Boolean(bannerStart),
    windmillRotorDeltaRad: Math.round(rotorDelta * 1000) / 1000,
  }

  if (!living) failures.push('living-world group missing')
  if (!juice) failures.push('character-juice group missing')
  if ((grass?.count ?? 0) < 500) failures.push(`Expected >=500 instanced grass blades, got ${grass?.count ?? 0}`)
  if ((altars?.count ?? 0) !== 12) failures.push(`Expected 12 relic altars, got ${altars?.count ?? 0}`)
  if ((godrays?.children?.length ?? 0) < 4) failures.push(`Expected >=4 god rays, got ${godrays?.children?.length ?? 0}`)
  if ((cumulus?.count ?? 0) < 20) failures.push(`Expected >=20 cumulus puffs, got ${cumulus?.count ?? 0}`)
  if (!shrineStart) failures.push('toro-start-e shrine missing')
  if (!bannerStart) failures.push('banner-start-1 banner missing')
  if (rotorDelta < 0.05) failures.push(`Windmill rotor did not spin: delta=${rotorDelta}`)
}

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-49-living-world', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-49 FAILED: ${failures.join('; ')}`)
