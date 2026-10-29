#!/usr/bin/env node
// Downloads ONE approved asset (ref/05 §Alur persetujuan dan unduhan). Approval comes only from the owner's chat in
// the current session; this script enforces the approval unit (asset-id, host, filename pattern, size ±25 %).
//   node scripts/fetch-assets.mjs --id <asset-id> --url <https url> --pattern <regex for the file name> --mb <expected MB>
// Writes .cache/downloads/<asset-id>/<file> and prints sha256. Never scrapes, never calls kenney.nl/download-link.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const ALLOWED_HOSTS = new Set(['opengameart.org', 'dl.polyhaven.org'])
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined)
const id = arg('--id')
const url = arg('--url')
const pattern = arg('--pattern')
const mb = Number(arg('--mb'))
if (!id || !url || !pattern || !(mb > 0)) {
  console.error('usage: node scripts/fetch-assets.mjs --id <asset-id> --url <url> --pattern <regex> --mb <expected MB>')
  process.exit(2)
}
const u = new URL(url)
if (u.protocol !== 'https:') throw new Error('https only')
if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error(`host ${u.hostname} is not an approved download host`)
if (/kenney\.nl\/download-link/.test(url)) throw new Error('kenney.nl download links are OWNER-ONLY')
const name = decodeURIComponent(basename(u.pathname))
if (!new RegExp(pattern).test(name)) throw new Error(`file name ${name} does not match the approved pattern ${pattern}`)

const res = await fetch(url, { headers: { 'User-Agent': 'VerticalAscent-fetch-assets/1' }, redirect: 'follow' })
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const finalHost = new URL(res.url).hostname
if (!ALLOWED_HOSTS.has(finalHost)) throw new Error(`redirected to an unapproved host ${finalHost}`)
const declared = Number(res.headers.get('content-length') ?? 'NaN')
const lo = mb * 0.75 * 1024 * 1024
const hi = mb * 1.25 * 1024 * 1024
if (Number.isFinite(declared) && (declared < lo || declared > hi)) {
  await res.body?.cancel()
  throw new Error(`size ${declared} bytes outside ±25 % of ${mb} MB — stop and ask the owner`)
}
const data = Buffer.from(await res.arrayBuffer())
if (data.length < lo || data.length > hi) throw new Error(`downloaded ${data.length} bytes outside ±25 % of ${mb} MB — stop and ask the owner`)
const dir = join('.cache', 'downloads', id)
mkdirSync(dir, { recursive: true })
const file = join(dir, name)
writeFileSync(file, data)
const sha256 = createHash('sha256').update(data).digest('hex')
const now = new Date()
const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` // manifest obtained_on is the local date
console.log(JSON.stringify({ id, url, finalUrl: res.url, file: file.split('\\').join('/'), bytes: data.length, sha256, obtainedOn: local, obtainedAt: now.toISOString() }))
