// TEST-03 (DIRECTIVE §7, smoke+static, G2): Final character is not the mannequin; >= 1 texture with image.width > 0;
// bounding-box height in [1.5, 1.9] m; feet on the ground.
import { Box3, Mesh } from 'three'
import type { Material, Texture } from 'three'
import { game as liveGame } from '/src/game/game.ts'
import { ACTIVE_MODEL_OPTIONS } from '/src/character/rig.ts'
import { bootToPlaying, logRenderer, nextFrame, r3, sleep } from '/vitexec/lib/move-smoke.ts'

const out: Record<string, unknown> = { renderer: logRenderer(), url: ACTIVE_MODEL_OPTIONS.url }
const failures: string[] = []

await bootToPlaying()
for (let i = 0; i < 15; i++) await nextFrame()
await sleep(300)

const scene = liveGame.model?.scene
if (!scene) throw new Error('TEST-03 FAIL game.model.scene is null')
scene.updateMatrixWorld(true)

const box = new Box3()
let texWithImage = 0
let meshes = 0
const seen = new Set<Texture>()
scene.traverse((obj) => {
  const m = obj as Mesh
  if (!m.isMesh || !m.geometry) return
  meshes++
  m.geometry.computeBoundingBox()
  if (m.geometry.boundingBox) box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld))
  const mats: Material[] = Array.isArray(m.material) ? m.material : [m.material]
  for (const mat of mats) {
    const rec = mat as unknown as Record<string, unknown>
    for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap']) {
      const t = rec[k] as Texture | undefined
      if (t && !seen.has(t)) {
        seen.add(t)
        const img = t.image as { width?: number } | undefined
        if (img && Number(img.width) > 0) texWithImage++
      }
    }
  }
})
const height = r3(box.max.y - box.min.y)
const feetY = r3(box.min.y)

out.character = { meshes, texWithImage, heightM: height, feetY }
if (!ACTIVE_MODEL_OPTIONS.url || ACTIVE_MODEL_OPTIONS.url.includes('mannequin')) failures.push('still using mannequin')
if (texWithImage < 1) failures.push(`textures with image.width > 0 = ${texWithImage}`)
if (!(height >= 1.5 && height <= 1.9)) failures.push(`bbox height ${height} m outside [1.5, 1.9]`)

if (failures.length) {
  console.log('TEST-03 numbers ' + JSON.stringify(out))
  throw new Error('TEST-03 FAIL ' + failures.join('; '))
}
console.log('TEST-03 PASS ' + JSON.stringify(out))
