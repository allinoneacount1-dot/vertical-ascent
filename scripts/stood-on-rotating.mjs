#!/usr/bin/env node
// Static check behind TEST-11b's N/A(D-012) clause: lists every rotating entry of a level and whether a player can
// stand on it (walkable prefab, or a tag other than hazard/decor). TEST-11b applies only when that count is > 0.
//   node scripts/stood-on-rotating.mjs <level.json> <prefabs.json>
import { readFileSync } from 'node:fs'

const [levelPath, prefabsPath] = process.argv.slice(2)
if (!levelPath || !prefabsPath) {
  console.error('usage: node scripts/stood-on-rotating.mjs <level.json> <prefabs.json>')
  process.exit(2)
}
const level = JSON.parse(readFileSync(levelPath, 'utf8'))
const raw = JSON.parse(readFileSync(prefabsPath, 'utf8'))
const prefabs = new Map((Array.isArray(raw) ? raw : raw.prefabs).map((p) => [p.id, p]))
const rotating = level.platforms
  .filter((e) => e.motion?.type === 'rotate')
  .map((e) => {
    const walkable = prefabs.get(e.prefab)?.walkable === true
    return { id: e.id, prefab: e.prefab, tag: e.tag, axis: e.motion.axis ?? [0, 1, 0], walkable, stoodOn: walkable || !['hazard', 'decor'].includes(e.tag) }
  })
const stoodOn = rotating.filter((r) => r.stoodOn)
console.log('rotating ' + JSON.stringify(rotating))
console.log(`stood-on rotating platforms: ${stoodOn.length} → TEST-11b ${stoodOn.length === 0 ? 'N/A(D-012)' : 'applies'}`)
