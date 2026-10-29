#!/usr/bin/env node
// One clip per file (ref/05 §Script; loadCharacterAnimation requires exactly one clip per file, ref/04 §Animasi).
// For every animation of the input: re-read the input, drop the other animations, prune (keep leaves and
// attributes), write <outDir>/<sanitized name>.glb uncompressed (no meshopt/quantize for clips).
//   node scripts/split-clips.mjs <pack.glb> <outDir> [--only name1,name2]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { prune } from '@gltf-transform/functions'

const [input, outDir] = process.argv.slice(2)
const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null
if (!input || !outDir) {
  console.error('usage: node scripts/split-clips.mjs <pack.glb> <outDir> [--only a,b]')
  process.exit(2)
}
const io = new NodeIO()
const names = (await io.read(input))
  .getRoot()
  .listAnimations()
  .map((a) => a.getName())
mkdirSync(outDir, { recursive: true })
const written = []
for (const name of names) {
  if (only && !only.has(name)) continue
  const doc = await io.read(input)
  for (const a of doc.getRoot().listAnimations()) if (a.getName() !== name) a.dispose()
  await doc.transform(prune({ keepLeaves: true, keepAttributes: true }))
  const file = join(outDir, `${name.replace(/[^A-Za-z0-9_-]+/g, '_')}.glb`)
  await io.write(file, doc)
  written.push({ name, file })
}
console.log(JSON.stringify({ input, clips: names.length, written }, null, 2))
