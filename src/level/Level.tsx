// Level renderer (DIRECTIVE D-013, D-012, D-014; ref/04 §Collider, sensor, finish): box colliders generated from
// level data, procedural visuals outside every BvhPhysicsBody, movers as groups ABOVE a kinematic body, a second
// camera-blocker world, the finish sensor, and <WorldReady/> after all bodies. Collider meshes stay visible with an
// invisible material (bake uses traverseVisible).
import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BoxGeometry, ConeGeometry, DoubleSide, Euler, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, TorusGeometry, Vector3 } from 'three'
import type { Object3D } from 'three'
import { BvhPhysicsBody, BvhPhysicsSensor, useBvhPhysicsWorld } from '@react-three/viverse'
import { BvhPhysicsWorld } from '@pmndrs/viverse'
import type { LoadedLevel } from './levels.ts'
import type { PlatformEntry, Prefab } from './schema.ts'
import type { Vec3 } from './motion.ts'
import { game } from '../game/game.ts'
import { CameraRig } from '../camera/camera-rig.ts'
import { buildMergedStatics, colliderSize, localPieces, materialFor } from './procedural.ts'
import { SummitFeatures } from './Summit.tsx'
import { ChallengeObjects } from './ChallengeObjects.tsx'
import { SculpturalObjects } from './SculpturalObjects.tsx'
import { WorldVista } from './WorldVista.tsx'
import { LivingWorld } from './LivingWorld.tsx'
import { BiomeLandmarks } from './BiomeLandmarks.tsx'
import { DynamicWorld } from './DynamicWorld.tsx'
import { CloudSea } from './CloudSea.tsx'
import { SkyRelics } from './SkyRelics.tsx'
import { GhostRacer } from './GhostRacer.tsx'
import { RemotePlayers } from './RemotePlayers.tsx'
import { CharacterVfx } from '../character/CharacterVfx.tsx'
import { CharacterJuice } from './CharacterJuice.tsx'
const LazyOdysseyWorld = lazy(() => import('./OdysseyWorld.tsx').then((m) => ({ default: m.OdysseyWorld })))
import { PersonalBestFlag } from './PersonalBestFlag.tsx'

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

/** A mover's visual (not merged: it moves), built from the same pieces as the static visuals, plus animated Anemo levitation rings for lifts/movers. */
function MoverVisual({ prefab }: { prefab: Prefab }) {
  const isAnemoMover = prefab.id === 'lift-l' || prefab.id === 'mover-m'
  const isLift = prefab.id === 'lift-l'
  const outerRingRef = useRef<Mesh>(null)
  const innerRingRef = useRef<Mesh>(null)
  const updraftRef = useRef<Mesh>(null)

  const { group, geos } = useMemo(() => {
    const g = new Group()
    const createdGeos: Array<{ dispose: () => void }> = []
    for (const p of localPieces(prefab)) {
      const m = new Mesh(p.geometry, materialFor(p))
      m.castShadow = p.emissive == null
      m.receiveShadow = true
      g.add(m)
      createdGeos.push(p.geometry)
    }
    return { group: g, geos: createdGeos }
  }, [prefab])

  const levitation = useMemo(() => {
    if (!isAnemoMover) return null
    const rOuter = isLift ? 1.65 : 1.18
    const rInner = isLift ? 1.05 : 0.74
    const outerGeo = new TorusGeometry(rOuter, 0.055, 8, 24)
    outerGeo.rotateX(Math.PI / 2)
    const innerGeo = new TorusGeometry(rInner, 0.04, 6, 20)
    innerGeo.rotateX(Math.PI / 2)
    const coneGeo = new ConeGeometry(isLift ? 1.55 : 1.05, isLift ? 2.1 : 1.4, 14, 1, true)
    const goldMat = new MeshStandardMaterial({
      color: '#f0c55e',
      emissive: '#c9932c',
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.68,
    })
    const cyanMat = new MeshStandardMaterial({
      color: '#a8fff2',
      emissive: '#38e0cc',
      emissiveIntensity: 1.5,
      roughness: 0.2,
    })
    const updraftMat = new MeshBasicMaterial({
      color: '#7ef5e2',
      transparent: true,
      opacity: 0.16,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    })
    return { outerGeo, innerGeo, coneGeo, goldMat, cyanMat, updraftMat }
  }, [isAnemoMover, isLift])

  useEffect(
    () => () => {
      for (const g of geos) g.dispose()
      if (levitation) {
        levitation.outerGeo.dispose()
        levitation.innerGeo.dispose()
        levitation.coneGeo.dispose()
        levitation.goldMat.dispose()
        levitation.cyanMat.dispose()
        levitation.updraftMat.dispose()
      }
    },
    [geos, levitation],
  )

  useFrame(({ clock }) => {
    if (!isAnemoMover) return
    const t = clock.elapsedTime
    if (outerRingRef.current) {
      outerRingRef.current.rotation.y = t * 0.9
      outerRingRef.current.rotation.x = Math.sin(t * 1.4) * 0.06
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.y = -t * 1.6
    }
    if (updraftRef.current) {
      const pulse = 0.92 + Math.sin(t * 3.4) * 0.08
      updraftRef.current.scale.set(pulse, 1, pulse)
    }
  })

  return (
    <group>
      <primitive object={group} />
      {levitation && (
        <group>
          <mesh ref={outerRingRef} position={[0, -0.34, 0]} geometry={levitation.outerGeo} material={levitation.goldMat} />
          <mesh ref={innerRingRef} position={[0, -0.56, 0]} geometry={levitation.innerGeo} material={levitation.cyanMat} />
          <mesh ref={updraftRef} position={[0, isLift ? -1.35 : -0.95, 0]} geometry={levitation.coneGeo} material={levitation.updraftMat} />
        </group>
      )}
    </group>
  )
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
  useEffect(() => {
    game.visualRoot = root
    return () => {
      if (game.visualRoot === root) game.visualRoot = null
    }
  }, [root])
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
  useLayoutEffect(() => {
    instrumentWorld(world, 'physics')
  }, [world])
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
      <ChallengeObjects level={level} />
      <SculpturalObjects level={level} />
      <WorldVista level={level} />
      <LivingWorld level={level} />
      <BiomeLandmarks level={level} />
      <DynamicWorld level={level} />
      <CloudSea level={level} />
      <SkyRelics level={level} />
      <GhostRacer level={level} />
      <RemotePlayers />
      <CharacterVfx />
      <CharacterJuice />
      <Suspense fallback={null}>
        <LazyOdysseyWorld level={level} />
      </Suspense>
      <PersonalBestFlag level={level} />
      <FinishSensor level={level} />
      <SummitFeatures level={level} />
      <CameraWorld level={level} />
      <WorldReady />
    </>
  )
}
