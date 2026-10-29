// Headless physics harness for G1 TESTs (ref/06 §Lapisan, physics row). Runs inside vitexec, no rendering.
// Pattern: pmndrs-example:fortnite/vitexec/physics-framerate.ts, with project imports.
import { BvhPhysicsWorld } from '@pmndrs/viverse'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three'
import { createCharacterPhysicsPort } from '/src/physics/character-physics.ts'
import type { CharacterPhysicsOptions, CharacterPhysicsPort } from '/src/physics/character-physics.ts'
import { PlatformMotion } from '/src/level/motion.ts'
import type { Motion, Vec3 } from '/src/level/motion.ts'

export type HarnessBlock = {
  id: string
  size: Vec3
  pos: Vec3
  rotX?: number
  rotY?: number
  motion?: Motion
}

export type Harness = {
  world: BvhPhysicsWorld
  root: Group
  character: Object3D
  port: CharacterPhysicsPort
  motion: PlatformMotion
}

const invisible = new MeshBasicMaterial({ visible: false })

/** Closed box collider mesh, visible = true with an invisible material (D-013). */
export function colliderMesh(size: Vec3): Mesh {
  const mesh = new Mesh(new BoxGeometry(size[0], size[1], size[2]), invisible)
  mesh.geometry.computeBoundingBox()
  return mesh
}

/**
 * Builds a world from blocks: one static body for all static blocks, one kinematic body per moving block
 * (mover group ABOVE the body, ref/04 §Carry 1). Character feet at spawn.
 */
export function createHarness(
  blocks: readonly HarnessBlock[],
  spawn: Vec3 = [0, 0, 0],
  options: Partial<CharacterPhysicsOptions> = {},
): Harness {
  const world = new BvhPhysicsWorld()
  const root = new Group()
  const motion = new PlatformMotion(0)

  const statics = new Group()
  for (const b of blocks) {
    if (b.motion) continue
    const mesh = colliderMesh(b.size)
    mesh.position.fromArray(b.pos)
    mesh.rotation.set(b.rotX ?? 0, b.rotY ?? 0, 0, 'YXZ')
    statics.add(mesh)
  }
  root.add(statics)
  root.updateWorldMatrix(true, true)
  world.addBody(statics, false)

  for (const b of blocks) {
    if (!b.motion) continue
    const mover = new Group()
    const body = new Group()
    const collider = colliderMesh(b.size)
    body.add(collider)
    mover.add(body)
    root.add(mover)
    mover.position.fromArray(b.pos)
    mover.rotation.y = b.rotY ?? 0
    root.updateWorldMatrix(true, true)
    world.addBody(body, true)
    motion.register({ id: b.id, mover, body, collider, basePos: new Vector3().fromArray(b.pos), baseYaw: b.rotY ?? 0, motion: b.motion })
  }

  const character = new Object3D()
  root.add(character)
  character.position.fromArray(spawn)
  root.updateWorldMatrix(true, true)
  const port = createCharacterPhysicsPort(world, character, options, motion.nearKinematic)
  return { world, root, character, port, motion }
}

/** Steps the raw port n times with dt (no app clamp), returning per-step samples when asked. */
export function stepRaw(h: Harness, dt: number, n: number, onStep?: (i: number) => void): void {
  for (let i = 0; i < n; i++) {
    h.port.step(dt)
    onStep?.(i)
  }
}

export const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d

/** Logs a JSON result line and throws (vitexec exit 1) when ok is false. */
export function report(name: string, ok: boolean, data: unknown): void {
  console.log(`${name} ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(data)}`)
  if (!ok) throw new Error(`${name} failed: ${JSON.stringify(data)}`)
}
