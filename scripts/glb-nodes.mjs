#!/usr/bin/env node
// Dumps node names (as three.js will sanitize them), skins and animation names of a GLB/glTF for boneMap work
// (ref/04 §Animasi, ref/05 §Script).   node scripts/glb-nodes.mjs <file.glb> [> evidence/G2/<name>-nodes.json]
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/glb-nodes.mjs <file.glb|file.gltf>')
  process.exit(2)
}
const buf = readFileSync(file)
let json
if (file.toLowerCase().endsWith('.gltf')) json = JSON.parse(buf.toString('utf8'))
else {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB')
  json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'))
}
// three.js PropertyBinding.sanitizeNodeName: spaces → '_', remove [ ] . : /
const sanitize = (n) => String(n ?? '').replace(/\s/g, '_').replace(/[[\].:/]/g, '')
const nodes = (json.nodes ?? []).map((n, i) => ({ i, name: n.name ?? null, sanitized: sanitize(n.name), children: n.children ?? [], mesh: n.mesh ?? null, skin: n.skin ?? null }))
const skins = (json.skins ?? []).map((s) => ({ name: s.name ?? null, joints: s.joints.map((j) => sanitize(json.nodes[j].name)) }))
const animations = (json.animations ?? []).map((a) => ({ name: a.name ?? null, channels: a.channels.length }))
console.log(JSON.stringify({ file, generator: json.asset?.generator ?? null, extensionsUsed: json.extensionsUsed ?? [], nodes, skins, animations }, null, 2))
