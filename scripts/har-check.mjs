#!/usr/bin/env node
// HAR network gate (DIRECTIVE D-020; TEST-18a/18b/20b): 0 requests to hosts other than the page host, 0 responses
// 4xx/5xx, 0 asset responses served as text/html (a missing asset behind an SPA fallback).
//   node scripts/har-check.mjs <file.har> [--host 127.0.0.1] [--any-port]
// --any-port: every port of --host counts as the page host (vitexec dev HAR: the HMR websocket uses its own port).
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('usage: node scripts/har-check.mjs <file.har> [--host 127.0.0.1] [--any-port]')
  process.exit(2)
}
const hostArg = args.includes('--host') ? args[args.indexOf('--host') + 1] : '127.0.0.1'
const anyPort = args.includes('--any-port')
const har = JSON.parse(readFileSync(file, 'utf8'))
const entries = har.log?.entries ?? []
const ASSET = /\.(glb|gltf|bin|vrm|png|jpe?g|webp|hdr|ktx2|ogg|wav|mp3|woff2?|json|js|mjs|css|svg)(\?|$)/i

const foreign = []
const errors = []
const htmlAssets = []
const hosts = new Map()
let pageHost = null
for (const e of entries) {
  const url = e.request?.url ?? ''
  if (url.startsWith('data:') || url.startsWith('blob:')) continue
  let u
  try {
    u = new URL(url)
  } catch {
    continue
  }
  if (pageHost == null && u.hostname === hostArg) pageHost = u.host
  hosts.set(u.host, (hosts.get(u.host) ?? 0) + 1)
  const sameHost = anyPort ? u.hostname === hostArg : u.host === pageHost
  if (!sameHost) foreign.push(url)
  const status = e.response?.status ?? 0
  if (status >= 400) errors.push(`${status} ${url}`)
  const mime = (e.response?.content?.mimeType ?? '').toLowerCase()
  if (ASSET.test(u.pathname) && mime.includes('text/html')) htmlAssets.push(url)
}
const summary = { file, requests: entries.length, hosts: Object.fromEntries(hosts), pageHost, foreign: foreign.length, errors: errors.length, htmlAssets: htmlAssets.length }
console.log('har ' + JSON.stringify(summary))
for (const x of foreign) console.log('foreign ' + x)
for (const x of errors) console.log('status ' + x)
for (const x of htmlAssets) console.log('html-asset ' + x)
if (entries.length === 0) {
  console.log('HAR FAIL: no entries')
  process.exit(1)
}
if (foreign.length || errors.length || htmlAssets.length) {
  console.log('HAR FAIL')
  process.exit(1)
}
console.log('HAR PASS')
