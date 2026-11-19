#!/usr/bin/env node
// Automated reachability audit for Mode Odyssey 1000 m (Z5-Z8)
import { readFileSync } from 'node:fs'

const src = readFileSync('src/level/odyssey.ts', 'utf8')
const platBlock = src.slice(src.indexOf('export const ODYSSEY_PLATFORMS'), src.indexOf('export const ODYSSEY_UPDRAFS'))
const platforms = [...platBlock.matchAll(/id:\s*'([^']+)',\s*zone:\s*'(z[5-8])'.*?pos:\s*\[([^\]]+)\]/g)].map((m) => ({
  id: m[1],
  zone: m[2],
  pos: m[3].split(',').map((n) => Number(n.trim())),
}))
const updrafts = [...src.matchAll(/id:\s*'([^']+)',\s*zone:\s*'(z[5-8])',\s*pos:\s*\[([^\]]+)\],\s*radius:\s*([\d.]+),\s*height:\s*([\d.]+)/g)].map(
  (m) => ({
    id: m[1],
    zone: m[2],
    pos: m[3].split(',').map((n) => Number(n.trim())),
    radius: Number(m[4]),
    height: Number(m[5]),
  }),
)
const movers = [...src.matchAll(/id:\s*'([^']+)',\s*zone:\s*'(z[5-8])',\s*kind:\s*'([^']+)',\s*basePos:\s*\[([^\]]+)\]/g)].map((m) => ({
  id: m[1],
  zone: m[2],
  kind: m[3],
  basePos: m[4].split(',').map((n) => Number(n.trim())),
}))

const issues = []
if (platforms.length < 16) issues.push(`Expected >=16 Odyssey platforms, found ${platforms.length}`)
if (updrafts.length < 5) issues.push(`Expected >=5 Updraft Thermals, found ${updrafts.length}`)
if (movers.length < 4) issues.push(`Expected >=4 Odyssey kinematic movers, found ${movers.length}`)

for (let i = 1; i < platforms.length; i++) {
  const prev = platforms[i - 1]
  const cur = platforms[i]
  const dy = cur.pos[1] - prev.pos[1]
  const dh = Math.hypot(cur.pos[0] - prev.pos[0], cur.pos[2] - prev.pos[2])
  if (dy < 0) issues.push(`Non-ascending platform order: ${prev.id} (${prev.pos[1]}m) -> ${cur.id} (${cur.pos[1]}m)`)
  if (dy > 55) issues.push(`Vertical gap too large without bridge: ${prev.id} -> ${cur.id} (dy=${dy}m)`)
  if (dh > 38) issues.push(`Horizontal gap too wide: ${prev.id} -> ${cur.id} (dh=${dh.toFixed(1)}m)`)
}

const throne = platforms.find((p) => p.id === 'z8-celestial-throne')
if (!throne || throne.pos[1] !== 1000) issues.push('Missing 1000 m Celestial Throne platform')

const report = {
  passed: issues.length === 0,
  platforms: platforms.length,
  updrafts: updrafts.length,
  movers: movers.length,
  minAltM: platforms[0]?.pos[1],
  maxAltM: throne?.pos[1],
  issues,
}
console.log('ODYSSEY-REACHABILITY', JSON.stringify(report))
if (issues.length > 0) process.exit(1)
