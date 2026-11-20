// Sculptural Ghibli Non-Box Objects (z1-z4):
// Renders all 6 organic procedural structure families with fair flat-top proxy colliders and shared materials.
// Mounted only on the 'main' 500 m world so slice/g1-blockout tests remain completely untouched.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderGeometry, Group, InstancedMesh, Mesh, Object3D, Vector3 } from 'three'
import { BvhPhysicsBody } from '@react-three/viverse'
import type { LoadedLevel } from './levels.ts'
import type { Motion } from './motion.ts'
import {
  SCULPTURAL_SPECS,
  brokenArchSteps,
  buildBeveledPlankGeometry,
  buildBridgeRopeGeometry,
  buildBrokenArchSegmentGeometry,
  buildFacetedRockGeometries,
  buildGearWheelGeometry,
  buildGiantRootTubeGeometry,
  buildLanternBodyGeometry,
  buildLanternRoofGeometry,
  buildLeafGeometry,
  buildWedgeStepGeometry,
  giantRootSteps,
  ropeBridgePlanks,
  sculpturalMaterial,
  spiralStairSteps,
} from './sculptural.ts'
import type {
  BrokenArchSpec,
  FacetedRockSpec,
  GiantRootSpec,
  PendulumLanternSpec,
  RopeBridgeSpec,
  SpiralStairsSpec,
  VerticalGearSpec,
} from './sculptural.ts'
import { game } from '../game/game.ts'
import { AltitudeCullGroup } from './ZoneVisibilityCuller.tsx'

const ROTATION_ORDER = 'YXZ' as const

// ---- 1. Broken Stone Spiral Stairs (z1-z2) ----

function SpiralStairs({ spec }: { spec: SpiralStairsSpec }) {
  const steps = useMemo(() => spiralStairSteps(spec), [spec])
  const arcPerStep = spec.totalSweepRad / spec.stepCount
  const isCelestial = spec.zone === 'z3' || spec.zone === 'z4'
  const wedgeGeo = useMemo(
    () => buildWedgeStepGeometry(spec.towerRadius - 0.15, spec.outerRadius, arcPerStep * 0.94, 0.38),
    [spec.towerRadius, spec.outerRadius, arcPerStep],
  )
  const trimGeo = useMemo(
    () => buildWedgeStepGeometry(spec.outerRadius - 0.22, spec.outerRadius + 0.04, arcPerStep * 0.94, 0.08),
    [spec.outerRadius, arcPerStep],
  )
  const stoneMat = useMemo(
    () => sculpturalMaterial(isCelestial ? 'spiral-marble' : 'spiral-stone', isCelestial ? '#efeae0' : '#9f988c', { roughness: isCelestial ? 0.65 : 0.9, style: isCelestial ? 'marble' : 'stone' }),
    [isCelestial],
  )
  const mossMat = useMemo(
    () => sculpturalMaterial(isCelestial ? 'spiral-gold' : 'spiral-moss', isCelestial ? '#e3b856' : '#84b07e', { roughness: isCelestial ? 0.35 : 0.88, metalness: isCelestial ? 0.55 : 0, style: isCelestial ? 'trim' : 'moss' }),
    [isCelestial],
  )
  const towerMat = useMemo(
    () => sculpturalMaterial(isCelestial ? 'spiral-tower-cel' : 'spiral-tower', isCelestial ? '#d9d0be' : '#857d72', { roughness: 0.9, style: isCelestial ? 'marble' : 'stone' }),
    [isCelestial],
  )
  const beaconMat = useMemo(
    () => sculpturalMaterial('spiral-beacon', '#a6fff0', { emissive: '#38d9c8', roughness: 0.25 }),
    [],
  )

  const wedgeInstRef = useRef<InstancedMesh>(null)
  const trimInstRef = useRef<InstancedMesh>(null)

  useEffect(() => {
    const dummy = new Object3D()
    if (wedgeInstRef.current && trimInstRef.current) {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i]
        dummy.position.set(spec.pos[0], s.pos[1], spec.pos[2])
        dummy.rotation.set(0, s.angle, 0, ROTATION_ORDER)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        wedgeInstRef.current.setMatrixAt(i, dummy.matrix)

        dummy.position.set(spec.pos[0], s.pos[1] + 0.17, spec.pos[2])
        dummy.updateMatrix()
        trimInstRef.current.setMatrixAt(i, dummy.matrix)
      }
      wedgeInstRef.current.instanceMatrix.needsUpdate = true
      trimInstRef.current.instanceMatrix.needsUpdate = true
    }
  }, [steps, spec.pos])

  useEffect(
    () => () => {
      wedgeGeo.dispose()
      trimGeo.dispose()
    },
    [wedgeGeo, trimGeo],
  )

  return (
    <group name={spec.id}>
      {/* Central mossy/celestial stone tower cylinder */}
      <mesh position={[spec.pos[0], spec.pos[1] + spec.towerHeight / 2, spec.pos[2]]} material={towerMat} castShadow receiveShadow>
        <cylinderGeometry args={[spec.towerRadius * 0.96, spec.towerRadius * 1.05, spec.towerHeight, 14]} />
      </mesh>
      <mesh position={[spec.pos[0], spec.pos[1] + spec.towerHeight + 0.15, spec.pos[2]]} material={mossMat} receiveShadow>
        <cylinderGeometry args={[spec.towerRadius * 1.15, spec.towerRadius * 0.96, 0.32, 14]} />
      </mesh>
      {/* Top Anemo guide beacon ring */}
      <mesh position={[spec.pos[0], spec.pos[1] + spec.towerHeight + 0.36, spec.pos[2]]} rotation={[Math.PI / 2, 0, 0]} material={beaconMat}>
        <torusGeometry args={[spec.towerRadius * 0.95, 0.08, 6, 20]} />
      </mesh>
      {/* Instanced curved wedge steps around the tower (only 2 draw calls per tower!) */}
      <instancedMesh ref={wedgeInstRef} args={[wedgeGeo, stoneMat, steps.length]} castShadow receiveShadow />
      <instancedMesh ref={trimInstRef} args={[trimGeo, mossMat, steps.length]} receiveShadow />
      {/* Fair flat-top proxy colliders */}
      <BvhPhysicsBody>
        <mesh position={[spec.pos[0], spec.pos[1] + spec.towerHeight / 2, spec.pos[2]]}>
          <cylinderGeometry args={[spec.towerRadius, spec.towerRadius, spec.towerHeight, 10]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        {steps.map((s) => (
          <mesh key={s.id} position={s.pos} rotation={[0, s.rotY, 0, ROTATION_ORDER]}>
            <boxGeometry args={s.size} />
            <meshBasicMaterial visible={false} />
          </mesh>
        ))}
      </BvhPhysicsBody>
    </group>
  )
}

// ---- 2. Swaying Rope Bridge (z1-z2) ----

function SwayPlank({
  id,
  pos,
  size,
  rotY,
  motion,
  plankGeo,
}: {
  id: string
  pos: [number, number, number]
  size: [number, number, number]
  rotY: number
  motion: Motion
  plankGeo: ReturnType<typeof buildBeveledPlankGeometry>
}) {
  const moverRef = useRef<Group>(null)
  const bodyRef = useRef<Object3D>(null)
  const colliderRef = useRef<Mesh>(null)
  const woodMat = useMemo(() => sculpturalMaterial('bridge-wood', '#9c6b43', { roughness: 0.85, style: 'trim' }), [])
  const rimMat = useMemo(() => sculpturalMaterial('bridge-rim', '#e3b868', { roughness: 0.72 }), [])

  useLayoutEffect(() => {
    if (!moverRef.current || !bodyRef.current || !colliderRef.current) return
    game.motion.register({
      id,
      mover: moverRef.current,
      body: bodyRef.current,
      collider: colliderRef.current,
      basePos: new Vector3().fromArray(pos),
      baseYaw: rotY,
      motion,
    })
    return () => game.motion.unregister(id)
  }, [id, pos, rotY, motion])

  return (
    <group ref={moverRef} position={pos} rotation={[0, rotY, 0, ROTATION_ORDER]}>
      <mesh geometry={plankGeo} material={woodMat} castShadow receiveShadow />
      <mesh position={[0, size[1] / 2 + 0.015, 0]} material={rimMat} receiveShadow>
        <boxGeometry args={[size[0] * 0.96, 0.03, 0.08]} />
      </mesh>
      <BvhPhysicsBody
        kinematic
        ref={(g) => {
          bodyRef.current = g
          if (g) g.name = id
        }}
      >
        <mesh ref={colliderRef}>
          <boxGeometry args={size} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </group>
  )
}

function RopeBridge({ spec }: { spec: RopeBridgeSpec }) {
  const planks = useMemo(() => ropeBridgePlanks(spec), [spec])
  const staticPlanks = useMemo(() => planks.filter((p) => !p.kinematic), [planks])
  const swayPlanks = useMemo(() => planks.filter((p) => p.kinematic && p.motion != null), [planks])
  const plankD = planks[0]?.size[2] ?? 0.85
  const plankGeo = useMemo(() => buildBeveledPlankGeometry(spec.plankWidth, 0.24, plankD), [spec.plankWidth, plankD])

  const ropes = useMemo(() => {
    const hw = spec.plankWidth / 2 + 0.08
    return [
      buildBridgeRopeGeometry(spec, -hw, 0.95),
      buildBridgeRopeGeometry(spec, hw, 0.95),
      buildBridgeRopeGeometry(spec, -hw, -0.08),
      buildBridgeRopeGeometry(spec, hw, -0.08),
    ]
  }, [spec])

  const woodMat = useMemo(() => sculpturalMaterial('bridge-wood', '#9c6b43', { roughness: 0.85, style: 'trim' }), [])
  const postMat = useMemo(() => sculpturalMaterial('bridge-post', '#6e4a2e', { roughness: 0.9 }), [])
  const ropeMat = useMemo(() => sculpturalMaterial('bridge-rope', '#d4be96', { roughness: 0.92 }), [])

  const postPairs = useMemo(() => {
    const dx = spec.end[0] - spec.start[0]
    const dz = spec.end[2] - spec.start[2]
    const len = Math.max(1e-3, Math.hypot(dx, dz))
    const rx = (-dz / len) * (spec.plankWidth / 2 + 0.14)
    const rz = (dx / len) * (spec.plankWidth / 2 + 0.14)
    return [
      [spec.start[0] - rx, spec.start[1] + 0.55, spec.start[2] - rz] as [number, number, number],
      [spec.start[0] + rx, spec.start[1] + 0.55, spec.start[2] + rz] as [number, number, number],
      [spec.end[0] - rx, spec.end[1] + 0.55, spec.end[2] - rz] as [number, number, number],
      [spec.end[0] + rx, spec.end[1] + 0.55, spec.end[2] + rz] as [number, number, number],
    ]
  }, [spec])

  return (
    <group name={spec.id}>
      {/* Support timber posts */}
      {postPairs.map((p, i) => (
        <mesh key={i} position={p} material={postMat} castShadow>
          <cylinderGeometry args={[0.14, 0.18, 2.2, 8]} />
        </mesh>
      ))}
      {/* Catenary suspension ropes (TubeGeometry) */}
      {ropes.map((g, i) => (
        <mesh key={i} geometry={g} material={ropeMat} castShadow />
      ))}
      {/* Anchored end planks */}
      {staticPlanks.map((p) => (
        <mesh key={p.id} position={p.pos} rotation={[0, p.rotY, 0, ROTATION_ORDER]} geometry={plankGeo} material={woodMat} castShadow receiveShadow />
      ))}
      <BvhPhysicsBody>
        {staticPlanks.map((p) => (
          <mesh key={p.id} position={p.pos} rotation={[0, p.rotY, 0, ROTATION_ORDER]}>
            <boxGeometry args={p.size} />
            <meshBasicMaterial visible={false} />
          </mesh>
        ))}
      </BvhPhysicsBody>
      {/* Gently swaying middle planks */}
      {swayPlanks.map((p) => (
        <SwayPlank key={p.id} id={p.id} pos={p.pos} size={p.size} rotY={p.rotY} motion={p.motion!} plankGeo={plankGeo} />
      ))}
    </group>
  )
}

// ---- 3. Giant Twisting Tree Root (z2-z3) ----

function GiantRoot({ spec }: { spec: GiantRootSpec }) {
  const steps = useMemo(() => giantRootSteps(spec), [spec])
  const { mainTube, vineTube } = useMemo(() => buildGiantRootTubeGeometry(spec), [spec])
  const leafGeo = useMemo(() => buildLeafGeometry(), [])
  const barkMat = useMemo(() => sculpturalMaterial('root-bark', '#6f4e37', { roughness: 0.92, style: 'stone' }), [])
  const mossMat = useMemo(() => sculpturalMaterial('root-moss', '#7eb874', { roughness: 0.85, style: 'moss' }), [])
  const leafMat = useMemo(() => sculpturalMaterial('root-leaf', '#5ca65c', { roughness: 0.78 }), [])

  return (
    <group name={spec.id}>
      <mesh geometry={mainTube} material={barkMat} castShadow receiveShadow />
      <mesh geometry={vineTube} material={leafMat} castShadow />
      {/* Calibrated flat moss treads & Ghibli foliage accents */}
      {steps.map((s, idx) => (
        <group key={s.id} position={s.pos} rotation={[0, s.rotY, 0, ROTATION_ORDER]}>
          <mesh position={[0, s.size[1] / 2 - 0.04, 0]} material={mossMat} receiveShadow>
            <cylinderGeometry args={[s.width * 0.48, s.width * 0.54, 0.12, 8]} />
          </mesh>
          {idx % 2 === 0 && (
            <mesh
              geometry={leafGeo}
              position={[s.width * 0.44 * (idx % 4 === 0 ? 1 : -1), 0.14, 0]}
              rotation={[0.2, idx * 0.7, idx % 4 === 0 ? -0.35 : 0.35]}
              material={leafMat}
            />
          )}
        </group>
      ))}
      <BvhPhysicsBody>
        {steps.map((s) => (
          <mesh key={s.id} position={s.pos} rotation={[0, s.rotY, 0, ROTATION_ORDER]}>
            <boxGeometry args={s.size} />
            <meshBasicMaterial visible={false} />
          </mesh>
        ))}
      </BvhPhysicsBody>
    </group>
  )
}

// ---- 4. Vertical Gear Wheel (z2) ----

function GearToothTread({
  id,
  hubPos,
  rotY,
  radius,
  thickness,
  periodS,
  phaseS,
  dir,
}: {
  id: string
  hubPos: [number, number, number]
  rotY: number
  radius: number
  thickness: number
  periodS: number
  phaseS: number
  dir: 1 | -1
}) {
  const moverRef = useRef<Group>(null)
  const bodyRef = useRef<Object3D>(null)
  const colliderRef = useRef<Mesh>(null)
  const treadSize: [number, number, number] = [1.85, 0.34, Math.max(1.5, thickness + 0.9)]
  const woodMat = useMemo(() => sculpturalMaterial('gear-tread', '#b07b47', { roughness: 0.78, style: 'trim' }), [])
  const copperMat = useMemo(() => sculpturalMaterial('gear-copper', '#d69748', { roughness: 0.42, metalness: 0.55 }), [])

  const motion = useMemo<Motion>(
    () => ({
      type: 'orbit',
      points: [],
      periodS,
      phaseS,
      dwellS: 0,
      orbitRadius: radius + 0.16,
      orbitDir: dir,
    }),
    [periodS, phaseS, radius, dir],
  )

  useLayoutEffect(() => {
    if (!moverRef.current || !bodyRef.current || !colliderRef.current) return
    game.motion.register({
      id,
      mover: moverRef.current,
      body: bodyRef.current,
      collider: colliderRef.current,
      basePos: new Vector3().fromArray(hubPos),
      baseYaw: rotY,
      motion,
    })
    return () => game.motion.unregister(id)
  }, [id, hubPos, rotY, motion])

  return (
    <group ref={moverRef} position={hubPos} rotation={[0, rotY, 0, ROTATION_ORDER]}>
      <mesh material={woodMat} castShadow receiveShadow>
        <boxGeometry args={treadSize} />
      </mesh>
      <mesh position={[0, treadSize[1] / 2 + 0.02, 0]} material={copperMat} receiveShadow>
        <boxGeometry args={[treadSize[0] * 0.92, 0.04, treadSize[2] * 0.92]} />
      </mesh>
      <BvhPhysicsBody
        kinematic
        ref={(g) => {
          bodyRef.current = g
          if (g) g.name = id
        }}
      >
        <mesh ref={colliderRef}>
          <boxGeometry args={treadSize} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </group>
  )
}

function VerticalGearWheel({ spec }: { spec: VerticalGearSpec }) {
  const wheelRef = useRef<Mesh>(null)
  const wheelGeo = useMemo(() => buildGearWheelGeometry(spec.radius, spec.toothCount, spec.thickness), [spec.radius, spec.toothCount, spec.thickness])
  const woodMat = useMemo(() => sculpturalMaterial('gear-wheel', '#8d5b34', { roughness: 0.72, metalness: 0.15, style: 'trim' }), [])
  const hubMat = useMemo(() => sculpturalMaterial('gear-hub', '#c98842', { roughness: 0.4, metalness: 0.6 }), [])

  useFrame(() => {
    if (!wheelRef.current) return
    const angle = (game.motion.worldClock / spec.periodS) * Math.PI * 2 * spec.dir
    wheelRef.current.rotation.z = angle
  })

  const treads = useMemo(
    () =>
      Array.from({ length: spec.treadCount }, (_, i) => ({
        id: `${spec.id}-tread-${i}`,
        phaseS: (i / spec.treadCount) * spec.periodS,
      })),
    [spec.id, spec.treadCount, spec.periodS],
  )

  return (
    <group name={spec.id}>
      <group position={spec.pos} rotation={[0, spec.rotY, 0, ROTATION_ORDER]}>
        <mesh ref={wheelRef} geometry={wheelGeo} material={woodMat} castShadow receiveShadow />
        <mesh rotation={[Math.PI / 2, 0, 0]} material={hubMat} castShadow>
          <cylinderGeometry args={[spec.radius * 0.18, spec.radius * 0.18, spec.thickness * 1.9, 12]} />
        </mesh>
      </group>
      {treads.map((t) => (
        <GearToothTread
          key={t.id}
          id={t.id}
          hubPos={spec.pos}
          rotY={spec.rotY}
          radius={spec.radius}
          thickness={spec.thickness}
          periodS={spec.periodS}
          phaseS={t.phaseS}
          dir={spec.dir}
        />
      ))}
    </group>
  )
}

// ---- 5. Pendulum Paper Lanterns (z2-z4) ----

function PendulumLantern({ spec }: { spec: PendulumLanternSpec }) {
  const moverRef = useRef<Group>(null)
  const bodyRef = useRef<Object3D>(null)
  const colliderRef = useRef<Mesh>(null)
  const ropeRef = useRef<Mesh>(null)

  const roofGeo = useMemo(() => buildLanternRoofGeometry(spec.roofRadius), [spec.roofRadius])
  const bodyGeo = useMemo(() => buildLanternBodyGeometry(spec.roofRadius), [spec.roofRadius])
  const roofMat = useMemo(() => sculpturalMaterial('lantern-roof', '#8f3f36', { roughness: 0.72 }), [])
  const rimMat = useMemo(() => sculpturalMaterial('lantern-rim', '#f5d27a', { roughness: 0.45, metalness: 0.25 }), [])
  const glowMat = useMemo(
    () => sculpturalMaterial('lantern-paper', '#fff1cc', { roughness: 0.4, emissive: '#ffba52', emissiveIntensity: 1.35 }),
    [],
  )
  const ropeMat = useMemo(() => sculpturalMaterial('lantern-rope', '#c9b48d', { roughness: 0.9 }), [])

  const motion = useMemo<Motion>(
    () => ({
      type: 'pendulum',
      points: [],
      periodS: spec.periodS,
      phaseS: spec.phaseS,
      dwellS: 0,
      ropeLen: spec.ropeLen,
      swingAmp: spec.swingAmp,
    }),
    [spec.periodS, spec.phaseS, spec.ropeLen, spec.swingAmp],
  )

  useLayoutEffect(() => {
    if (!moverRef.current || !bodyRef.current || !colliderRef.current) return
    game.motion.register({
      id: spec.id,
      mover: moverRef.current,
      body: bodyRef.current,
      collider: colliderRef.current,
      basePos: new Vector3().fromArray(spec.pos),
      baseYaw: spec.rotY,
      motion,
    })
    return () => game.motion.unregister(spec.id)
  }, [spec, motion])

  // Pivot anchor stays above equilibrium; rope rotates smoothly with pendulum angle
  useFrame(() => {
    if (!ropeRef.current) return
    const phase = ((game.motion.worldClock + spec.phaseS) / spec.periodS) * Math.PI * 2
    const theta = spec.swingAmp * Math.sin(phase)
    ropeRef.current.rotation.z = theta
  })

  const colW = spec.roofRadius * 1.65
  const colSize: [number, number, number] = [colW, 0.46, colW]

  return (
    <group name={spec.id}>
      {/* Upper anchor & swinging suspension rope */}
      <group position={[spec.pos[0], spec.pos[1] + spec.ropeLen + 0.22, spec.pos[2]]} rotation={[0, spec.rotY, 0, ROTATION_ORDER]}>
        <mesh material={rimMat}>
          <cylinderGeometry args={[0.22, 0.22, 0.3, 10]} />
        </mesh>
        <mesh ref={ropeRef} position={[0, 0, 0]} material={ropeMat}>
          <primitive object={useMemo(() => new CylinderGeometry(0.05, 0.05, spec.ropeLen, 6).translate(0, -spec.ropeLen / 2, 0), [spec.ropeLen])} />
        </mesh>
      </group>
      {/* Kinematic flat-top lantern roof + warm glowing paper body */}
      <group ref={moverRef} position={spec.pos} rotation={[0, spec.rotY, 0, ROTATION_ORDER]}>
        <mesh geometry={roofGeo} material={roofMat} castShadow receiveShadow />
        <mesh position={[0, 0.25, 0]} material={rimMat} receiveShadow>
          <cylinderGeometry args={[spec.roofRadius * 0.88, spec.roofRadius * 0.92, 0.04, 16]} />
        </mesh>
        <mesh geometry={bodyGeo} material={glowMat} />
        <BvhPhysicsBody
          kinematic
          ref={(g) => {
            bodyRef.current = g
            if (g) g.name = spec.id
          }}
        >
          <mesh ref={colliderRef}>
            <boxGeometry args={colSize} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </BvhPhysicsBody>
      </group>
    </group>
  )
}

// ---- 6. Broken Stone Arch & Asymmetric Faceted Floating Stones (z3-z4) ----

function BrokenStoneArch({ spec }: { spec: BrokenArchSpec }) {
  const steps = useMemo(() => brokenArchSteps(spec), [spec])
  const outerR = spec.span / 2
  const innerR = outerR - 1.5
  const leftArchGeo = useMemo(
    () => buildBrokenArchSegmentGeometry(outerR, innerR, spec.thickness, Math.PI * 0.56, Math.PI),
    [outerR, innerR, spec.thickness],
  )
  const rightArchGeo = useMemo(
    () => buildBrokenArchSegmentGeometry(outerR, innerR, spec.thickness, 0, Math.PI * 0.34),
    [outerR, innerR, spec.thickness],
  )
  const stoneMat = useMemo(
    () => sculpturalMaterial(`arch-stone-${spec.zone}`, spec.zone === 'z4' ? '#e8e4da' : '#9c9589', { roughness: 0.84, style: spec.zone === 'z4' ? 'marble' : 'stone' }),
    [spec.zone],
  )
  const capMat = useMemo(
    () => sculpturalMaterial(`arch-cap-${spec.zone}`, spec.zone === 'z4' ? '#e6c572' : '#84b07e', { roughness: 0.78, style: spec.zone === 'z4' ? 'trim' : 'moss' }),
    [spec.zone],
  )

  return (
    <group name={spec.id}>
      <group position={spec.pos} rotation={[0, spec.rotY, 0, ROTATION_ORDER]}>
        <mesh geometry={leftArchGeo} scale={[1, spec.archHeight / outerR, 1]} material={stoneMat} castShadow receiveShadow />
        <mesh geometry={rightArchGeo} scale={[1, spec.archHeight / outerR, 1]} material={stoneMat} castShadow receiveShadow />
        {/* Stone plinths at arch bases */}
        <mesh position={[-outerR + 0.7, -0.6, 0]} material={stoneMat} castShadow receiveShadow>
          <cylinderGeometry args={[1.05, 1.25, 1.4, 8]} />
        </mesh>
        <mesh position={[outerR - 0.7, -0.6, 0]} material={stoneMat} castShadow receiveShadow>
          <cylinderGeometry args={[1.05, 1.25, 1.4, 8]} />
        </mesh>
      </group>
      {/* Subtle flat moss/carved stone stepping stones along the arch spine */}
      {steps.map((s) => (
        <mesh key={s.id} position={[s.pos[0], s.pos[1] + s.size[1] / 2 - 0.03, s.pos[2]]} rotation={[0, s.rotY, 0, ROTATION_ORDER]} material={capMat} receiveShadow>
          <boxGeometry args={[s.size[0] * 0.92, 0.07, s.size[2] * 0.92]} />
        </mesh>
      ))}
      <BvhPhysicsBody>
        {steps.map((s) => (
          <mesh key={s.id} position={s.pos} rotation={[0, s.rotY, 0, ROTATION_ORDER]}>
            <boxGeometry args={s.size} />
            <meshBasicMaterial visible={false} />
          </mesh>
        ))}
      </BvhPhysicsBody>
    </group>
  )
}

function FacetedFloatingRock({ spec }: { spec: FacetedRockSpec }) {
  const { topCap, underside } = useMemo(() => buildFacetedRockGeometries(spec.radius, spec.depth, spec.seed), [spec.radius, spec.depth, spec.seed])
  const rockMat = useMemo(
    () => sculpturalMaterial(`facet-rock-${spec.zone}`, spec.zone === 'z4' ? '#d8d4ca' : '#857e74', { roughness: 0.9, style: spec.zone === 'z4' ? 'marble' : 'stone' }),
    [spec.zone],
  )
  const capMat = useMemo(
    () => sculpturalMaterial(`facet-cap-${spec.zone}`, spec.zone === 'z4' ? '#f0e5c8' : '#87b57f', { roughness: 0.82, style: spec.zone === 'z4' ? 'marble' : 'moss' }),
    [spec.zone],
  )
  const colW = spec.radius * 1.55

  return (
    <group name={spec.id}>
      <group position={spec.pos} rotation={[0, spec.rotY, 0, ROTATION_ORDER]}>
        <mesh geometry={topCap} material={capMat} castShadow receiveShadow />
        <mesh geometry={underside} material={rockMat} castShadow receiveShadow />
      </group>
      <BvhPhysicsBody>
        <mesh position={[spec.pos[0], spec.pos[1] + 0.05, spec.pos[2]]} rotation={[0, spec.rotY, 0, ROTATION_ORDER]}>
          <boxGeometry args={[colW, 0.4, colW]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </group>
  )
}

const ZONE_BANDS: Readonly<Record<'z1' | 'z2' | 'z3' | 'z4', [number, number]>> = {
  z1: [0, 75],
  z2: [60, 205],
  z3: [190, 365],
  z4: [350, 510],
}

export function SculpturalObjects({ level }: { level: LoadedLevel }) {
  const active = useMemo(() => level.id === 'main', [level.id])
  if (!active) return null
  return (
    <group name="sculptural-world">
      {(['z1', 'z2', 'z3', 'z4'] as const).map((zone) => {
        const [minY, maxY] = ZONE_BANDS[zone]
        return (
          <AltitudeCullGroup key={zone} id={`sculptural-${zone}`} minY={minY} maxY={maxY} marginM={130}>
            {SCULPTURAL_SPECS.filter((s) => s.zone === zone).map((spec) => {
              if (spec.kind === 'spiralStairs') return <SpiralStairs key={spec.id} spec={spec} />
              if (spec.kind === 'ropeBridge') return <RopeBridge key={spec.id} spec={spec} />
              if (spec.kind === 'giantRoot') return <GiantRoot key={spec.id} spec={spec} />
              if (spec.kind === 'verticalGear') return <VerticalGearWheel key={spec.id} spec={spec} />
              if (spec.kind === 'pendulumLantern') return <PendulumLantern key={spec.id} spec={spec} />
              if (spec.kind === 'brokenArch') return <BrokenStoneArch key={spec.id} spec={spec} />
              if (spec.kind === 'facetedRock') return <FacetedFloatingRock key={spec.id} spec={spec} />
              return null
            })}
          </AltitudeCullGroup>
        )
      })}
    </group>
  )
}
