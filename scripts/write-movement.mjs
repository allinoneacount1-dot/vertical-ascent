#!/usr/bin/env node
// Writes level/movement.json (ref/03 §Movement) from the "movement {...}" line of a vitexec log.
//   set -o pipefail; pnpm exec vitexec ./vitexec/physics-movement.ts 2>&1 | tee evidence/G1/movement.log
//   node scripts/write-movement.mjs evidence/G1/movement.log
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const logPath = process.argv[2]
if (!logPath) {
  console.error('usage: node scripts/write-movement.mjs <vitexec log>')
  process.exit(2)
}
const line = readFileSync(logPath, 'utf8')
  .split(/\r?\n/)
  .find((l) => /^(\[log\] )?movement \{/.test(l))
if (!line) {
  console.error(`no "movement {...}" line in ${logPath}`)
  process.exit(1)
}
const measured = JSON.parse(line.slice(line.indexOf('{')))
for (const k of ['ups', 'apexM', 'airtimeS', 'reach', 'coyoteS']) {
  if (measured[k] == null) {
    console.error(`movement line lacks "${k}"`)
    process.exit(1)
  }
}
const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
const out = {
  ups: measured.ups,
  apexM: measured.apexM,
  airtimeS: measured.airtimeS,
  reach: measured.reach,
  coyoteS: measured.coyoteS,
  measuredAt: new Date().toISOString(),
  commit,
  source: logPath.replaceAll('\\', '/'),
  definition: measured.definition,
}
mkdirSync('level', { recursive: true })
writeFileSync('level/movement.json', JSON.stringify(out, null, 2) + '\n')
console.log(`level/movement.json written (apex ${out.apexM} m, airtime ${out.airtimeS} s, run flat reach ${out.reach.run.flat} m)`)
