#!/usr/bin/env node
// Strict physics-based BFS reachability audit from Z4 summit ([78, 500, -6.7]) to 1000 m Celestial Throne.
import { readFileSync } from 'node:fs'

const src = readFileSync('src/level/odyssey.ts', 'utf8')
const platBlock = src.slice(src.indexOf('export const ODYSSEY_PLATFORMS'), src.indexOf('export const ODYSSEY_UPDRAFS'))
const updraftBlock = src.slice(src.indexOf('export const ODYSSEY_UPDRAFS'), src.indexOf('export const ODYSSEY_MOVERS'))
const moverBlock = src.slice(src.indexOf('export const ODYSSEY_MOVERS'))

const platforms = [
  { id: 'z4-summit', zone: 'z4', pos: [78, 500, -6.7], size: [4.0, 1.0, 4.0] },
  ...[...platBlock.matchAll(/id:\s*'([^']+)',\s*zone:\s*'(z[5-8])'.*?pos:\s*\[([^\]]+)\],\s*size:\s*\[([^\]]+)\]/g)].map((m) => ({
    id: m[1],
    zone: m[2],
    pos: m[3].split(',').map((n) => Number(n.trim())),
    size: m[4].split(',').map((n) => Number(n.trim())),
  })),
]

const updrafts = [
  ...updraftBlock.matchAll(/id:\s*'([^']+)',\s*zone:\s*'(z[5-8])',\s*pos:\s*\[([^\]]+)\],\s*radius:\s*([\d.]+),\s*height:\s*([\d.]+)/g),
].map((m) => ({
  id: m[1],
  zone: m[2],
  pos: m[3].split(',').map((n) => Number(n.trim())),
  radius: Number(m[4]),
  height: Number(m[5]),
}))

const movers = []
for (const m of moverBlock.matchAll(/id:\s*'([^']+)',[\s\S]*?zone:\s*'(z[68])'[\s\S]*?basePos:\s*\[([^\]]+)\][\s\S]*?size:\s*\[([^\]]+)\][\s\S]*?type:\s*'(linear|orbit)'([\s\S]*?)(?=\n  \{|\n\])/g)) {
  const id = m[1]
  const zone = m[2]
  const basePos = m[3].split(',').map((n) => Number(n.trim()))
  const size = m[4].split(',').map((n) => Number(n.trim()))
  const type = m[5]
  const body = m[6]
  const samples = []
  if (type === 'linear') {
    const pts = [...body.matchAll(/\[(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\]/g)].map((p) => p.slice(1).map(Number))
    for (const pt of pts) samples.push([basePos[0] + pt[0], basePos[1] + pt[1], basePos[2] + pt[2]])
  } else {
    const radMatch = body.match(/orbitRadius:\s*([\d.]+)/)
    const r = radMatch ? Number(radMatch[1]) : 4
    for (let k = 0; k < 16; k++) {
      const th = (k / 16) * Math.PI * 2
      samples.push([basePos[0] + Math.cos(th) * r, basePos[1] + Math.sin(th) * r, basePos[2]])
    }
  }
  movers.push({ id, zone, basePos, size, type, samples })
}

function boxEdgeDistXZ(aPos, aSize, bPos, bSize) {
  const dx = Math.max(0, Math.abs(aPos[0] - bPos[0]) - (aSize[0] + bSize[0]) / 2)
  const dz = Math.max(0, Math.abs(aPos[2] - bPos[2]) - (aSize[2] + bSize[2]) / 2)
  return Math.hypot(dx, dz)
}

function boxToCylDistXZ(pPos, pSize, cPos, cRad) {
  const dx = Math.max(0, Math.abs(pPos[0] - cPos[0]) - pSize[0] / 2)
  const dz = Math.max(0, Math.abs(pPos[2] - cPos[2]) - pSize[2] / 2)
  return Math.max(0, Math.hypot(dx, dz) - cRad)
}

function canHop(aPos, aSize, bPos, bSize) {
  const dy = bPos[1] - aPos[1]
  const lowG = aPos[1] >= 750
  const maxRise = lowG ? 4.8 : 3.2
  const maxGap = lowG ? 5.2 : 4.2
  if (dy > maxRise) return false
  return boxEdgeDistXZ(aPos, aSize, bPos, bSize) <= maxGap
}

// Build directed reachability graph over platforms starting at z4-summit
const adj = new Map(platforms.map((p) => [p.id, []]))
for (const a of platforms) {
  for (const b of platforms) {
    if (a.id === b.id) continue
    if (canHop(a.pos, a.size, b.pos, b.size)) {
      adj.get(a.id).push({ to: b.id, via: 'hop' })
      continue
    }
    // Check via Updraft Thermal
    const viaUp = updrafts.find((u) => {
      const enterDist = boxToCylDistXZ(a.pos, a.size, u.pos, u.radius)
      const enterOk = enterDist <= 3.8 && a.pos[1] >= u.pos[1] - 2.0 && a.pos[1] <= u.pos[1] + u.height
      const exitDist = boxToCylDistXZ(b.pos, b.size, u.pos, u.radius)
      const topY = u.pos[1] + u.height
      const exitOk = exitDist <= 4.5 && topY >= b.pos[1] + 2.5 && b.pos[1] >= u.pos[1]
      return enterOk && exitOk
    })
    if (viaUp) {
      adj.get(a.id).push({ to: b.id, via: viaUp.id })
      continue
    }
    // Check via Kinematic Mover (airship / orbit ring)
    const viaMover = movers.find((mv) => {
      const canBoard = mv.samples.some((s) => canHop(a.pos, a.size, s, mv.size))
      const canAlight = mv.samples.some((s) => canHop(s, mv.size, b.pos, b.size))
      return canBoard && canAlight
    })
    if (viaMover) {
      adj.get(a.id).push({ to: b.id, via: viaMover.id })
    }
  }
}

// BFS from z4-summit
const visited = new Set(['z4-summit'])
const parent = new Map()
const queue = ['z4-summit']
while (queue.length > 0) {
  const cur = queue.shift()
  for (const edge of adj.get(cur) || []) {
    if (!visited.has(edge.to)) {
      visited.add(edge.to)
      parent.set(edge.to, { from: cur, via: edge.via })
      queue.push(edge.to)
    }
  }
}

const unreachable = platforms.filter((p) => !visited.has(p.id)).map((p) => p.id)
const path = []
if (visited.has('z8-celestial-throne')) {
  let cur = 'z8-celestial-throne'
  while (cur !== 'z4-summit') {
    const e = parent.get(cur)
    path.unshift(`${e.from} --[${e.via}]--> ${cur}`)
    cur = e.from
  }
}

const report = {
  passed: unreachable.length === 0 && visited.has('z8-celestial-throne'),
  platforms: platforms.length - 1,
  updrafts: updrafts.length,
  movers: movers.length,
  reachableCount: visited.size,
  totalNodes: platforms.length,
  unreachable,
  verifiedPathSteps: path.length,
}
console.log('ODYSSEY-BFS-REACHABILITY', JSON.stringify(report, null, 2))
if (!report.passed) {
  console.error('UNREACHABLE PLATFORMS:', unreachable)
  process.exit(1)
}
