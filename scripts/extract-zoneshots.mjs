#!/usr/bin/env node
// Writes the zone screenshots a route-bot log carries ("zoneshot {json}" lines, vitexec/lib/route-bot.ts) as JPEG files.
//   node scripts/extract-zoneshots.mjs <log> <out-prefix>   → <out-prefix>-<zone>.jpg
import { readFileSync, writeFileSync } from 'node:fs'
const [log, prefix] = process.argv.slice(2)
if (!log || !prefix) {
  console.error('usage: node scripts/extract-zoneshots.mjs <log> <out-prefix>')
  process.exit(2)
}
let n = 0
for (const line of readFileSync(log, 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('zoneshot {')
  if (at < 0) continue
  const shot = JSON.parse(line.slice(at + 'zoneshot '.length))
  const out = `${prefix}-${shot.zone}.jpg`
  writeFileSync(out, Buffer.from(shot.dataUrl.replace(/^data:image\/jpeg;base64,/, ''), 'base64'))
  console.log(`${out} (${shot.label}, t=${shot.t} s)`)
  n++
}
if (n === 0) {
  console.error(`no zoneshot lines in ${log}`)
  process.exit(1)
}
