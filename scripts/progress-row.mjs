#!/usr/bin/env node
// Updates one TEST row of docs/PROGRESS.md from a run-test log (DIRECTIVE §6: status, artefact, exact command, commit, date).
//   node scripts/progress-row.mjs <TEST-id> <STATUS> <log> [extra artefact ...]
// The command and commit come from the log header written by scripts/run-test.mjs. Attempts are incremented.
import { readFileSync, writeFileSync } from 'node:fs'

const [rawId, status, logPath, ...extra] = process.argv.slice(2)
if (!rawId || !status || !logPath) {
  console.error('usage: node scripts/progress-row.mjs <TEST-id> <STATUS> <log> [extra artefact ...]')
  process.exit(2)
}
const id = rawId.replace(/^TEST-/i, '')
const log = readFileSync(logPath, 'utf8').split(/\r?\n/)
const header = log.find((l) => l.startsWith('# run-test ')) ?? ''
const command = (log.find((l) => l.startsWith('# command: ')) ?? '').slice('# command: '.length)
const commit = /commit=(\S+)/.exec(header)?.[1] ?? 'unknown'
const started = /started=(\S+)/.exec(header)?.[1]
const d = started ? new Date(started) : new Date()
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` // local date
const runner = command.startsWith('pnpm exec vitexec ')
  ? `node scripts/run-test.mjs ${id} --slug ${/slug=(\S+)/.exec(header)?.[1]} -- ${command.slice('pnpm exec vitexec '.length)}`
  : `node scripts/run-test.mjs ${id} --slug ${/slug=(\S+)/.exec(header)?.[1]} --cmd "${command}"`

const path = 'docs/PROGRESS.md'
const lines = readFileSync(path, 'utf8').split('\n')
const index = lines.findIndex((l) => l.startsWith(`| TEST-${id} |`))
if (index < 0) {
  console.error(`no row for TEST-${id}`)
  process.exit(1)
}
const cells = lines[index].split('|').map((c) => c.trim())
// cells: ['', 'TEST-xx', gate, status, attempts, artefact, command, commit, date, '']
const attempts = (Number.parseInt(cells[4], 10) || 0) + 1
const artefacts = [logPath.replaceAll('\\', '/'), ...extra].join(', ')
lines[index] = `| TEST-${id} | ${cells[2]} | ${status} | ${attempts} | ${artefacts} | \`${runner}\` | ${commit} | ${date} |`
writeFileSync(path, lines.join('\n'))
console.log(lines[index])
