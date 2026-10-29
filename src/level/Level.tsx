// G1 blockout level (DIRECTIVE D-013, D-012, D-014): box colliders generated from data, visuals outside every
// BvhPhysicsBody, movers as groups ABOVE a kinematic body, a second camera-blocker world, and <WorldReady/>
// after all bodies. Collider meshes stay visible with an invisible material (bake uses traverseVisible).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import type { Object3D } from 'three'
import { BvhPhysicsBody, useBvhPhysicsWorld } from '@react-three/viverse'
import { BvhPhysicsWorld } from '@pmndrs/viverse'
import { BLOCKOUT } from './blockout.ts'
import type { Block } from './blockout.ts'
import { game } from '../game/game.ts'
import { CameraRig } from '../camera/camera-rig.ts'

const ROTATION_ORDER = 'YXZ'

function countTris(root: Object3D): number {
  let tris = 0
  root.traverseVisible((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    const index = m.geometry.getIndex()
    tris += (index ? index.count : m.geometry.getAttribute('position').count) / 3
  })
  return tris
}

const instrumented = new WeakSet<object>()

/** Times every addBody of a world (bake) into game.bvh and the event log (TEST-01, D-013 budget). */
function instrumentWorld(world: BvhPhysicsWorld, label: string): void {
  if (instrumented.has(world)) return
  instrumented.add(world)
  const original = world.addBody.bind(world)
  world.addBody = (object: Object3D, kinematic: boolean) => {
    const t0 = performance.now()
    original(object, kinematic)
    const ms = performance.now() - t0
    const name = `${label}:${object.name || object.uuid.slice(0, 8)}`
    const tris = countTris(object)
    game.bvh.buildMs[name] = Math.round(ms * 100) / 100
    game.bvh.tris[name] = tris
    game.log('bvhBuild', { name, ms: game.bvh.buildMs[name], tris, kinematic })
  }
}

function ColliderBox({ block }: { block: Block }) {
  return (
    <mesh position={block.pos} rotation={[block.rotX ?? 0, block.rotY ?? 0, 0, ROTATION_ORDER]}>
      <boxGeometry args={block.size} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

function BoxVisual({ block }: { block: Block }) {
  return (
    <mesh position={block.pos} rotation={[block.rotX ?? 0, block.rotY ?? 0, 0, ROTATION_ORDER]} castShadow receiveShadow>
      <boxGeometry args={block.size} />
      <meshStandardMaterial color={block.color} roughness={0.85} />
    </mesh>
  )
}

/** Visual stairs over the ramp collider (D-013: stairs are visual, the ramp collides). Rises toward -Z. */
function StairsVisual({ block }: { block: Block }) {
  const steps = 8
  const [w, h, d] = block.size
  const rise = h / steps
  const depth = d / steps
  const front = block.pos[2] + d / 2
  return (
    <group>
      {Array.from({ length: steps }, (_, i) => {
        const top = (i + 1) * rise
        return (
          <mesh key={i} position={[block.pos[0], top / 2, front - (i + 0.5) * depth]} castShadow receiveShadow>
            <boxGeometry args={[w, top, depth]} />
            <meshStandardMaterial color={block.color} roughness={0.9} />
          </mesh>
        )
      })}
    </group>
  )
}

function PoleVisual({ block }: { block: Block }) {
  return (
    <mesh position={block.pos} castShadow>
      <cylinderGeometry args={[block.size[0] / 2, block.size[0] / 2, block.size[1], 12]} />
      <meshStandardMaterial color={block.color} />
    </mesh>
  )
}

function Visual({ block }: { block: Block }) {
  if (block.kind === 'stairs') return <StairsVisual block={block} />
  if (block.kind === 'pole') return <PoleVisual block={block} />
  return <BoxVisual block={block} />
}

/** Moving platform: <group mover> <Visual/> <BvhPhysicsBody kinematic> <collider/> </BvhPhysicsBody> </group>. */
function Mover({ block }: { block: Block }) {
  const mover = useRef<Group>(null)
  const body = useRef<Object3D>(null)
  const collider = useRef<Mesh>(null)
  useLayoutEffect(() => {
    if (!mover.current || !body.current || !collider.current || !block.motion) return
    game.motion.register({
      id: block.id,
      mover: mover.current,
      body: body.current,
      collider: collider.current,
      basePos: new Vector3().fromArray(block.pos),
      baseYaw: block.rotY ?? 0,
      motion: block.motion,
    })
    return () => game.motion.unregister(block.id)
  }, [block])
  return (
    <group ref={mover}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={block.size} />
        <meshStandardMaterial color={block.color} roughness={0.7} />
      </mesh>
      <BvhPhysicsBody
        kinematic
        ref={(g) => {
          body.current = g
          if (g) g.name = block.id
        }}
      >
        <mesh ref={collider}>
          <boxGeometry args={block.size} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </group>
  )
}

/** Second world with simplified blocker hulls only (D-014); owns the camera rig. */
function CameraWorld() {
  useEffect(() => {
    const world = new BvhPhysicsWorld()
    instrumentWorld(world, 'camera')
    const root = new Group()
    root.name = 'g1-blockers'
    const material = new MeshBasicMaterial({ visible: false })
    for (const b of BLOCKOUT) {
      if (!b.cameraBlocker) continue
      const mesh = new Mesh(new BoxGeometry(b.size[0], b.size[1], b.size[2]), material)
      mesh.position.fromArray(b.pos)
      mesh.rotation.set(b.rotX ?? 0, b.rotY ?? 0, 0, ROTATION_ORDER)
      root.add(mesh)
    }
    root.updateWorldMatrix(true, true)
    world.addBody(root, false)
    const rig = new CameraRig(world)
    game.attachCameraRig(rig)
    return () => {
      if (game.cameraRig === rig) game.cameraRig = null
      rig.dispose()
    }
  }, [])
  return null
}

/** Rendered after every body of the zone, inside the same Suspense boundary (D-013). */
function WorldReady() {
  useEffect(() => {
    game.setWorldReady(true)
    return () => game.setWorldReady(false)
  }, [])
  return null
}

export function Level() {
  const world = useBvhPhysicsWorld()
  useMemo(() => instrumentWorld(world, 'physics'), [world])
  const statics = BLOCKOUT.filter((b) => b.collider && !b.motion)
  return (
    <>
      <BvhPhysicsBody
        ref={(g) => {
          if (g) g.name = 'g1-static'
        }}
      >
        {statics.map((b) => (
          <ColliderBox key={b.id} block={b} />
        ))}
      </BvhPhysicsBody>
      {BLOCKOUT.filter((b) => !b.motion).map((b) => (
        <Visual key={b.id} block={b} />
      ))}
      {BLOCKOUT.filter((b) => b.motion).map((b) => (
        <Mover key={b.id} block={b} />
      ))}
      <CameraWorld />
      <WorldReady />
    </>
  )
}
