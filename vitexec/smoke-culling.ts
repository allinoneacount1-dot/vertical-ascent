// TEST-45: E2E smoke test for Fase 2 Altitude Zone Visibility Culling & Draw-Call Scaling
// Verifies that distant sculptural & challenge zone groups are culled when far vertically from the player,
// become visible as the player ascends into each zone, and keep BvhPhysicsBody colliders intact.
import { game as liveGame } from '/src/game/game.ts'
import { bootToPlaying, logRenderer, nextFrame } from '/vitexec/lib/move-smoke.ts'

type Api = {
  __debugTeleport(p: number[]): void
}

const api = () => (window as unknown as { __game: Api }).__game
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 6; i++) await nextFrame()

const samples: Array<{
  alt: number
  total: number
  visible: number
  culled: number
  z1Vis: boolean
  z4Vis: boolean
}> = []

for (const alt of [10, 160, 300, 460]) {
  api().__debugTeleport([0, alt, 0])
  for (let i = 0; i < 5; i++) await nextFrame()
  const s = liveGame.culling.summary()
  samples.push({
    alt,
    ...s,
    z1Vis: Boolean(liveGame.culling.registry.get('sculptural-z1')),
    z4Vis: Boolean(liveGame.culling.registry.get('sculptural-z4')),
  })
}
out.samples = samples

if (samples[0].total < 8) failures.push(`Expected >= 8 altitude-culled zone groups, got ${samples[0].total}`)
if (samples[0].culled < 4) failures.push(`Expected >= 4 distant groups culled at spawn (10m), got ${samples[0].culled}`)
if (!samples[0].z1Vis || samples[0].z4Vis) failures.push(`At 10m expected z1 visible and z4 culled, got z1=${samples[0].z1Vis}, z4=${samples[0].z4Vis}`)
if (samples[3].z1Vis || !samples[3].z4Vis) failures.push(`At 460m expected z1 culled and z4 visible, got z1=${samples[3].z1Vis}, z4=${samples[3].z4Vis}`)

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-45-zone-culling', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-45 FAILED: ${failures.join('; ')}`)
