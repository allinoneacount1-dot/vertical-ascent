#!/usr/bin/env node
// Dependency-free VRM texture downscaler (D-017: textures ≤1024²; ref/05: a .vrm never goes through gltf-transform,
// which drops the VRM extension). Parses the GLB (JSON + BIN chunks), resizes every embedded PNG/JPEG image whose
// larger side exceeds --max with ffmpeg (lanczos, aspect kept), rebuilds the BIN chunk with each bufferView 4-byte
// aligned, fixes byteOffsets, the buffer length and both chunk lengths. Every other bufferView is copied byte for
// byte; the script re-reads its output and fails if any non-image view differs or an image is still too large.
// --filter '<image-name regex>::<ffmpeg filter>' (repeatable) bakes a colour change into the matching images after
// the resize (D-017 recolour), e.g. --filter '^F00_002_01_Shoes_01$::hue=h=185'.
//   node scripts/vrm-textures.mjs <in.vrm> <out.vrm> [--max 1024] [--workdir <dir>] [--filter '<re>::<filter>' ...]
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [input, output] = process.argv.slice(2)
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d)
const max = Number(arg('--max', '1024'))
const workdir = arg('--workdir', join('.tmp', 'vrm-textures'))
const filters = process.argv
  .map((a, i) => (a === '--filter' ? process.argv[i + 1] : null))
  .filter((f) => f != null)
  .map((f) => {
    const [re, chain] = f.split('::')
    if (!re || !chain) throw new Error(`--filter needs '<regex>::<ffmpeg filter>', got ${f}`)
    return { re: new RegExp(re), chain, matched: 0 }
  })
if (!input || !output || !(max > 0)) {
  console.error("usage: node scripts/vrm-textures.mjs <in.vrm> <out.vrm> [--max 1024] [--workdir <dir>] [--filter '<re>::<filter>' ...]")
  process.exit(2)
}

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2) throw new Error('not a glTF 2.0 GLB container')
  if (buf.readUInt32LE(8) !== buf.length) throw new Error('header length ≠ file size')
  const jsonLen = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('first chunk is not JSON')
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
  const binHeader = 20 + jsonLen
  if (binHeader + 8 > buf.length || buf.readUInt32LE(binHeader + 4) !== 0x004e4942) throw new Error('second chunk is not BIN')
  const binLen = buf.readUInt32LE(binHeader)
  if (binHeader + 8 + binLen !== buf.length) throw new Error('unexpected extra chunks after BIN')
  return { json, bin: buf.subarray(binHeader + 8, binHeader + 8 + binLen) }
}

function imageSize(bytes, mime) {
  if (mime === 'image/png' && bytes.readUInt32BE(12) === 0x49484452) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  if (mime === 'image/jpeg') {
    for (let i = 2; i < bytes.length - 9; ) {
      if (bytes[i] !== 0xff) break
      const marker = bytes[i + 1]
      if (marker >= 0xc0 && marker <= 0xc3) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)]
      i += 2 + bytes.readUInt16BE(i + 2)
    }
  }
  throw new Error(`cannot read the size of a ${mime} image`)
}

const viewBytes = (json, bin, i) => {
  const v = json.bufferViews[i]
  if ((v.buffer ?? 0) !== 0) throw new Error(`bufferView ${i} uses buffer ${v.buffer}; only a single embedded buffer is supported`)
  return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)
}

const src = readFileSync(input)
const { json, bin } = parseGlb(src)
if ((json.buffers ?? []).length !== 1 || json.buffers[0].uri != null) throw new Error('expected exactly one embedded buffer')
mkdirSync(workdir, { recursive: true })

const replaced = new Map() // bufferView index → new bytes
const report = []
for (const [i, img] of (json.images ?? []).entries()) {
  if (img.bufferView == null) throw new Error(`image ${i} is external (uri); not supported`)
  const bytes = viewBytes(json, bin, img.bufferView)
  const [w, h] = imageSize(bytes, img.mimeType)
  const colour = filters.filter((f) => f.re.test(img.name ?? '')).map((f) => (f.matched++, f.chain))
  if (Math.max(w, h) <= max && colour.length === 0) continue
  const k = Math.min(1, max / Math.max(w, h))
  const nw = Math.max(1, Math.round(w * k))
  const nh = Math.max(1, Math.round(h * k))
  const ext = img.mimeType === 'image/png' ? 'png' : 'jpg'
  const inFile = join(workdir, `image-${i}-in.${ext}`)
  const outFile = join(workdir, `image-${i}-out.${ext}`)
  writeFileSync(inFile, bytes)
  const ff = ['-v', 'error', '-y', '-i', inFile, '-vf', [`scale=${nw}:${nh}:flags=lanczos`, ...colour].join(',')]
  if (ext === 'png') ff.push('-pix_fmt', 'rgba', '-compression_level', '9')
  else ff.push('-q:v', '2')
  ff.push(outFile)
  const run = spawnSync('ffmpeg', ff, { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`ffmpeg failed on image ${i}: ${run.stderr}`)
  const out = readFileSync(outFile)
  const [ow, oh] = imageSize(out, img.mimeType)
  if (ow !== nw || oh !== nh) throw new Error(`image ${i}: ffmpeg wrote ${ow}x${oh}, expected ${nw}x${nh}`)
  replaced.set(img.bufferView, out)
  report.push({ image: i, name: img.name ?? null, from: `${w}x${h}`, to: `${nw}x${nh}`, filters: colour, bytesBefore: bytes.length, bytesAfter: out.length })
}
for (const f of filters) if (f.matched === 0) throw new Error(`--filter ${f.re} matched no image`)

// rebuild BIN: views in their original order, each start aligned to 4 bytes (glTF accessor alignment ≤4)
const parts = []
let offset = 0
for (const [i, v] of json.bufferViews.entries()) {
  const pad = (4 - (offset % 4)) % 4
  if (pad) parts.push(Buffer.alloc(pad))
  offset += pad
  const data = replaced.get(i) ?? viewBytes(json, bin, i)
  v.byteOffset = offset
  v.byteLength = data.length
  parts.push(data)
  offset += data.length
}
const tail = (4 - (offset % 4)) % 4
if (tail) parts.push(Buffer.alloc(tail))
const newBin = Buffer.concat(parts)
json.buffers[0].byteLength = newBin.length

let text = JSON.stringify(json)
while (Buffer.byteLength(text) % 4 !== 0) text += ' '
const jsonBuf = Buffer.from(text, 'utf8')
const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + newBin.length, 8)
const jsonHeader = Buffer.alloc(8)
jsonHeader.writeUInt32LE(jsonBuf.length, 0)
jsonHeader.writeUInt32LE(0x4e4f534a, 4)
const binHeader = Buffer.alloc(8)
binHeader.writeUInt32LE(newBin.length, 0)
binHeader.writeUInt32LE(0x004e4942, 4)
const result = Buffer.concat([header, jsonHeader, jsonBuf, binHeader, newBin])
writeFileSync(output, result)

// self-check on the written file
const check = parseGlb(readFileSync(output))
const orig = parseGlb(src)
let identical = 0
for (const [i] of check.json.bufferViews.entries()) {
  const a = viewBytes(check.json, check.bin, i)
  if (replaced.has(i)) {
    if (!a.equals(replaced.get(i))) throw new Error(`self-check: replaced view ${i} differs`)
    continue
  }
  if (!a.equals(viewBytes(orig.json, orig.bin, i))) throw new Error(`self-check: view ${i} changed`)
  identical++
}
for (const [i, img] of check.json.images.entries()) {
  const [w, h] = imageSize(viewBytes(check.json, check.bin, img.bufferView), img.mimeType)
  if (Math.max(w, h) > max) throw new Error(`self-check: image ${i} is still ${w}x${h}`)
}
const keys = (o) => JSON.stringify(Object.keys(o).sort())
if (keys(check.json) !== keys(orig.json) || JSON.stringify(check.json.extensions) !== JSON.stringify(orig.json.extensions))
  throw new Error('self-check: top-level JSON keys or extensions changed')
console.log(
  JSON.stringify(
    { input, output, max, bytesBefore: src.length, bytesAfter: result.length, viewsTotal: check.json.bufferViews.length, viewsCopiedIdentical: identical, imagesResized: report },
    null,
    2,
  ),
)
