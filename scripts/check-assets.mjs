#!/usr/bin/env node
// Asset gate (DIRECTIVE D-016; ref/05 §Script, §Pipeline per kelas file): every file under public/ has an
// ASSET_MANIFEST.md row (column "path") whose integration_status is not UNKNOWN; every .glb/.gltf/.vrm is inspected
// (generator, extensionsUsed, animation names, VRM meta). Fails on: restrictive VRM meta, meshopt/quantization in
// public/assets/animations/ or any .vrm, forbidden upstream example file names, missing manifest rows.
//   node scripts/check-assets.mjs [--json]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const FORBIDDEN = /(^|\/)(avatar\.vrm|jog-[^/]*|aim-[^/]*|pistol-[^/]*|map\.glb|muzzleflash\.png|pose\.glb|laying\.fbx|sword\.gltf|sample\.bvh|viverse-logo\.png)$/i
const COMPRESSION = ['EXT_meshopt_compression', 'KHR_mesh_quantization']

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

/** Reads the glTF JSON of a .glb/.vrm (binary container) or a .gltf (text). */
function gltfJson(path) {
  const buf = readFileSync(path)
  if (path.toLowerCase().endsWith('.gltf')) return JSON.parse(buf.toString('utf8'))
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (magic)')
  const jsonLen = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('first chunk is not JSON')
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
}

function vrmProblems(json) {
  const problems = []
  const v0 = json.extensions?.VRM?.meta
  if (v0) {
    if (v0.licenseName === 'Redistribution_Prohibited') problems.push('VRM0 licenseName Redistribution_Prohibited')
    if (v0.commercialUssageName === 'Disallow') problems.push('VRM0 commercialUssageName Disallow')
    if (v0.allowedUserName === 'OnlyAuthor') problems.push('VRM0 allowedUserName OnlyAuthor')
  }
  const v1 = json.extensions?.VRMC_vrm?.meta
  if (v1) {
    if (v1.allowRedistribution === false) problems.push('VRM1 allowRedistribution false')
    if (v1.commercialUsage === 'personalNonProfit') problems.push('VRM1 commercialUsage personalNonProfit')
    if (v1.avatarPermission === 'onlyAuthor') problems.push('VRM1 avatarPermission onlyAuthor')
    if (v1.modification === 'prohibited') problems.push('VRM1 modification prohibited (fails only if modified; review)')
  }
  return problems
}

// manifest rows by path
const manifest = new Map()
const lines = readFileSync('ASSET_MANIFEST.md', 'utf8').split(/\r?\n/)
const header = lines.find((l) => l.startsWith('| id | path |'))
const cols = header ? header.split('|').map((c) => c.trim()) : []
const statusCol = cols.indexOf('integration_status')
for (const l of lines) {
  if (!l.startsWith('| ') || l.startsWith('| id |') || l.startsWith('|---')) continue
  const cells = l.split('|').map((c) => c.trim())
  manifest.set(cells[2], { id: cells[1], status: statusCol > 0 ? cells[statusCol] : '' })
}

const failures = []
const files = walk('public').map((p) => relative('.', p).split(sep).join('/'))
const report = []
for (const f of files) {
  const row = manifest.get(f)
  const entry = { path: f, manifest: row?.id ?? null }
  if (!row) failures.push(`${f}: no ASSET_MANIFEST.md row`)
  else if (/UNKNOWN/i.test(row.status)) failures.push(`${f}: manifest status UNKNOWN`)
  if (FORBIDDEN.test(f)) failures.push(`${f}: forbidden upstream example file name`)
  if (/\.(glb|gltf|vrm)$/i.test(f)) {
    try {
      const json = gltfJson(f)
      const ext = json.extensionsUsed ?? []
      Object.assign(entry, { generator: json.asset?.generator ?? null, extensionsUsed: ext, animations: (json.animations ?? []).map((a) => a.name) })
      const isVrm = f.toLowerCase().endsWith('.vrm') || ext.includes('VRM') || ext.includes('VRMC_vrm')
      if ((isVrm || f.startsWith('public/assets/animations/')) && ext.some((e) => COMPRESSION.includes(e))) failures.push(`${f}: meshopt/quantization not allowed for VRM or animation clips`)
      const vp = vrmProblems(json)
      if (vp.length) {
        entry.vrmProblems = vp
        failures.push(`${f}: ${vp.join(', ')}`)
      }
    } catch (err) {
      failures.push(`${f}: unreadable glTF (${err.message})`)
    }
  }
  report.push(entry)
}
console.log('check-assets ' + JSON.stringify({ files: files.length, manifestRows: manifest.size, report }))
for (const x of failures) console.log('FAIL ' + x)
if (failures.length) {
  console.log('CHECK-ASSETS FAIL')
  process.exit(1)
}
console.log('CHECK-ASSETS PASS')
