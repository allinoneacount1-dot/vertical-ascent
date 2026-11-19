// Mode Odyssey 1000 m World Renderer (Fase 3 — Z5-Z8):
// Renders Z5 Kuil Awan (Torii + Updraft Thermals), Z6 Galangan Kapal Udara (kinematic airships),
// Z7 Menara Kristal Aether (glowing crystal spires), Z8 Taman Bintang (orbiting rings, Aurora & 1000 m Throne).
// Only mounted when game.odysseyMode is true; every zone is wrapped in AltitudeCullGroup for 60 FPS scaling.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  TorusGeometry,
  Vector3,
} from 'three'
import { BvhPhysicsBody, BvhPhysicsSensor } from '@react-three/viverse'
import type { LoadedLevel } from './levels.ts'
import {
  ODYSSEY_MOVERS,
  ODYSSEY_PLATFORMS,
  ODYSSEY_UPDRAFS,
  ODYSSEY_ZONE_BANDS,
} from './odyssey.ts'
import type { OdysseyMoverSpec, OdysseyPlatformSpec, OdysseyZone, UpdraftThermalSpec } from './odyssey.ts'
import { AltitudeCullGroup } from './ZoneVisibilityCuller.tsx'
import { sculpturalMaterial } from './sculptural.ts'
import { game } from '../game/game.ts'
import { useUi } from '../game/store.ts'

function OdysseyStaticPlatform({ spec }: { spec: OdysseyPlatformSpec }) {
  const [w, h, d] = spec.size
  const stoneMat = useMemo(() => sculpturalMaterial('ody-stone', '#dcd4c4', { roughness: 0.85, style: 'stone' }), [])
  const vermilionMat = useMemo(() => sculpturalMaterial('ody-torii', '#c83e32', { roughness: 0.72 }), [])
  const goldMat = useMemo(
    () => sculpturalMaterial('ody-gold', '#f4c45c', { roughness: 0.35, metalness: 0.55, emissive: '#ffaa22', emissiveIntensity: 0.55 }),
    [],
  )
  const dockMat = useMemo(() => sculpturalMaterial('ody-dock', '#9b6b43', { roughness: 0.86 }), [])
  const crystalMat = useMemo(
    () =>
      sculpturalMaterial('ody-crystal', '#7ce8ff', {
        roughness: 0.25,
        metalness: 0.2,
        emissive: '#38bdf8',
        emissiveIntensity: 0.75,
      }),
    [],
  )

  const mat =
    spec.kind === 'skyDock'
      ? dockMat
      : spec.kind === 'crystalSpire'
        ? crystalMat
        : spec.kind === 'celestialThrone'
          ? goldMat
          : stoneMat

  return (
    <group name={spec.id}>
      <group position={spec.pos} rotation={[0, spec.rotY, 0]}>
        <mesh material={mat} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
        </mesh>
        {spec.kind === 'toriiGate' && (
          <group position={[0, h / 2, 0]}>
            <mesh position={[-w * 0.38, 2.8, 0]} material={vermilionMat}>
              <cylinderGeometry args={[0.24, 0.28, 5.6, 10]} />
            </mesh>
            <mesh position={[w * 0.38, 2.8, 0]} material={vermilionMat}>
              <cylinderGeometry args={[0.24, 0.28, 5.6, 10]} />
            </mesh>
            <mesh position={[0, 5.5, 0]} material={vermilionMat}>
              <boxGeometry args={[w * 1.15, 0.45, 0.55]} />
            </mesh>
            <mesh position={[0, 4.65, 0]} material={goldMat}>
              <boxGeometry args={[w * 0.92, 0.28, 0.36]} />
            </mesh>
          </group>
        )}
        {spec.kind === 'crystalSpire' && (
          <mesh position={[0, -2.6, 0]} rotation={[Math.PI, 0, 0]} material={crystalMat}>
            <coneGeometry args={[w * 0.48, 4.6, 6]} />
          </mesh>
        )}
        {spec.kind === 'celestialThrone' && (
          <group position={[0, h / 2, 0]}>
            <mesh position={[0, 4.4, -3.5]} material={goldMat}>
              <torusGeometry args={[4.2, 0.32, 10, 32, Math.PI]} />
            </mesh>
            <mesh position={[-4.2, 2.2, -3.5]} material={stoneMat}>
              <cylinderGeometry args={[0.45, 0.55, 4.4, 10]} />
            </mesh>
            <mesh position={[4.2, 2.2, -3.5]} material={stoneMat}>
              <cylinderGeometry args={[0.45, 0.55, 4.4, 10]} />
            </mesh>
            <mesh position={[0, 6.2, -3.5]} material={crystalMat}>
              <octahedronGeometry args={[1.15, 0]} />
            </mesh>
          </group>
        )}
      </group>
      <BvhPhysicsBody>
        <mesh position={spec.pos} rotation={[0, spec.rotY, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
      {spec.kind === 'celestialThrone' && (
        <BvhPhysicsSensor onIntersectedChanged={(inside) => game.setInOdysseyFinish(inside)}>
          <mesh position={[spec.pos[0], spec.pos[1] + 2.4, spec.pos[2]]}>
            <boxGeometry args={[w * 0.85, 4.2, d * 0.85]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </BvhPhysicsSensor>
      )}
    </group>
  )
}

function UpdraftThermal({ spec }: { spec: UpdraftThermalSpec }) {
  const ringRef = useRef<Group>(null)
  const { cylGeo, ringGeo, colMat, ringMat } = useMemo(() => {
    const cylGeo = new CylinderGeometry(spec.radius * 0.88, spec.radius * 0.98, spec.height, 16, 1, true)
    const ringGeo = new TorusGeometry(spec.radius * 0.82, 0.08, 6, 20)
    ringGeo.rotateX(Math.PI / 2)
    const colMat = new MeshBasicMaterial({
      color: '#72eac0',
      transparent: true,
      opacity: 0.16,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    })
    const ringMat = new MeshBasicMaterial({
      color: '#ffd166',
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    return { cylGeo, ringGeo, colMat, ringMat }
  }, [spec.radius, spec.height])

  useEffect(
    () => () => {
      cylGeo.dispose()
      ringGeo.dispose()
      colMat.dispose()
      ringMat.dispose()
    },
    [cylGeo, ringGeo, colMat, ringMat],
  )

  useFrame(({ clock }) => {
    const g = ringRef.current
    if (g) {
      const u = (clock.elapsedTime * 0.55) % 1
      g.position.y = u * spec.height
      g.rotation.y = clock.elapsedTime * 1.8
    }
  })

  return (
    <group name={spec.id} position={spec.pos}>
      <mesh position={[0, spec.height / 2, 0]} geometry={cylGeo} material={colMat} />
      <group ref={ringRef}>
        <mesh geometry={ringGeo} material={ringMat} />
      </group>
    </group>
  )
}

function OdysseyMover({ spec }: { spec: OdysseyMoverSpec }) {
  const [w, h, d] = spec.size
  const moverRef = useRef<Group>(null)
  const bodyRef = useRef<Group>(null)
  const colRef = useRef<Mesh>(null)
  const propRef = useRef<Group>(null)

  const hullMat = useMemo(() => sculpturalMaterial('ody-airship-hull', '#8c5a3c', { roughness: 0.82 }), [])
  const balloonMat = useMemo(() => sculpturalMaterial('ody-airship-canvas', '#f2e8d5', { roughness: 0.88 }), [])
  const stripeMat = useMemo(() => sculpturalMaterial('ody-airship-stripe', '#c94a38', { roughness: 0.82 }), [])
  const orbitMat = useMemo(
    () =>
      sculpturalMaterial('ody-orbit-stone', '#a78bfa', {
        roughness: 0.35,
        metalness: 0.35,
        emissive: '#7c3aed',
        emissiveIntensity: 0.65,
      }),
    [],
  )

  useLayoutEffect(() => {
    const mover = moverRef.current
    const body = bodyRef.current
    const collider = colRef.current
    if (!mover || !body || !collider) return
    game.motion.register({
      id: spec.id,
      mover,
      body,
      collider,
      basePos: new Vector3(...spec.basePos),
      baseYaw: spec.baseYaw,
      motion: spec.motion,
    })
    return () => game.motion.unregister(spec.id)
  }, [spec])

  useFrame(({ clock }) => {
    if (propRef.current) propRef.current.rotation.z = clock.elapsedTime * 7.5
  })

  return (
    <group ref={moverRef} name={spec.id} position={spec.basePos} rotation={[0, spec.baseYaw, 0]}>
      <BvhPhysicsBody kinematic ref={bodyRef}>
        <mesh ref={colRef}>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
      {spec.kind === 'airship' ? (
        <group>
          <mesh material={hullMat} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
          </mesh>
          <mesh position={[0, 5.4, 0]} rotation={[Math.PI / 2, 0, 0]} material={balloonMat} castShadow>
            <capsuleGeometry args={[2.5, 6.2, 8, 16]} />
          </mesh>
          <mesh position={[0, 5.4, 0]} rotation={[Math.PI / 2, 0, 0]} material={stripeMat}>
            <torusGeometry args={[2.55, 0.22, 8, 20]} />
          </mesh>
          <group ref={propRef} position={[0, 0.8, -d / 2 - 0.35]}>
            <mesh material={hullMat}>
              <boxGeometry args={[2.8, 0.28, 0.14]} />
            </mesh>
            <mesh material={hullMat}>
              <boxGeometry args={[0.28, 2.8, 0.14]} />
            </mesh>
          </group>
        </group>
      ) : (
        <group>
          <mesh material={orbitMat} castShadow receiveShadow>
            <cylinderGeometry args={[w * 0.52, w * 0.42, h, 8]} />
          </mesh>
          <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]} material={orbitMat}>
            <torusGeometry args={[w * 0.56, 0.12, 8, 24]} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function AuroraRibbon() {
  const mat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#5eead4',
        emissive: '#34d399',
        emissiveIntensity: 1.4,
        transparent: true,
        opacity: 0.28,
        side: DoubleSide,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh name="odyssey-aurora" position={[55, 965, -45]} rotation={[0.18, 0.2, 0]} material={mat}>
      <torusGeometry args={[120, 4.5, 8, 48, Math.PI * 0.75]} />
    </mesh>
  )
}

export function OdysseyWorld({ level }: { level: LoadedLevel }) {
  const odysseyMode = useUi((s) => s.odysseyMode)
  if (level.id !== 'main' || !odysseyMode) return null

  return (
    <group name="odyssey-1000m-world">
      {(['z5', 'z6', 'z7', 'z8'] as const).map((zone: OdysseyZone) => {
        const [minY, maxY] = ODYSSEY_ZONE_BANDS[zone]
        return (
          <AltitudeCullGroup key={zone} id={`odyssey-${zone}`} minY={minY} maxY={maxY} marginM={145}>
            {ODYSSEY_PLATFORMS.filter((p) => p.zone === zone).map((spec) => (
              <OdysseyStaticPlatform key={spec.id} spec={spec} />
            ))}
            {ODYSSEY_UPDRAFS.filter((u) => u.zone === zone).map((spec) => (
              <UpdraftThermal key={spec.id} spec={spec} />
            ))}
            {ODYSSEY_MOVERS.filter((m) => m.zone === zone).map((spec) => (
              <OdysseyMover key={spec.id} spec={spec} />
            ))}
            {zone === 'z8' && <AuroraRibbon />}
          </AltitudeCullGroup>
        )
      })}
    </group>
  )
}
