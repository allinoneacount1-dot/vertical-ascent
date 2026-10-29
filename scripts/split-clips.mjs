#!/usr/bin/env node
// One clip per file (ref/05 §Script; loadCharacterAnimation requires exactly one clip per file, ref/04 §Animasi).
// For every animation of the input: re-read the input, drop the other animations, prune (keep leaves and
// attributes), write <outDir>/<sanitized name>.glb uncompressed (no meshopt/quantize for clips).
// --drop-meshes detaches meshes and skins first: the animation loader only reads the bone hierarchy of the clip
// scene, so the pack's preview mannequin would otherwise ship once per clip (the library's own clips carry no mesh).
//   node scripts/split-clips.mjs <pack.glb> <outDir> [--only name1,name2] [--drop-meshes]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { prune } from '@gltf-transform/functions'

const [input, outDir] = process.argv.slice(2)
const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null
const dropMeshes = process.argv.includes('--drop-meshes')
if (!input || !outDir) {
  console.error('usage: node scripts/split-clips.mjs <pack.glb> <outDir> [--only a,b] [--drop-meshes]')
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
  // dispose channels and samplers too: a disposed animation leaves them attached to their accessors, and prune
  // then keeps every other clip's keyframe data (7340 accessors instead of 160 in UAL1)
  for (const a of doc.getRoot().listAnimations()) {
    if (a.getName() === name) continue
    for (const c of a.listChannels()) c.dispose()
    for (const s of a.listSamplers()) s.dispose()
    a.dispose()
  }
  if (dropMeshes) for (const n of doc.getRoot().listNodes()) n.setMesh(null).setSkin(null)
  await doc.transform(prune({ keepLeaves: true, keepAttributes: true }))
  const file = join(outDir, `${name.replace(/[^A-Za-z0-9_-]+/g, '_')}.glb`)
  await io.write(file, doc)
  written.push({ name, file })
}
console.log(JSON.stringify({ input, clips: names.length, written }, null, 2))
