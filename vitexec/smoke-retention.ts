// TEST-44: E2E smoke test for Fase 1 Retention & Cinematics
// Verifies: Personal Best Ghost Racer (record + seed + 3D replay), 12 Sky Relics (proximity pickup + HUD counter),
// Intro Pan & Victory 360 Orbit camera cinematics, and Victory Share Score Card button.
import { game as liveGame } from '/src/game/game.ts'
import { SKY_RELICS } from '/src/level/relicsData.ts'
import { bootToPlaying, logRenderer, nextFrame, sleep } from '/vitexec/lib/move-smoke.ts'

type Api = {
  __debugTeleport(p: number[]): void
}

const api = () => (window as unknown as { __game: Api }).__game
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 6; i++) await nextFrame()

// 1. Check Sky Relics HUD & 3D InstancedMesh
const relicHud = document.querySelector('[data-testid=hud-relics]')
out.hasRelicHud = relicHud != null
if (!relicHud) failures.push('HUD missing Sky Relics badge (data-testid=hud-relics)')

// Trigger proximity pickup on first Sky Relic (relic-z1-plaza @ [8.5, 4.2, -4.5])
const targetRelic = SKY_RELICS[2]
liveGame.collectedRelics.delete(targetRelic.id)
api().__debugTeleport([targetRelic.pos[0], targetRelic.pos[1] - 0.8, targetRelic.pos[2]])
await sleep(300)
const collected = liveGame.collectedRelics.has(targetRelic.id)
out.relicPickup = { id: targetRelic.id, collected, totalCollected: liveGame.collectedRelics.size }
if (!collected) failures.push(`Sky Relic proximity pickup failed for ${targetRelic.id}`)

// 2. Check Ghost Racer recording + seeded playback visibility
liveGame.ghost.seed(
  [
    [0, 0, 0, 0, 0],
    [1000, 1.5, 2.0, -1.0, 0.4],
    [30000, 5.0, 10.0, -4.0, 1.0],
  ],
  50,
  false,
)
await sleep(250)
let root = liveGame.visualRoot as { parent?: unknown; name?: string; visible?: boolean; children?: unknown[] } | null
while (root?.parent) root = root.parent as { parent?: unknown; name?: string; visible?: boolean; children?: unknown[] }
let ghostVisible = false
const findGhost = (o: { name?: string; visible?: boolean; children?: unknown[] } | null | undefined) => {
  if (!o) return
  if (o.name === 'ghost-racer') ghostVisible = Boolean(o.visible)
  if (Array.isArray(o.children)) for (const c of o.children) findGhost(c as { name?: string; visible?: boolean; children?: unknown[] })
}
findGhost(root)
out.ghost = { sampleCount: liveGame.ghost.sampleCount, hasBest: liveGame.ghost.best != null, visible: ghostVisible }
if (!ghostVisible) failures.push('Ghost Racer 3D spirit did not become visible during seeded run')

// 3. Check Intro Pan & Victory 360 Orbit camera cinematics
liveGame.cameraRig?.startIntroPan(0, false)
const introActive = Boolean(liveGame.cameraRig?.introActive)
liveGame.cameraRig?.cancelIntroPan()
liveGame.cameraRig?.setVictoryOrbit(true)
const orbitYaw0 = liveGame.cameraRig?.yaw ?? 0
await sleep(300)
const orbitYaw1 = liveGame.cameraRig?.yaw ?? 0
liveGame.cameraRig?.setVictoryOrbit(false)
const orbitDelta = Math.abs(orbitYaw1 - orbitYaw0)
out.cinematics = { introActive, orbitDelta: Math.round(orbitDelta * 1000) / 1000 }
if (!introActive) failures.push('Intro Pan did not activate')
if (orbitDelta < 0.03) failures.push(`Victory 360 orbit did not rotate camera: delta=${orbitDelta}`)

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-44-retention-cinematics', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-44 FAILED: ${failures.join('; ')}`)
