// One-off G2 probe (ref/06 §Probe): AvatarSample_G (or _F with ?vrm=f) after scripts/vrm-textures.mjs, loaded from .cache with the
// library's own loaders — not from public/, because A5 waits for the owner's first-party CC0 text (D-045). Measures
// height, textures, the UAL1 clip retarget onto a VRM 0.x model (bone tracks, feet on the ground after posing) and
// renders a front/back preview into an overlay canvas for the screenshot. Not TEST evidence.
import * as THREE from 'three'
import { loadCharacterAnimation, loadCharacterModel } from '@pmndrs/viverse'
import type { VRM } from '@pixiv/three-vrm'
import { UAL1_BONE_MAP } from '/src/character/rig.ts'
import { assetUrl } from '/src/assets.ts'

// ?vrm=f selects AvatarSample_F (vitexec --path "?vrm=f"); default G
const which = new URLSearchParams(location.search).get('vrm') === 'f' ? 'F' : 'G'
const URL_CANDIDATES = [`/.cache/work/vroid-${which.toLowerCase()}/AvatarSample_${which}-1024.vrm`]
let url = ''
for (const u of URL_CANDIDATES) {
  const r = await fetch(u, { method: 'HEAD' })
  console.log('probe url ' + JSON.stringify({ u, status: r.status, type: r.headers.get('content-type') }))
  if (r.ok && !/text\/html/.test(r.headers.get('content-type') ?? '')) {
    url = u
    break
  }
}
if (!url) throw new Error('probe: the processed VRM is not served')

const model = (await loadCharacterModel(url, 'vrm', undefined, true, true)) as unknown as VRM & { height: number; mixer: THREE.AnimationMixer }
const textures = new Set<THREE.Texture>()
model.scene.traverse((o) => {
  const m = (o as THREE.Mesh).material
  for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
    for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) textures.add(v)
    const uniforms = (mat as THREE.ShaderMaterial).uniforms ?? {}
    for (const u of Object.values(uniforms)) if (u?.value instanceof THREE.Texture) textures.add(u.value)
  }
})
const texSizes = [...textures].map((t) => (t.image as { width?: number; height?: number } | undefined)?.width ?? 0)
const bone = (n: string) => model.humanoid.getRawBoneNode(n as never)
const y = (n: string) => bone(n)?.getWorldPosition(new THREE.Vector3()).y ?? NaN

model.scene.updateMatrixWorld(true)
const bind = { height: model.height, head: y('head'), hips: y('hips'), leftFoot: y('leftFoot'), rightFoot: y('rightFoot') }

const clips: Record<string, unknown> = {}
const posed: Record<string, unknown> = {}
for (const name of ['Idle_Loop', 'Walk_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land']) {
  const clip = await loadCharacterAnimation(model as never, assetUrl(`assets/_build-only/animations/ual1/${name}.glb`), 'gltf', true, undefined, undefined, UAL1_BONE_MAP)
  const bones = new Set(clip.tracks.map((t) => t.name.split('.')[0]))
  // retargeted = the track name now points at a node of the model (VRM normalized bone); an unmapped track keeps the
  // clip's name and binds to nothing, so the plain name count alone would not prove the retarget
  const bound = [...bones].filter((b) => model.scene.getObjectByName(b) != null)
  clips[name] = { tracks: clip.tracks.length, trackBones: bones.size, boundToModel: bound.length, unbound: [...bones].filter((b) => !bound.includes(b)), duration: Number(clip.duration.toFixed(3)) }
  if (name === 'Idle_Loop' || name === 'Walk_Loop') {
    model.mixer.stopAllAction()
    const action = model.mixer.clipAction(clip)
    action.play()
    model.mixer.update(clip.duration * 0.25)
    model.update(clip.duration * 0.25)
    model.scene.updateMatrixWorld(true)
    const box = new THREE.Box3()
    model.scene.traverseVisible((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) box.expandByObject(o, true)
    })
    posed[name] = { head: y('head'), hips: y('hips'), leftFoot: y('leftFoot'), rightFoot: y('rightFoot'), boxMinY: box.min.y, boxMaxY: box.max.y }
    action.stop()
  }
}

// preview: Idle pose — back, front and side views with the ground line (y = 0) in frame, into an overlay canvas
// (vitexec --screenshot captures the page); a red line marks y = 0 under the model
const idle = await loadCharacterAnimation(model as never, assetUrl('assets/_build-only/animations/ual1/Idle_Loop.glb'), 'gltf', true, undefined, undefined, UAL1_BONE_MAP)
model.mixer.clipAction(idle).play()
model.mixer.update(0.6)
model.update(0.6)
const canvas = document.createElement('canvas')
Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '9999', background: '#cfd8e3' })
document.body.appendChild(canvas)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(innerWidth, innerHeight, false)
renderer.setScissorTest(true)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#cfd8e3')
scene.add(new THREE.HemisphereLight('#ffffff', '#8899aa', 1.2), model.scene)
const sun = new THREE.DirectionalLight('#ffffff', 2)
sun.position.set(2, 4, 3)
scene.add(sun)
const grid = new THREE.GridHelper(4, 8, '#556677', '#99aabb')
scene.add(grid)
const groundLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.6, 0, 0), new THREE.Vector3(0.6, 0, 0), new THREE.Vector3(0, 0, -0.6), new THREE.Vector3(0, 0, 0.6)]),
  new THREE.LineBasicMaterial({ color: '#d02020', depthTest: false }),
)
scene.add(groundLine)
const views: Array<[number, number, number]> = [
  [0, 0.9, 3.4], // back of the model (it faces -Z in its own space)
  [0, 0.9, -3.4], // front
  [3.4, 0.9, 0], // side
]
const w3 = innerWidth / 3
for (const [i, [px, py, pz]] of views.entries()) {
  const cam = new THREE.PerspectiveCamera(34, w3 / innerHeight, 0.1, 50)
  cam.position.set(px, py, pz)
  cam.lookAt(0, 0.85, 0)
  renderer.setViewport(i * w3, 0, w3, innerHeight)
  renderer.setScissor(i * w3, 0, w3, innerHeight)
  renderer.render(scene, cam)
}
console.log('vroid ' + JSON.stringify({ which, url, metaVersion: model.meta.metaVersion, bind, textures: textures.size, texturesWithWidth: texSizes.filter((w) => w > 0).length, maxTextureWidth: Math.max(...texSizes), clips, posed }))
