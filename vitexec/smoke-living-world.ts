// TEST-49: E2E smoke test for Tahap 1 & 2 — Genshin Impact Rock Cliffs, Living World Artifacts & Character VFX
import { game as liveGame } from '/src/game/game.ts'
import { bootToPlaying, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 8; i++) await nextFrame()

// 1. Verify Living World scene root, wind grass, banners, Tōrō shrines, windmills, god rays, and character VFX
const scene = liveGame.visualRoot?.parent
if (!scene) {
  failures.push('Scene root not found')
} else {
  const living = scene.getObjectByName('living-world-genshin')
  const grass = scene.getObjectByName('wind-grass')
  const vfx = scene.getObjectByName('character-vfx')
  const toro = scene.getObjectByName('toro-plaza-e')
  const windmill = scene.getObjectByName('windmill-plaza')
  const godRay = scene.getObjectByName('god-ray-0')

  out.livingWorld = {
    livingFound: living != null,
    grassFound: grass != null,
    vfxFound: vfx != null,
    toroFound: toro != null,
    windmillFound: windmill != null,
    godRayFound: godRay != null,
  }
  if (!living) failures.push('living-world-genshin group missing')
  if (!grass) failures.push('wind-grass InstancedMesh missing')
  if (!vfx) failures.push('character-vfx group missing')
  if (!toro) failures.push('toro-plaza-e shrine missing')
  if (!windmill) failures.push('windmill-plaza missing')
  if (!godRay) failures.push('god-ray-0 missing')

  // 2. Verify zero urban 'facade' merged meshes remain and 'cliff' materials exist
  const mergedNames: string[] = []
  liveGame.visualRoot?.traverse((o) => {
    if (o.name.startsWith('merged:')) mergedNames.push(o.name)
  })
  const hasCliff = mergedNames.some((n) => n.includes('|cliff'))
  const hasFacade = mergedNames.some((n) => n.includes('|facade'))
  out.materials = { mergedCount: mergedNames.length, hasCliff, hasFacade }
  if (!hasCliff) failures.push('Expected cliff material in merged static meshes')
  if (hasFacade) failures.push('Found legacy urban facade material in merged static meshes')
}

await sleep(350)
const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-49-genshin-living-world', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-49 FAILED: ${failures.join('; ')}`)
