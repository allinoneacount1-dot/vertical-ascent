// TEST-38 noisy bot (ref/06 §Noisy bot, DIAGNOSTIC): the route bot of vitexec/lib/route-bot.ts with seeded human error
// (reaction ~180 ±40 ms before timed jumps, yaw jitter, takeoff point early/late, double-jump press delay), no retry,
// continuing from wherever it lands. Each seed starts at the zone entrance via __debugTeleport (allowed only in this
// script, ref/02 §window.__game); a fall below the zone entrance or off the route ends that seed.
// URL (vitexec --path): ?zone=z1..z4&seeds=1,2,3,4,5[&noise=0] — noise=0 runs the same loop without error (bot check).
// Output line "noisy {json}": per-jump attempts/fails, per-seed outcome and time.
import { createBot, snap } from '/vitexec/lib/route-bot.ts'
import type { Noise, Route } from '/vitexec/lib/route-bot.ts'
import { bootToPlaying, logRenderer, r3, sleep } from '/vitexec/lib/move-smoke.ts'
import { loadLevel } from '/src/level/levels.ts'
import mainRoute from '/vitexec/routes/main.json'

const q = new URLSearchParams(location.search)
const zone = q.get('zone') ?? 'z1'
const seeds = (q.get('seeds') ?? '1,2,3,4,5').split(',').map(Number)
const withNoise = q.get('noise') !== '0'
const SEED_LIMIT_MS = Number(q.get('limitS') ?? 900) * 1000

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function makeNoise(seed: number): Noise {
  const u = mulberry32(seed * 7919 + 17)
  const gauss = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u())
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  return {
    next: u,
    reactionMs: () => clamp(180 + 40 * gauss(), 80, 320),
    yawJitter: () => clamp(0.03 * gauss(), -0.09, 0.09),
    takeoffShiftM: () => clamp(0.12 * gauss(), -0.4, 0.3),
    doubleJumpDelayMs: () => clamp(Math.abs(60 * gauss()), 0, 150),
  }
}

type Debug = { __debugTeleport(p: [number, number, number]): void }
const teleport = (p: [number, number, number]) => (window as unknown as { __game: Debug }).__game.__debugTeleport(p)

logRenderer()
const canvas = await bootToPlaying()
const route = mainRoute as unknown as Route
const level = loadLevel('main')
const wps = route.waypoints
const start = wps.findIndex((w) => w.zone === zone)
let end = wps.length
for (let j = start; j < wps.length; j++) if (wps[j].zone !== zone) {
  end = j
  break
}
if (start < 0) throw new Error(`no waypoints in zone ${zone}`)
console.log('noisy-setup ' + JSON.stringify({ diagnostic: true, zone, seeds, withNoise, first: wps[start].id, last: wps[end - 1].id, jumps: end - start }))

const perJump = new Map<string, { attempts: number; fails: number }>()
const runs: Array<Record<string, unknown>> = []
for (const seed of seeds) {
  const bot = createBot(route, level.data.platforms, canvas, withNoise ? makeNoise(seed) : null)
  // zone entrance: the spawn for z1, otherwise the last pad of the zone below
  const from = start === 0 ? ([0, 0.05, 0] as [number, number, number]) : ([wps[start - 1].target[0], wps[start - 1].target[1] + 0.05, wps[start - 1].target[2]] as [number, number, number])
  teleport(from)
  await sleep(600)
  const t0 = performance.now()
  let i = start
  let fails = 0
  let outcome = 'completed'
  let lostM = 0
  while (i < end) {
    if (performance.now() - t0 > SEED_LIMIT_MS) {
      outcome = 'time-limit'
      break
    }
    const wp = wps[i]
    const stat = perJump.get(wp.id) ?? { attempts: 0, fails: 0 }
    perJump.set(wp.id, stat)
    stat.attempts++
    const yBefore = snap().player.pos[1]
    let ok = false
    try {
      ok = await bot.attempt(i)
    } catch (e) {
      outcome = `stuck: ${(e as Error).message}`
      break
    }
    if (ok) {
      i++
      continue
    }
    stat.fails++
    fails++
    await sleep(300)
    lostM += Math.max(0, yBefore - snap().player.pos[1])
    const k = bot.standingIndex()
    console.log(`[noisy ${zone} s${seed}] missed ${wp.id}, standing on ${k >= 0 ? wps[k].id : 'off-route'}`)
    if (k < start - 1) {
      outcome = k < 0 ? 'off-route' : `below-zone (${wps[k].id})`
      break
    }
    i = k + 1
  }
  await bot.setW(false)
  runs.push({ seed, outcome, timeS: r3((performance.now() - t0) / 1000), fails, lostM: r3(lostM), reached: wps[Math.min(i, end) - 1]?.id ?? null })
  console.log(`[noisy ${zone} s${seed}] ${JSON.stringify(runs[runs.length - 1])}`)
}
const jumps = [...perJump.entries()].map(([id, s]) => ({ id, attempts: s.attempts, fails: s.fails, failRate: r3(s.fails / s.attempts) }))
const completed = runs.filter((r) => r.outcome === 'completed').map((r) => r.timeS as number).sort((a, b) => a - b)
const median = completed.length ? completed[Math.floor(completed.length / 2)] : null
console.log('noisy ' + JSON.stringify({ diagnostic: true, zone, withNoise, seeds, medianZoneTimeS: median, runs, worst: [...jumps].sort((a, b) => b.failRate - a.failRate).slice(0, 10), jumps }))
