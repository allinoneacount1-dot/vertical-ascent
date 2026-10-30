// One-off G3 probe (ref/06 §Probe): the 500 m world 'main' loads — world ready, BVH bake times and collision
// triangles, render info at the spawn, fake/real summit numbers, frame times over 3 s. Not TEST evidence.
import { bootToPlaying, logRenderer, sleep } from '/vitexec/lib/move-smoke.ts'

type Snap = {
  level: string
  state: string
  worldReady: boolean
  hud: { targetM: number }
  summit: unknown
  bvh: { buildMs: Record<string, number>; tris: Record<string, number> }
  render: { calls: number; triangles: number; geometries: number; textures: number; programs: number }
  camera: { yaw: number; pitch: number }
  player: { pos: number[] }
  events: Array<{ type: string; data?: unknown }>
}
const snap = () => (window as unknown as { __game: { snapshot(): Snap } }).__game.snapshot()

logRenderer()
const t0 = performance.now()
await bootToPlaying()
const s = snap()
const sum = (r: Record<string, number>) => Math.round(Object.values(r).reduce((a, b) => a + b, 0) * 10) / 10
console.log('load ' + JSON.stringify({ level: s.level, state: s.state, msToPlaying: Math.round(performance.now() - t0), bakeMs: sum(s.bvh.buildMs), tris: sum(s.bvh.tris), worlds: s.bvh.buildMs }))
const frames: number[] = []
let last = performance.now()
const end = last + 3000
await new Promise<void>((resolve) => {
  const tick = (now: number) => {
    frames.push(now - last)
    last = now
    if (now < end) requestAnimationFrame(tick)
    else resolve()
  }
  requestAnimationFrame(tick)
})
frames.sort((a, b) => a - b)
const q = (p: number) => Math.round(frames[Math.min(frames.length - 1, Math.floor(p * frames.length))] * 10) / 10
await sleep(200)
const s2 = snap()
console.log('spawn ' + JSON.stringify({ render: s2.render, hudTarget: s2.hud.targetM, summit: s2.summit, camera: s2.camera, pos: s2.player.pos, p50: q(0.5), p95: q(0.95), p99: q(0.99), frames: frames.length }))
console.log('events ' + JSON.stringify(s2.events.filter((e) => e.type === 'mergedStatics' || e.type === 'beacon')))
