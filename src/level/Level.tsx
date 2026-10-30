// Level renderer (DIRECTIVE D-013, D-012, D-014; ref/04 §Collider, sensor, finish): box colliders generated from
// level data, procedural visuals outside every BvhPhysicsBody, movers as groups ABOVE a kinematic body, a second
// camera-blocker world, the finish sensor, and <WorldReady/> after all bodies. Collider meshes stay visible with an
// invisible material (bake uses traverseVisible).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Euler, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import type { Object3D } from 'three'
import { BvhPhysicsBody, BvhPhysicsSensor, useBvhPhysicsWorld } from '@react-three/viverse'
import { BvhPhysicsWorld } from '@pmndrs/viverse'
import type { LoadedLevel } from './levels.ts'
import type { PlatformEntry, Prefab } from './schema.ts'
import type { Vec3 } from './motion.ts'
import { game } from '../game/game.ts'
import { CameraRig } from '../camera/camera-rig.ts'
import { buildMergedStatics, colliderSize, localPieces, materialFor } from './procedural.ts'

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

/** Collider centre in world space for a static entry (pos + rotated offset). */
function colliderCentre(e: PlatformEntry, p: Prefab): Vec3 {
  const o = p.collider?.offset ?? [0, 0, 0]
  const v = new Vector3(o[0] * p.scale, o[1] * p.scale, o[2] * p.scale).applyEuler(new Euler(e.rotX ?? 0, e.rotY, 0, ROTATION_ORDER))
  return [e.pos[0] + v.x, e.pos[1] + v.y, e.pos[2] + v.z]
}

function ColliderBox({ size, position, rotation }: { size: Vec3; position: Vec3; rotation: [number, number, number, 'YXZ'] }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

/** A mover's visual (not merged: it moves), built from the same pieces as the static visuals. */
function MoverVisual({ prefab }: { prefab: Prefab }) {
  const group = useMemo(() => {
    const g = new Group()
    for (const p of localPieces(prefab)) {
      const m = new Mesh(p.geometry, materialFor(p))
      m.castShadow = p.emissive == null
      m.receiveShadow = true
      g.add(m)
    }
    return g
  }, [prefab])
  return <primitive object={group} />
}

/** All static visuals of the level merged into one mesh per material (procedural.ts). */
function MergedStatics({ level }: { level: LoadedLevel }) {
  const root = useMemo(() => {
    const g = new Group()
    g.name = `${level.id}-visuals`
    const meshes = buildMergedStatics(level.data.platforms, level.prefabs, g)
    game.log('mergedStatics', { meshes, entries: level.data.platforms.length })
    return g
  }, [level])
  return <primitive object={root} />
}

/** Moving entry: <group mover> <Visual/> <BvhPhysicsBody kinematic> <collider/> </BvhPhysicsBody> </group>. */
function Mover({ entry, prefab }: { entry: PlatformEntry; prefab: Prefab }) {
  const mover = useRef<Group>(null)
  const body = useRef<Object3D>(null)
  const collider = useRef<Mesh>(null)
  const offset = prefab.collider!.offset
  useLayoutEffect(() => {
    if (!mover.current || !body.current || !collider.current || !entry.motion) return
    game.motion.register({
      id: entry.id,
      mover: mover.current,
      body: body.current,
      collider: collider.current,
      basePos: new Vector3().fromArray(entry.pos),
      baseYaw: entry.rotY,
      motion: entry.motion,
    })
    return () => game.motion.unregister(entry.id)
  }, [entry])
  return (
    <group ref={mover}>
      <group position={[offset[0] * prefab.scale, offset[1] * prefab.scale, offset[2] * prefab.scale]}>
        <MoverVisual prefab={prefab} />
      </group>
      <BvhPhysicsBody
        kinematic
        ref={(g) => {
          body.current = g
          if (g) g.name = entry.id
        }}
      >
        <mesh ref={collider} position={[offset[0] * prefab.scale, offset[1] * prefab.scale, offset[2] * prefab.scale]}>
          <boxGeometry args={colliderSize(prefab)} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </group>
  )
}

/** Second world with simplified blocker hulls only (D-014); owns the camera rig. */
function CameraWorld({ level }: { level: LoadedLevel }) {
  useEffect(() => {
    const world = new BvhPhysicsWorld()
    instrumentWorld(world, 'camera')
    const root = new Group()
    root.name = `${level.id}-blockers`
    const material = new MeshBasicMaterial({ visible: false })
    for (const e of level.data.platforms) {
      const p = level.prefabs.get(e.prefab)
      if (p?.collider == null || e.motion != null) continue
      const blocker = e.cameraBlocker ?? (p.walkable && e.tag !== 'hazard')
      if (!blocker) continue
      const s = colliderSize(p)
      const mesh = new Mesh(new BoxGeometry(s[0], s[1], s[2]), material)
      mesh.position.fromArray(colliderCentre(e, p))
      mesh.rotation.set(e.rotX ?? 0, e.rotY, 0, ROTATION_ORDER)
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
  }, [level])
  return null
}

/** Finish sensor: closed box 0.1 m wider than the finish collider, top +0.3 m (ref/04 §Collider, sensor, finish). */
function FinishSensor({ level }: { level: LoadedLevel }) {
  const entry = level.data.platforms.find((p) => p.id === level.data.finish)
  const prefab = entry ? level.prefabs.get(entry.prefab) : undefined
  if (entry == null || prefab?.collider == null) return null
  const [w, h, d] = colliderSize(prefab)
  const c = colliderCentre(entry, prefab)
  return (
    <BvhPhysicsSensor onIntersectedChanged={(inside) => game.setInFinish(inside)}>
      <mesh position={[c[0], c[1] + 0.15, c[2]]} rotation={[0, entry.rotY, 0, ROTATION_ORDER]}>
        <boxGeometry args={[w + 0.1, h + 0.3, d + 0.1]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </BvhPhysicsSensor>
  )
}

/** Rendered after every body of the zone, inside the same Suspense boundary (D-013). */
function WorldReady() {
  useEffect(() => {
    game.setWorldReady(true)
    return () => game.setWorldReady(false)
  }, [])
  return null
}

export function Level({ level }: { level: LoadedLevel }) {
  const world = useBvhPhysicsWorld()
  useMemo(() => instrumentWorld(world, 'physics'), [world])
  const entries = level.data.platforms
  const prefabOf = (e: PlatformEntry) => level.prefabs.get(e.prefab)!
  const statics = entries.filter((e) => e.motion == null && prefabOf(e).collider != null)
  return (
    <>
      <BvhPhysicsBody
        ref={(g) => {
          if (g) g.name = `${level.id}-static`
        }}
      >
        {statics.map((e) => (
          <ColliderBox key={e.id} size={colliderSize(prefabOf(e))} position={colliderCentre(e, prefabOf(e))} rotation={[e.rotX ?? 0, e.rotY, 0, ROTATION_ORDER]} />
        ))}
      </BvhPhysicsBody>
      <MergedStatics level={level} />
      {entries
        .filter((e) => e.motion != null)
        .map((e) => (
          <Mover key={e.id} entry={e} prefab={prefabOf(e)} />
        ))}
      <FinishSensor level={level} />
      <CameraWorld level={level} />
      <WorldReady />
    </>
  )
}
