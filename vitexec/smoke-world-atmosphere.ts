// TEST-43: E2E smoke test for Wave 2 Living Ghibli Arena, Cloud Sea, Altitude Atmosphere & Vertical Elevation Map
// Verifies WorldVista, CloudSea, StarDome, 4-zone fog/sky color transitions, Vertical Elevation HUD, and V Vista Look.
import { game as liveGame } from '/src/game/game.ts'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Api = {
  snapshot(): {
    state: string
    player: { pos: number[]; groundedRaw: boolean }
  }
  __debugTeleport(p: number[]): void
}

const api = () => (window as unknown as { __game: Api }).__game
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 8; i++) await nextFrame()

// 1. Check Vertical Elevation Map HUD exists
const elevEl = document.querySelector('[data-testid=hud-elevation-map]')
out.hasElevationMap = elevEl != null
if (!elevEl) failures.push('HUD missing vertical elevation map (data-testid=hud-elevation-map)')

// 2. Check WorldVista & CloudSea scene objects exist
const names = new Set<string>()
const walk = (o: { name?: string; children?: unknown[] } | null | undefined) => {
  if (!o) return
  if (o.name) names.add(o.name)
  if (Array.isArray(o.children)) for (const c of o.children) walk(c as { name?: string; children?: unknown[] })
}
// Walk from scene root via playerRoot/visualRoot parent chain
let root = liveGame.visualRoot as { parent?: unknown; name?: string; children?: unknown[] } | null
while (root?.parent) root = root.parent as { parent?: unknown; name?: string; children?: unknown[] }
walk(root)

const hasCloudSea = names.has('cloud-sea-system')
const hasStarDome = names.has('star-dome')
const hasVista = [...names].some((n) => n.includes('world-vista') || n.includes('island-east-z2'))
out.sceneObjects = { hasCloudSea, hasStarDome, hasVista }
if (!hasCloudSea) failures.push('cloud-sea-system not mounted in scene')
if (!hasStarDome) failures.push('star-dome not mounted in scene')
if (!hasVista) failures.push('WorldVista / distant islands not mounted in scene')

// 3. Verify 4-zone atmosphere transitions (fogHex, skyTopHex, starOpacity, zone)
const samples: Array<{ alt: number; zone: string; fogHex: string; skyTopHex: string; starOpacity: number }> = []
for (const alt of [10, 145, 285, 440]) {
  api().__debugTeleport([0, alt, 0])
  for (let i = 0; i < 5; i++) await nextFrame()
  samples.push({
    alt,
    zone: liveGame.atmosphere.zone,
    fogHex: liveGame.atmosphere.fogHex,
    skyTopHex: liveGame.atmosphere.skyTopHex,
    starOpacity: liveGame.atmosphere.starOpacity,
  })
}
out.atmosphereSamples = samples
const uniqueFog = new Set(samples.map((s) => s.fogHex)).size
const uniqueSky = new Set(samples.map((s) => s.skyTopHex)).size
if (uniqueFog < 4) failures.push(`Expected 4 distinct fog colors across zones, got ${uniqueFog}`)
if (uniqueSky < 4) failures.push(`Expected 4 distinct sky top colors across zones, got ${uniqueSky}`)
if (samples[0].starOpacity > 0.05 || samples[3].starOpacity < 0.7) {
  failures.push(`Star dome opacity did not fade in properly: z1=${samples[0].starOpacity}, z4=${samples[3].starOpacity}`)
}

// 4. Verify Vista Look (V key / triggerVistaLook) when stationary on spawn ground
api().__debugTeleport([0, 0.1, 0])
await sleep(300)
const yawBefore = r3(liveGame.cameraRig?.yaw ?? 0)
const triggered = liveGame.triggerVistaLook()
const activeRightAfter = Boolean(liveGame.cameraRig?.vistaActive)
await sleep(250)
liveGame.cameraRig?.cancelVistaLook()
const activeAfterCancel = Boolean(liveGame.cameraRig?.vistaActive)
out.vistaLook = { yawBefore, triggered, activeRightAfter, activeAfterCancel }
if (!triggered || !activeRightAfter || activeAfterCancel) {
  failures.push(`Vista Look failed: triggered=${triggered}, active=${activeRightAfter}, afterCancel=${activeAfterCancel}`)
}

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-43-world-atmosphere', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-43 FAILED: ${failures.join('; ')}`)
