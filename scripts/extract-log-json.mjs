#!/usr/bin/env node
// Extracts the JSON payload of the first log line starting with "<tag> " (optionally after "[log] ") into a file.
//   node scripts/extract-log-json.mjs <log> <tag> <out.json>
import { readFileSync, writeFileSync } from 'node:fs'
const [log, tag, out] = process.argv.slice(2)
if (!log || !tag || !out) {
  console.error('usage: node scripts/extract-log-json.mjs <log> <tag> <out.json>')
  process.exit(2)
}
const line = readFileSync(log, 'utf8').split(/\r?\n/).find((l) => l.replace(/^\[log\] /, '').startsWith(tag + ' '))
if (!line) {
  console.error(`no "${tag} " line in ${log}`)
  process.exit(1)
}
const json = JSON.parse(line.slice(line.indexOf(tag + ' ') + tag.length + 1))
writeFileSync(out, JSON.stringify(json, null, 2) + '\n')
console.log(`${out} written`)
