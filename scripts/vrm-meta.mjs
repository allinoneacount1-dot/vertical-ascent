#!/usr/bin/env node
// Dependency-free VRM meta rewriter (ref/05 §Script). VRM files never go through gltf-transform (the VRM extension
// would be dropped). Parses the 12-byte header + JSON/BIN chunks, edits extensions.VRM.meta (VRM0) or
// extensions.VRMC_vrm.meta (VRM1), pads JSON to 4 bytes, fixes chunk and total lengths; the BIN chunk is copied
// byte for byte. The original meta is saved first.
//   node scripts/vrm-meta.mjs <in.vrm> <out.vrm> <meta-patch.json> <licenses/<id>.json>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const [input, output, patchFile, originalOut] = process.argv.slice(2)
if (!input || !output || !patchFile || !originalOut) {
  console.error('usage: node scripts/vrm-meta.mjs <in.vrm> <out.vrm> <meta-patch.json> <licenses/<id>.json>')
  process.exit(2)
}
const buf = readFileSync(input)
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB container')
const total = buf.readUInt32LE(8)
if (total !== buf.length) throw new Error(`header length ${total} ≠ file size ${buf.length}`)
const jsonLen = buf.readUInt32LE(12)
if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('first chunk is not JSON')
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
const rest = buf.subarray(20 + jsonLen) // BIN chunk (header + data), copied verbatim
const v1 = json.extensions?.VRMC_vrm
const v0 = json.extensions?.VRM
const meta = v1?.meta ?? v0?.meta
if (!meta) throw new Error('no VRM meta found')
mkdirSync(dirname(originalOut), { recursive: true })
writeFileSync(originalOut, JSON.stringify({ source: input, version: v1 ? '1' : '0', meta }, null, 2) + '\n')
const patch = JSON.parse(readFileSync(patchFile, 'utf8'))
Object.assign(meta, patch)
let text = JSON.stringify(json)
while (Buffer.byteLength(text) % 4 !== 0) text += ' '
const jsonBuf = Buffer.from(text, 'utf8')
const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + jsonBuf.length + rest.length, 8)
const chunkHeader = Buffer.alloc(8)
chunkHeader.writeUInt32LE(jsonBuf.length, 0)
chunkHeader.writeUInt32LE(0x4e4f534a, 4)
writeFileSync(output, Buffer.concat([header, chunkHeader, jsonBuf, rest]))
console.log(JSON.stringify({ input, output, version: v1 ? '1' : '0', patched: Object.keys(patch), binBytesCopied: rest.length }))
