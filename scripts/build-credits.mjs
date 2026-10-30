#!/usr/bin/env node
// Credits generator (DIRECTIVE §5 G3 step 5 "layar Credits dari manifest", D-016 f; ref/05 §Kolom ASSET_MANIFEST.md;
// TEST-23b static half): writes src/ui/credits.json from the ASSET_MANIFEST.md rows that ship (integration_status
// INTEGRATED, path under public/). Never edited by hand; the code-library line stays in the Credits UI.
//   node scripts/build-credits.mjs          → writes src/ui/credits.json and prints the entries
//   node scripts/build-credits.mjs --check  → exit 1 when src/ui/credits.json is missing or stale, 0 when fresh
// Both modes exit 1 when a shipped row blocks the credits (empty TASL field, duplicate id, CC-BY without attribution).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildCredits, creditProblems, renderCredits } from './lib/credits.mjs'

const MANIFEST = 'ASSET_MANIFEST.md'
const OUT = 'src/ui/credits.json'
const root = fileURLToPath(new URL('..', import.meta.url))
const at = (rel) => `${root}${rel}`

const args = process.argv.slice(2)
const check = args.includes('--check')
const unknown = args.filter((a) => a !== '--check')
if (unknown.length > 0) {
  console.error(`unknown argument(s): ${unknown.join(' ')}\nusage: node scripts/build-credits.mjs [--check]`)
  process.exit(2)
}

const markdown = readFileSync(at(MANIFEST), 'utf8')
const problems = creditProblems(markdown)
if (problems.length > 0) {
  console.error(`[error] ${MANIFEST}: ${problems.length} credits problem(s):`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
const entries = buildCredits(markdown)
const text = renderCredits(entries)

/** Human-readable difference between the committed entries and the expected ones, by id and field. */
function describeDiff(currentText) {
  let current
  try {
    current = JSON.parse(currentText)
  } catch (err) {
    return [`${OUT} is not valid JSON (${err.message})`]
  }
  if (!Array.isArray(current)) return [`${OUT} is not a JSON array`]
  const lines = []
  const byId = new Map(current.map((e) => [e?.id, e]))
  const wanted = new Set(entries.map((e) => e.id))
  for (const e of entries) {
    const c = byId.get(e.id)
    if (!c) {
      lines.push(`missing entry ${e.id}`)
      continue
    }
    for (const key of new Set([...Object.keys(e), ...Object.keys(c)])) {
      if (JSON.stringify(c[key]) !== JSON.stringify(e[key])) {
        lines.push(`${e.id}.${key}: ${JSON.stringify(c[key])} → ${JSON.stringify(e[key])}`)
      }
    }
  }
  for (const c of current) if (!wanted.has(c?.id)) lines.push(`extra entry ${c?.id} (not a shipped manifest row)`)
  if (lines.length === 0) lines.push('same entries, different order or formatting')
  return lines
}

if (check) {
  if (!existsSync(at(OUT))) {
    console.error(`[error] ${OUT} is missing; run: node scripts/build-credits.mjs`)
    process.exit(1)
  }
  const current = readFileSync(at(OUT), 'utf8').replace(/\r\n/g, '\n')
  if (current !== text) {
    console.error(`[error] ${OUT} is stale against ${MANIFEST}; run: node scripts/build-credits.mjs`)
    for (const l of describeDiff(current)) console.error(`  - ${l}`)
    process.exit(1)
  }
  console.log(`${OUT} is fresh (${entries.length} entries from ${MANIFEST})`)
  process.exit(0)
}

writeFileSync(at(OUT), text)
console.log(`wrote ${OUT}: ${entries.length} entries from ${MANIFEST}`)
for (const e of entries) {
  console.log(`  ${e.id} | ${e.title} | ${e.author} | ${e.license}${e.modified ? ' | modified' : ''} | ${e.attribution ?? '(no attribution text)'}`)
}
