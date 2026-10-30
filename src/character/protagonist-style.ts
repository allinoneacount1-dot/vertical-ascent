// D-017 silhouette change for the protagonist: one primitive accessory, a climbing pack, on the upper-chest bone.
// The colour change is baked into the model file (scripts/vrm-textures.mjs --filter, D-051); this adds the shape.
// Placement uses the library's hidden rest-pose clone (`rest_<bone>`, added by loadCharacterModel), so it is right
// even when the model is already animated or moved: the pack sits `back` metres behind the bone in model space.
import { BoxGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import type { Object3D } from 'three'

/** Palette tokens (GAME_DESIGN.md §Protagonist). */
export const PACK_COLORS = Object.freeze({ body: '#4b3a2c', trim: '#d8b56a' })

const PACK_NAME = 'protagonist-pack'

type Humanoid = { getRawBoneNode(name: 'chest' | 'upperChest'): Object3D | null }

/**
 * Builds the pack and parents it to the raw upper-chest bone (chest when the rig has no upper chest).
 * The model faces -Z in its own space (VRM 0.x), so "behind" is +Z. Returns the pack group.
 */
export function addClimbingPack(scene: Object3D, humanoid: Humanoid, back = 0.12, drop = 0.13): Group {
  const bone = humanoid.getRawBoneNode('upperChest') ?? humanoid.getRawBoneNode('chest')
  const rest = bone == null ? undefined : scene.getObjectByName(`rest_${bone.name}`)
  if (bone == null || rest == null) throw new Error('addClimbingPack: no chest bone or rest-pose clone')
  // the loaded model is cached by the loader key (D-001), so a remount must not add a second pack
  const existing = bone.getObjectByName(PACK_NAME)
  if (existing instanceof Group) return existing
  scene.updateMatrixWorld(true)
  const restInScene = scene.matrixWorld.clone().invert().multiply(rest.matrixWorld)
  const at = new Vector3().setFromMatrixPosition(restInScene)
  const packInScene = new Matrix4().makeTranslation(at.x, at.y - drop, at.z + back)
  const local = restInScene.clone().invert().multiply(packInScene)

  const body = new MeshStandardMaterial({ color: PACK_COLORS.body, roughness: 0.9 })
  const trim = new MeshStandardMaterial({ color: PACK_COLORS.trim, roughness: 0.8 })
  const pack = new Group()
  pack.name = PACK_NAME
  const bag = new Mesh(new BoxGeometry(0.26, 0.34, 0.12), body)
  const flap = new Mesh(new BoxGeometry(0.27, 0.1, 0.13), trim)
  flap.position.set(0, 0.13, 0.005)
  const roll = new Mesh(new CylinderGeometry(0.05, 0.05, 0.3, 12), trim)
  roll.rotation.z = Math.PI / 2
  roll.position.set(0, 0.22, 0)
  for (const m of [bag, flap, roll]) {
    m.castShadow = true
    m.receiveShadow = true
    pack.add(m)
  }
  local.decompose(pack.position, pack.quaternion, pack.scale)
  bone.add(pack)
  return pack
}
