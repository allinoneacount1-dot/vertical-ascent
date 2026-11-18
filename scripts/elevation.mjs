#!/usr/bin/env node
// Generates side (X-Y) and top (X-Z) elevation SVG with the route polyline (TEST-37, evidence/G3/TEST-37-elevation.svg).
import { readFileSync, writeFileSync } from 'node:fs'

const route = JSON.parse(readFileSync('vitexec/routes/main.json', 'utf8'))
const pts = route.waypoints.map((w) => ({ id: w.id, zone: w.zone, x: w.target[0], y: w.target[1], z: w.target[2] }))

const xs = pts.map((p) => p.x)
const ys = pts.map((p) => p.y)
const zs = pts.map((p) => p.z)
const minX = Math.min(...xs) - 10
const maxX = Math.max(...xs) + 10
const minY = 0
const maxY = Math.max(...ys) + 20
const minZ = Math.min(...zs) - 10
const maxZ = Math.max(...zs) + 10

const W = 1200
const H = 600
const pad = 50
const halfW = W / 2 - pad * 1.5

const sx = (x) => pad + ((x - minX) / (maxX - minX)) * halfW
const sy = (y) => H - pad - ((y - minY) / (maxY - minY)) * (H - 2 * pad)
const tx = (x) => W / 2 + pad * 0.5 + ((x - minX) / (maxX - minX)) * halfW
const tz = (z) => pad + ((z - minZ) / (maxZ - minZ)) * (H - 2 * pad)

const colors = { z1: '#5ad2f4', z2: '#7ee081', z3: '#ffb84d', z4: '#ff6b6b' }
const sideLine = pts.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
const topLine = pts.map((p) => `${tx(p.x).toFixed(1)},${tz(p.z).toFixed(1)}`).join(' ')
const dots = (fx, fy) =>
  pts.map((p) => `<circle cx="${fx(p.x).toFixed(1)}" cy="${fy(p).toFixed(1)}" r="2" fill="${colors[p.zone] ?? '#fff'}"/>`).join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#0d1420;font-family:sans-serif">
  <text x="${pad}" y="28" fill="#f2f4f8" font-size="18" font-weight="bold">Side Elevation (X vs Y, 0–500 m) — ${pts.length} nodes</text>
  <text x="${W / 2 + pad * 0.5}" y="28" fill="#f2f4f8" font-size="18" font-weight="bold">Top Plan (X vs Z)</text>
  <polyline fill="none" stroke="#ffcf5a" stroke-width="1.5" points="${sideLine}"/>
  <polyline fill="none" stroke="#ffcf5a" stroke-width="1.5" points="${topLine}"/>
  ${dots((x) => sx(x), (p) => sy(p.y))}
  ${dots((x) => tx(x), (p) => tz(p.z))}
</svg>\n`

writeFileSync('evidence/G3/TEST-37-elevation.svg', svg)
console.log(`evidence/G3/TEST-37-elevation.svg written (${pts.length} waypoints)`)
