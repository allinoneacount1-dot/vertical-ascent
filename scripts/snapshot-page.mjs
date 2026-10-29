#!/usr/bin/env node
// Licence-page snapshot (ref/05 §Sumber: "verify the licence label again at download time and keep a snapshot").
// Turns a saved HTML page into plain text (scripts, styles and tags removed) with a header naming the URL, the fetch
// time of the HTML file and its sha256. The page is fetched separately (curl), so this script never downloads.
//   node scripts/snapshot-page.mjs <page.html> <url> "<title>" > licenses/<name>.snapshot.txt
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'

const [htmlPath, url, title] = process.argv.slice(2)
if (!htmlPath || !url || !title) {
  console.error('usage: node scripts/snapshot-page.mjs <page.html> <url> "<title>"')
  process.exit(2)
}
const html = readFileSync(htmlPath)
const entities = { nbsp: ' ', amp: '&', quot: '"', lt: '<', gt: '>', '#x27': "'", '#39': "'" }
const text = html
  .toString('utf8')
  .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\b[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(nbsp|amp|quot|lt|gt|#x27|#39);/g, (_, e) => entities[e])
  .split('\n')
  .map((l) => l.replace(/[ \t]+/g, ' ').trim())
  .filter(Boolean)
  .join('\n')
console.log(`# Snapshot: ${title}`)
console.log(`# URL: ${url}`)
console.log(`# HTML fetched: ${statSync(htmlPath).mtime.toISOString()} (curl, User-Agent VerticalAscent-fetch-assets/1)`)
console.log(`# HTML sha256: ${createHash('sha256').update(html).digest('hex')}`)
console.log('')
console.log(text)
