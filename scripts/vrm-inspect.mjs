#!/usr/bin/env node
// Read-only VRM/GLB inspection (ref/05 §Sumber "dump meta" before any decision; D-017 height 1.5–1.9 m, textures
// ≤1024²): VRM meta (0.x or 1.0), humanoid bone count, images (mime, bytes, PNG/JPEG size), materials and the
// bind-pose vertical extent of all POSITION accessors (feet-to-crown estimate; the in-page probe measures exactly).
//   node scripts/vrm-inspect.mjs <file.vrm> [more.vrm ...]
import { readFileSync } from 'node:fs'

function imageSize(bytes, mime) {
  if (mime === 'image/png' && bytes.readUInt32BE(12) === 0x49484452) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  if (mime === 'image/jpeg') {
    for (let i = 2; i < bytes.length - 9; ) {
      if (bytes[i] !== 0xff) return null
      const marker = bytes[i + 1]
      if (marker >= 0xc0 && marker <= 0xc3) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)]
      i += 2 + bytes.readUInt16BE(i + 2)
    }
  }
  return null
}

const out = []
for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file)
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB container`)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
  const binStart = 20 + jsonLen + 8
  const v0 = json.extensions?.VRM
  const v1 = json.extensions?.VRMC_vrm
  const meta = v1?.meta ?? v0?.meta ?? null
  if (meta?.texture != null) delete meta.texture // thumbnail index only
  const images = (json.images ?? []).map((img, i) => {
    const view = json.bufferViews[img.bufferView]
    const bytes = buf.subarray(binStart + (view.byteOffset ?? 0), binStart + (view.byteOffset ?? 0) + view.byteLength)
    return { i, name: img.name ?? null, mime: img.mimeType, bytes: view.byteLength, size: imageSize(bytes, img.mimeType) }
  })
  let minY = Infinity
  let maxY = -Infinity
  for (const mesh of json.meshes ?? [])
    for (const prim of mesh.primitives) {
      const acc = json.accessors[prim.attributes.POSITION]
      if (acc?.min && acc?.max) {
        minY = Math.min(minY, acc.min[1])
        maxY = Math.max(maxY, acc.max[1])
      }
    }
  const humanBones = v1 ? Object.keys(v1.humanoid?.humanBones ?? {}).length : (v0?.humanoid?.humanBones ?? []).length
  out.push({
    file: file.split('\\').join('/'),
    fileBytes: buf.length,
    generator: json.asset?.generator ?? null,
    extensionsUsed: json.extensionsUsed ?? [],
    vrmVersion: v1 ? '1' : v0 ? '0' : null,
    meta,
    humanBones,
    meshes: (json.meshes ?? []).length,
    materials: (json.materials ?? []).length,
    mtoon: (v0?.materialProperties ?? []).filter((m) => /MToon/i.test(m.shader ?? '')).length,
    images: images.length,
    imageBytes: images.reduce((s, x) => s + x.bytes, 0),
    largestImages: images
      .slice()
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 6),
    over1024: images.filter((x) => x.size && Math.max(...x.size) > 1024).length,
    bindPoseY: [Number(minY.toFixed(4)), Number(maxY.toFixed(4))],
    bindPoseHeightM: Number((maxY - minY).toFixed(4)),
  })
}
console.log(JSON.stringify(out, null, 2))
