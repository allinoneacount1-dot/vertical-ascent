#!/usr/bin/env node
// TEST runner (docs/directive/ref/06-testing.md §Runner, DIRECTIVE D-018).
//   node scripts/run-test.mjs <TEST-id> [--slug <s>] -- <vitexec args>
//   node scripts/run-test.mjs <TEST-id> [--slug <s>] --cmd "<command>"
// Tees stdout+stderr to evidence/G<n>/TEST-<id>-<slug>.log (G<n> from the RESUME HERE line of docs/PROGRESS.md).
// Exit 1 when the command exits non-zero or any output line is a vitexec error line
// (vitexec 0.9 exits 0 for errors raised inside callbacks).
import { spawn, execSync } from 'node:child_process'
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ERROR_LINE = /^(\[late [^\]]+\] )?\[(page error|error|request failed|http [45]\d\d)\]/

function usage(msg) {
  if (msg) console.error(`run-test: ${msg}`)
  console.error('usage: node scripts/run-test.mjs <TEST-id> [--slug <s>] -- <vitexec args>')
  console.error('       node scripts/run-test.mjs <TEST-id> [--slug <s>] --cmd "<command>"')
  process.exit(2)
}

const argv = process.argv.slice(2)
if (argv.length === 0) usage('missing TEST id')
const rawId = argv.shift()
const id = rawId.replace(/^TEST-/i, '')
if (!/^\d{2}[a-z]?$/.test(id)) usage(`bad TEST id "${rawId}" (expected e.g. 31, 07b, TEST-11a)`)

let slug = 'run'
let cmd = null
let vitexecArgs = null
while (argv.length > 0) {
  const a = argv.shift()
  if (a === '--slug') {
    slug = argv.shift() ?? usage('--slug needs a value')
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) usage(`bad slug "${slug}"`)
  } else if (a === '--cmd') {
    cmd = argv.shift() ?? usage('--cmd needs a value')
  } else if (a === '--') {
    vitexecArgs = argv.splice(0)
  } else {
    usage(`unknown argument "${a}"`)
  }
}
if ((cmd == null) === (vitexecArgs == null)) usage('give exactly one of --cmd "<command>" or -- <vitexec args>')

const progress = readFileSync('docs/PROGRESS.md', 'utf8')
const gate = /^RESUME HERE: (G\d)/m.exec(progress)?.[1]
if (gate == null) usage('docs/PROGRESS.md has no "RESUME HERE: G<n>" line')

const dir = join('evidence', gate)
mkdirSync(dir, { recursive: true })
const logPath = join(dir, `TEST-${id}-${slug}.log`).replaceAll('\\', '/')
const log = createWriteStream(logPath)

const quote = (s) => (/[\s"]/.test(s) ? `"${s.replaceAll('"', '\\"')}"` : s)
const command = cmd ?? ['pnpm', 'exec', 'vitexec', ...vitexecArgs.map(quote)].join(' ')
let commit = 'unknown'
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  if (execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim() !== '') commit += '+dirty'
} catch {
  // not fatal: evidence still records the command
}

const header = [
  `# run-test TEST-${id} slug=${slug} gate=${gate} commit=${commit} started=${new Date().toISOString()}`,
  `# command: ${command}`,
]
for (const line of header) {
  console.log(line)
  log.write(line + '\n')
}

const flagged = []
let pending = ''
function scan(text, final = false) {
  pending += text
  const lines = pending.split(/\r?\n/)
  pending = final ? '' : (lines.pop() ?? '')
  for (const line of lines) if (ERROR_LINE.test(line)) flagged.push(line)
}

const started = Date.now()
const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    process.stdout.write(chunk)
    log.write(chunk)
    scan(chunk)
  })
}
child.on('error', (err) => {
  const line = `# spawn error: ${err.message}`
  console.error(line)
  log.write(line + '\n')
})
child.on('close', (code, signal) => {
  scan('', true)
  const ok = code === 0 && flagged.length === 0
  const footer = [
    ...flagged.map((l) => `# flagged: ${l}`),
    `# exit=${code ?? 'null'}${signal ? ` signal=${signal}` : ''} flagged=${flagged.length} seconds=${((Date.now() - started) / 1000).toFixed(1)} result=${ok ? 'PASS' : 'FAIL'}`,
    `# log: ${logPath}`,
  ]
  for (const line of footer) {
    console.log(line)
    log.write(line + '\n')
  }
  log.end(() => process.exit(ok ? 0 : 1))
})
