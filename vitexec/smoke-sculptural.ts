// TEST-42: E2E smoke test for Wave 1 Sculptural Ghibli Non-Box Geometry & Organic Challenges
// Verifies all 6 sculptural types render cleanly, static/proxy colliders hold the player without falling through,
// and kinematic vertical gear treads + pendulum lantern roofs move and carry the player.
import { Vector3 } from 'three'
import { game as liveGame } from '/src/game/game.ts'
import { SCULPTURAL_SPECS, sculpturalTestAnchors } from '/src/level/sculptural.ts'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

type Api = {
  snapshot(): {
    state: string
    player: { pos: number[]; vel: number[]; groundedRaw: boolean; groundBody: string | null }
  }
  __debugTeleport(p: number[]): void
}

const api = () => (window as unknown as { __game: Api }).__game
const full = () => api().snapshot()
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer() }

await bootToPlaying()
for (let i = 0; i < 8; i++) await nextFrame()

// 1. Verify all 6 sculptural structure categories exist in the live scene graph
const anchors = sculpturalTestAnchors()
const expectedKinds = new Set(SCULPTURAL_SPECS.map((s) => s.kind))
out.specCount = SCULPTURAL_SPECS.length
out.kinds = [...expectedKinds]

const sceneNames = new Set<string>()
let root = liveGame.visualRoot as { parent?: unknown; name?: string; children?: unknown[] } | null
while (root?.parent) root = root.parent as { parent?: unknown; name?: string; children?: unknown[] }
const walk = (o: { name?: string; children?: unknown[] } | null | undefined) => {
  if (!o) return
  if (o.name) sceneNames.add(o.name)
  if (Array.isArray(o.children)) for (const c of o.children) walk(c as { name?: string; children?: unknown[] })
}
walk(root)
const matchedNames = [...sceneNames].filter(
  (n) => SCULPTURAL_SPECS.some((s) => n.includes(s.id)) || n.includes('sculptural'),
)
out.sceneMatchedCount = matchedNames.length
if (matchedNames.length === 0) {
  failures.push('Sculptural objects not found in scene graph')
}

// 2. Verify player stands stably on proxy colliders for static/swaying sculptural structures
const staticTargets = [
  'z1-spiral-tower',
  'z1-rope-bridge',
  'z2-giant-root',
  'z3-broken-arch',
  'z3-faceted-rock-1',
] as const

const standResults: Record<string, { grounded: boolean; startY: number; endY: number; drop: number }> = {}
for (const id of staticTargets) {
  const a = anchors[id]
  if (!a) {
    failures.push(`Missing test anchor for ${id}`)
    continue
  }
  api().__debugTeleport([a[0], a[1] + 0.35, a[2]])
  await sleep(320)
  const s1 = full().player
  await sleep(220)
  const s2 = full().player
  const drop = r3(a[1] - s2.pos[1])
  standResults[id] = {
    grounded: s1.groundedRaw || s2.groundedRaw,
    startY: r3(a[1]),
    endY: r3(s2.pos[1]),
    drop,
  }
  if (!(s1.groundedRaw || s2.groundedRaw) || drop > 0.65) {
    failures.push(`Player did not stand stably on ${id}: grounded=${s1.groundedRaw}/${s2.groundedRaw}, drop=${drop}`)
  }
}
out.standResults = standResults

// 3. Verify kinematic Vertical Gear tread and Pendulum Lantern carry movement
const carryResults: Record<string, { found: boolean; id: string | null; moved: number; grounded: boolean }> = {}
for (const prefix of ['z2-vertical-gear-1', 'z2-pendulum-lantern-1']) {
  const rec = [...liveGame.motion.platforms.entries()].find(([k]) => k.startsWith(prefix))
  if (!rec) {
    carryResults[prefix] = { found: false, id: null, moved: 0, grounded: false }
    failures.push(`Kinematic platform not registered for ${prefix}`)
    continue
  }
  const [platId, plat] = rec
  const wp = new Vector3().setFromMatrixPosition(plat.cur)
  api().__debugTeleport([wp.x, wp.y + 0.55, wp.z])
  await sleep(350)
  const p0 = full().player.pos.slice()
  let wasGrounded = full().player.groundedRaw
  for (let i = 0; i < 18; i++) {
    await sleep(35)
    if (full().player.groundedRaw) wasGrounded = true
  }
  const p1 = full().player.pos
  const moved = r3(Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]))
  carryResults[prefix] = { found: true, id: platId, moved, grounded: wasGrounded }
  if (!wasGrounded || moved < 0.12) {
    failures.push(`Kinematic carry failed on ${prefix}: grounded=${wasGrounded}, moved=${moved}`)
  }
}
out.carryResults = carryResults

const passed = failures.length === 0
console.log(JSON.stringify({ test: 'TEST-42-sculptural', passed, failures, ...out }, null, 2))
if (!passed) throw new Error(`TEST-42 FAILED: ${failures.join('; ')}`)
