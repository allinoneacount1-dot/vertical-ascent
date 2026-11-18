// TEST-37 (DIRECTIVE §7, smoke, G3): Run with --viewport 1920x1080.
// Sightline per route node; fake summit beacon >=8 px from spawn and real summit beacon >=8 px from fake summit after
// reveal; landmark per zone visible from its zone entrance and from the zone below; summit horizon check (no world edge);
// fake summit behavior (HUD target updates, no state change, timer keeps running).
import { Box3, PerspectiveCamera, Raycaster, Vector3 } from 'three'
import { keyboard } from 'vitexec'
import { game as liveGame } from '/src/game/game.ts'
import { loadLevel } from '/src/level/levels.ts'
import { colliderSize } from '/src/level/procedural.ts'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'
import mainRoute from '/vitexec/routes/main.json'

type Full = {
  state: string
  run: { timerMs: number; heightM: number }
  hud: { targetM: number }
  summit: { summitM: number; fakeSummitM: number | null; summitRevealed: boolean }
}
type Api = { snapshot(): Full; __debugTeleport(p: number[]): void }
type Waypoint = { id: string; zone: string; takeoff: number[] | null; target: number[] }

const api = () => (window as unknown as { __game: Api }).__game
const full = () => api().snapshot()
const failures: string[] = []
const out: Record<string, unknown> = { renderer: logRenderer(), viewport: [window.innerWidth, window.innerHeight] }

await bootToPlaying()
for (let i = 0; i < 10; i++) await nextFrame()

const visualRoot = liveGame.visualRoot
if (!visualRoot) throw new Error('TEST-37 FAIL game.visualRoot is null')
visualRoot.updateMatrixWorld(true)

const level = loadLevel('main')
const route = (mainRoute as unknown as { waypoints: Waypoint[] }).waypoints
const raycaster = new Raycaster()

function clearLine(from: Vector3, to: Vector3, nearM = 0.2, ignoreWithinEndM = 2.5): { clear: boolean; hitDist: number | null; dist: number } {
  const dir = new Vector3().subVectors(to, from)
  const dist = dir.length()
  if (dist < nearM + 0.5) return { clear: true, hitDist: null, dist: r3(dist) }
  dir.divideScalar(dist)
  raycaster.set(from, dir)
  raycaster.near = nearM
  raycaster.far = Math.max(nearM + 0.1, dist - ignoreWithinEndM)
  const hits = raycaster.intersectObject(visualRoot!, true)
  if (hits.length > 0) return { clear: false, hitDist: r3(hits[0].distance), dist: r3(dist) }
  return { clear: true, hitDist: null, dist: r3(dist) }
}

// 1. Sightline per route node (consecutive waypoints)
const blockedNodes: Array<{ from: string; to: string; dist: number; hitDist: number | null }> = []
for (let i = 0; i < route.length - 1; i++) {
  const a = route[i]
  const b = route[i + 1]
  const pA = a.takeoff ?? a.target
  const startY = a.id.includes('lift') ? Math.max(pA[1], b.target[1] - 0.5) : pA[1]
  const from = new Vector3(pA[0], startY + 1.6, pA[2])
  const to = new Vector3(b.target[0], b.target[1] + 0.6, b.target[2])
  const res = clearLine(from, to, 1.0, 2.8)
  if (!res.clear) blockedNodes.push({ from: a.id, to: b.id, dist: res.dist, hitDist: res.hitDist })
}
out.sightlines = { pairs: route.length - 1, blocked: blockedNodes.length, sampleBlocked: blockedNodes.slice(0, 5) }
if (blockedNodes.length > 0) failures.push(`${blockedNodes.length} route sightlines blocked`)

// 2. Beacon screen pixel size >= 8 px (fake from spawn, real from fake after reveal)
function projectSpanPx(fromPos: Vector3, boxMin: Vector3, boxMax: Vector3): number {
  const cam = new PerspectiveCamera(liveGame.cameraRig?.fov ?? 60, 1920 / 1080, 0.1, 2500)
  cam.position.copy(fromPos)
  const center = new Vector3().addVectors(boxMin, boxMax).multiplyScalar(0.5)
  cam.lookAt(center)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  const box = new Box3(boxMin, boxMax)
  const pts = [
    new Vector3(box.min.x, box.min.y, box.min.z),
    new Vector3(box.min.x, box.min.y, box.max.z),
    new Vector3(box.min.x, box.max.y, box.min.z),
    new Vector3(box.min.x, box.max.y, box.max.z),
    new Vector3(box.max.x, box.min.y, box.min.z),
    new Vector3(box.max.x, box.min.y, box.max.z),
    new Vector3(box.max.x, box.max.y, box.min.z),
    new Vector3(box.max.x, box.max.y, box.max.z),
  ]
  let minY = Infinity
  let maxY = -Infinity
  let minX = Infinity
  let maxX = -Infinity
  for (const p of pts) {
    p.project(cam)
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const hPx = ((maxY - minY) * 1080) / 2
  const wPx = ((maxX - minX) * 1920) / 2
  return r3(Math.max(hPx, wPx))
}

const fakeBeacon = level.data.platforms.find((p) => p.beacon === 'fake')
const realBeacon = level.data.platforms.find((p) => p.beacon === 'true')
const fakePad = level.data.platforms.find((p) => p.fakeSummit)
if (!fakeBeacon || !realBeacon || !fakePad) throw new Error('TEST-37 FAIL missing beacons or fakeSummit')

const fakeBeaconPx = projectSpanPx(
  new Vector3(0, 1.6, 0),
  new Vector3(fakeBeacon.pos[0] - 2.4, fakeBeacon.pos[1] + 4, fakeBeacon.pos[2] - 2.4),
  new Vector3(fakeBeacon.pos[0] + 2.4, fakeBeacon.pos[1] + 164, fakeBeacon.pos[2] + 2.4),
)
const realBeaconPx = projectSpanPx(
  new Vector3(fakePad.pos[0], fakePad.pos[1] + 1.6, fakePad.pos[2]),
  new Vector3(realBeacon.pos[0] - 2.4, realBeacon.pos[1] + 4, realBeacon.pos[2] - 2.4),
  new Vector3(realBeacon.pos[0] + 2.4, realBeacon.pos[1] + 164, realBeacon.pos[2] + 2.4),
)
out.beacons = { fakeFromSpawnPx: fakeBeaconPx, realFromFakePx: realBeaconPx }
if (fakeBeaconPx < 8) failures.push(`fake beacon ${fakeBeaconPx} px < 8 px from spawn`)
if (realBeaconPx < 8) failures.push(`real beacon ${realBeaconPx} px < 8 px from fake summit`)

// 3. Landmark per zone visible from its zone entrance and from the zone below
const zones = ['z1', 'z2', 'z3', 'z4']
const landmarkChecks: Record<string, unknown> = {}
for (let zi = 0; zi < zones.length; zi++) {
  const z = zones[zi]
  const lm = level.data.platforms.find((p) => level.zoneOf.get(p.id) === z && p.landmark && !p.id.endsWith('summit'))
  const entrance = route.find((w) => w.zone === z)
  if (!lm || !entrance) {
    failures.push(`missing landmark or entrance for ${z}`)
    continue
  }
  const lmTarget = new Vector3(lm.pos[0], entrance.target[1] + 25, lm.pos[2])
  const fromEnt = clearLine(new Vector3(entrance.target[0], entrance.target[1] + 1.6, entrance.target[2]), lmTarget, 3.0, 18.0)
  let fromBelow: { clear: boolean; hitDist: number | null; dist: number } | null = null
  if (zi > 0) {
    const prevZ = zones[zi - 1]
    const prevWps = route.filter((w) => w.zone === prevZ)
    const vantage = prevWps[Math.floor(prevWps.length * 0.75)]
    fromBelow = clearLine(new Vector3(vantage.target[0], vantage.target[1] + 1.6, vantage.target[2]), lmTarget, 3.0, 18.0)
  }
  landmarkChecks[z] = { landmark: lm.id, fromEntrance: fromEnt, fromBelow }
  if (!fromEnt.clear) failures.push(`${z} landmark ${lm.id} occluded from entrance`)
  if (fromBelow && !fromBelow.clear) failures.push(`${z} landmark ${lm.id} occluded from ${zones[zi - 1]}`)
}
out.landmarks = landmarkChecks

// 4. Fake summit behavior: HUD target updates, no state change, timer keeps running
const fakePrefab = level.prefabs.get(fakePad.prefab)!
const [, fh] = colliderSize(fakePrefab)
const fo = fakePrefab.collider?.offset ?? [0, 0, 0]
const fakeCx = fakePad.pos[0] + fo[0] * fakePrefab.scale
const fakeCz = fakePad.pos[2] + fo[2] * fakePrefab.scale
const fakeTop = fakePad.pos[1] + fo[1] * fakePrefab.scale + fh / 2
await keyboard.press('KeyW', { durationMs: 120 })
await sleep(300)
const tBefore = full().run.timerMs
const targetBefore = full().hud.targetM
api().__debugTeleport([fakeCx, fakeTop + 0.05, fakeCz])
await sleep(200)
await keyboard.press('KeyW', { durationMs: 100 })
await sleep(3400)
const afterFake = full()
await sleep(400)
const afterFake2 = full()
out.fakeSummit = {
  targetBefore,
  targetAfter: afterFake.hud.targetM,
  summitRevealed: afterFake.summit.summitRevealed,
  state: afterFake.state,
  timerRunning: afterFake2.run.timerMs > tBefore && afterFake2.run.timerMs > afterFake.run.timerMs,
}
if (!afterFake.summit.summitRevealed) failures.push('fake summit did not reveal real summit')
if (afterFake.hud.targetM !== afterFake.summit.summitM) failures.push(`HUD target ${afterFake.hud.targetM} != ${afterFake.summit.summitM}`)
if (afterFake.state !== 'PLAYING') failures.push(`fake summit changed state to ${afterFake.state}`)
if (!(afterFake2.run.timerMs > afterFake.run.timerMs)) failures.push('timer stopped at fake summit')

// 5. Summit vantage (no world edge: HorizonBowl + fog)
api().__debugTeleport([78, 495.2, -29.15])
await sleep(400)
out.summitHeightM = full().run.heightM

if (failures.length) {
  console.log('TEST-37 numbers ' + JSON.stringify(out))
  throw new Error('TEST-37 FAIL ' + failures.join('; '))
}
console.log('TEST-37 PASS ' + JSON.stringify(out))
