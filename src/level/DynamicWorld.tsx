// Dynamic World-Building Layer (Gelombang 4 — Genshin Impact x Studio Ghibli):
// - 2 Patrolling Ghibli Sky Airships cruising Z2-Z3 with spinning propellers & glowing cabins
// - 48 Rising Liyue Sky Lanterns (Xiao Lanterns) drifting upward from the valley into the clouds
// - 16 Real-time Anemo Wind Ribbons aligned to Crosswind Gust direction & intensity
// - 36 Player-Reactive Butterflies scattering dynamically when the player runs nearby in Z1-Z2
// - 6 Periodic Shooting Stars streaking across the Z4 Celestia starry sky
// Strictly non-collider visuals with zero per-frame allocations and full GPU disposal.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  TorusGeometry,
} from 'three'
import type { LoadedLevel } from './levels.ts'
import { RELAXED_CHECKPOINTS } from './challenges.ts'
import { game } from '../game/game.ts'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LANTERN_COUNT = 48
const RIBBON_COUNT = 16
const BUTTERFLY_COUNT = 36
const METEOR_COUNT = 6

const AIRSHIP_ROUTES: readonly { id: string; radius: number; baseY: number; speed: number; phase: number; scale: number; dir: 1 | -1 }[] = [
  { id: 'ghibli-airship-z2', radius: 102, baseY: 192, speed: 0.055, phase: 0.6, scale: 1.45, dir: 1 },
  { id: 'ghibli-airship-z3', radius: 126, baseY: 318, speed: 0.042, phase: 3.7, scale: 1.75, dir: -1 },
]

type LanternSeed = {
  angle: number
  radius: number
  yOffset: number
  riseSpeed: number
  swayPhase: number
  scale: number
}

type RibbonSeed = {
  ox: number
  oy: number
  oz: number
  speed: number
  phase: number
  len: number
}

type ButterflyState = {
  homeX: number
  homeY: number
  homeZ: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  phase: number
  orbitR: number
}

type MeteorSeed = {
  angle: number
  radius: number
  baseY: number
  cycle: number
  offset: number
  pitch: number
}

export function DynamicWorld({ level }: { level: LoadedLevel }) {
  const active = level.id === 'main'

  const airshipRefs = useRef<Array<Group | null>>([])
  const propRefs = useRef<Array<Group | null>>([])
  const lanternRef = useRef<InstancedMesh>(null)
  const ribbonRef = useRef<InstancedMesh>(null)
  const butterflyRef = useRef<InstancedMesh>(null)
  const meteorRef = useRef<InstancedMesh>(null)

  const resources = useMemo(() => {
    // 1. Airship geometries & materials
    const hullGeo = new BoxGeometry(3.8, 1.8, 8.6)
    const cabinGeo = new BoxGeometry(2.6, 1.35, 3.6)
    const balloonGeo = new CapsuleGeometry(3.4, 8.8, 8, 16)
    balloonGeo.rotateX(Math.PI / 2)
    const stripeGeo = new TorusGeometry(3.46, 0.24, 8, 20)
    const finGeo = new BoxGeometry(0.18, 2.2, 2.8)
    const propBladeGeo = new BoxGeometry(3.2, 0.34, 0.14)

    const hullMat = new MeshStandardMaterial({ color: '#7d4f32', roughness: 0.85 })
    const canvasMat = new MeshStandardMaterial({ color: '#f4ead7', roughness: 0.86 })
    const crimsonMat = new MeshStandardMaterial({ color: '#c44636', roughness: 0.78 })
    const brassMat = new MeshStandardMaterial({ color: '#d8a64a', roughness: 0.35, metalness: 0.65 })
    const cabinGlowMat = new MeshStandardMaterial({
      color: '#ffebb3',
      emissive: '#ffb347',
      emissiveIntensity: 1.35,
      roughness: 0.25,
    })

    // 2. Rising Liyue Sky Lanterns (Xiao Lanterns)
    const lanternGeo = new CylinderGeometry(0.42, 0.32, 0.92, 6)
    const lanternMat = new MeshStandardMaterial({
      color: '#ffdf9e',
      emissive: '#ff9e3d',
      emissiveIntensity: 1.65,
      roughness: 0.4,
    })

    // 3. Anemo Wind Ribbons (Crosswind Gust visual streaks)
    const ribbonGeo = new PlaneGeometry(1.0, 0.24, 1, 1)
    const ribbonMat = new MeshBasicMaterial({
      color: '#d8fbff',
      transparent: true,
      opacity: 0.32,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    })

    // 4. Player-reactive Ghibli butterflies (V-wing quad)
    const butterflyGeo = new ConeGeometry(0.22, 0.48, 3)
    butterflyGeo.rotateX(Math.PI / 2)
    butterflyGeo.scale(1.9, 0.22, 1.0)
    const butterflyMat = new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide })

    // 5. Celestia Shooting Stars
    const meteorGeo = new CylinderGeometry(0.06, 0.36, 18, 5)
    meteorGeo.rotateZ(Math.PI / 2)
    const meteorMat = new MeshBasicMaterial({
      color: '#e8f9ff',
      transparent: true,
      opacity: 0.85,
      blending: AdditiveBlending,
      depthWrite: false,
    })

    return {
      hullGeo,
      cabinGeo,
      balloonGeo,
      stripeGeo,
      finGeo,
      propBladeGeo,
      hullMat,
      canvasMat,
      crimsonMat,
      brassMat,
      cabinGlowMat,
      lanternGeo,
      lanternMat,
      ribbonGeo,
      ribbonMat,
      butterflyGeo,
      butterflyMat,
      meteorGeo,
      meteorMat,
    }
  }, [])

  const lanternSeeds = useMemo<LanternSeed[]>(() => {
    const rng = mulberry32(4101)
    return Array.from({ length: LANTERN_COUNT }, (_, i) => ({
      angle: (i / LANTERN_COUNT) * Math.PI * 2 + rng() * 0.35,
      radius: 26 + rng() * 105,
      yOffset: rng() * 340,
      riseSpeed: 1.4 + rng() * 1.6,
      swayPhase: rng() * Math.PI * 2,
      scale: 0.75 + rng() * 0.7,
    }))
  }, [])

  const ribbonSeeds = useMemo<RibbonSeed[]>(() => {
    const rng = mulberry32(4202)
    return Array.from({ length: RIBBON_COUNT }, () => ({
      ox: (rng() - 0.5) * 62,
      oy: (rng() - 0.5) * 28,
      oz: (rng() - 0.5) * 62,
      speed: 14 + rng() * 14,
      phase: rng() * 100,
      len: 4.5 + rng() * 5.5,
    }))
  }, [])

  const butterflyStatesRef = useRef<ButterflyState[]>([])

  const meteorSeeds = useMemo<MeteorSeed[]>(() => {
    const rng = mulberry32(4404)
    return Array.from({ length: METEOR_COUNT }, (_, i) => ({
      angle: (i / METEOR_COUNT) * Math.PI * 2 + rng() * 0.5,
      radius: 170 + rng() * 120,
      baseY: 470 + rng() * 145,
      cycle: 7 + rng() * 8,
      offset: rng() * 12,
      pitch: 0.32 + rng() * 0.25,
    }))
  }, [])

  useEffect(() => {
    if (!active) return
    const rng = mulberry32(4303)
    const anchors: Array<[number, number, number, number]> = [
      [0, 1.4, 0, 22],
      [RELAXED_CHECKPOINTS[0].pos[0], RELAXED_CHECKPOINTS[0].pos[1] + 1.4, RELAXED_CHECKPOINTS[0].pos[2], 6],
      [RELAXED_CHECKPOINTS[1].pos[0], RELAXED_CHECKPOINTS[1].pos[1] + 1.4, RELAXED_CHECKPOINTS[1].pos[2], 6],
    ]
    const states: ButterflyState[] = []
    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const a = anchors[i < 24 ? 0 : i < 30 ? 1 : 2]
      const ang = rng() * Math.PI * 2
      const r = 3.5 + rng() * a[3]
      const hx = a[0] + Math.cos(ang) * r
      const hy = a[1] + rng() * 2.8
      const hz = a[2] + Math.sin(ang) * r
      states.push({
        homeX: hx,
        homeY: hy,
        homeZ: hz,
        x: hx,
        y: hy,
        z: hz,
        vx: 0,
        vy: 0,
        vz: 0,
        phase: rng() * Math.PI * 2,
        orbitR: 0.7 + rng() * 1.4,
      })
    }
    butterflyStatesRef.current = states

    if (butterflyRef.current) {
      const palette = [new Color('#ffe580'), new Color('#9ef0ff'), new Color('#ffb8c9'), new Color('#fff6d6')]
      for (let i = 0; i < BUTTERFLY_COUNT; i++) {
        butterflyRef.current.setColorAt(i, palette[i % palette.length])
      }
      if (butterflyRef.current.instanceColor) butterflyRef.current.instanceColor.needsUpdate = true
    }
  }, [active])

  useEffect(
    () => () => {
      resources.hullGeo.dispose()
      resources.cabinGeo.dispose()
      resources.balloonGeo.dispose()
      resources.stripeGeo.dispose()
      resources.finGeo.dispose()
      resources.propBladeGeo.dispose()
      resources.hullMat.dispose()
      resources.canvasMat.dispose()
      resources.crimsonMat.dispose()
      resources.brassMat.dispose()
      resources.cabinGlowMat.dispose()
      resources.lanternGeo.dispose()
      resources.lanternMat.dispose()
      resources.ribbonGeo.dispose()
      resources.ribbonMat.dispose()
      resources.butterflyGeo.dispose()
      resources.butterflyMat.dispose()
      resources.meteorGeo.dispose()
      resources.meteorMat.dispose()
    },
    [resources],
  )

  const dummy = useMemo(() => new Object3D(), [])

  useFrame(({ clock }, rawDt) => {
    if (!active) return
    const dt = Math.min(rawDt, 0.08)
    const t = clock.elapsedTime
    const windInt = game.challenges.windIntensity
    const windAng = game.challenges.windAngle
    const p = game.port?.position
    const px = p?.x ?? 0
    const py = p?.y ?? 0
    const pz = p?.z ?? 0

    // 1. Patrol Ghibli Sky Airships
    for (let i = 0; i < AIRSHIP_ROUTES.length; i++) {
      const route = AIRSHIP_ROUTES[i]
      const ship = airshipRefs.current[i]
      if (ship) {
        const ang = route.phase + t * route.speed * route.dir
        const x = Math.cos(ang) * route.radius
        const z = Math.sin(ang) * route.radius
        const y = route.baseY + Math.sin(t * 0.45 + i * 2.1) * 3.2
        const tangentYaw = Math.atan2(-Math.sin(ang) * route.dir, Math.cos(ang) * route.dir)
        ship.position.set(x, y, z)
        ship.rotation.set(Math.sin(t * 0.6 + i) * 0.035, tangentYaw, Math.cos(t * 0.5 + i) * 0.04)
      }
      const prop = propRefs.current[i]
      if (prop) prop.rotation.z = t * (6.5 + windInt * 5.0)
    }

    // 2. Rising Liyue Sky Lanterns
    if (lanternRef.current) {
      const wx = Math.cos(windAng) * (1.2 + windInt * 3.5)
      const wz = Math.sin(windAng) * (1.2 + windInt * 3.5)
      for (let i = 0; i < lanternSeeds.length; i++) {
        const l = lanternSeeds[i]
        const y = 8 + ((l.yOffset + t * l.riseSpeed) % 355)
        const sway = Math.sin(t * 0.8 + l.swayPhase) * 2.4
        const x = Math.cos(l.angle) * l.radius + sway + wx * Math.sin(t * 0.2 + i)
        const z = Math.sin(l.angle) * l.radius + Math.cos(t * 0.7 + l.swayPhase) * 2.4 + wz * Math.cos(t * 0.2 + i)
        const pulse = l.scale * (0.94 + Math.sin(t * 3.1 + i) * 0.06)
        dummy.position.set(x, y, z)
        dummy.rotation.set(0, t * 0.35 + i, Math.sin(t * 0.9 + i) * 0.08)
        dummy.scale.set(pulse, pulse, pulse)
        dummy.updateMatrix()
        lanternRef.current.setMatrixAt(i, dummy.matrix)
      }
      lanternRef.current.instanceMatrix.needsUpdate = true
    }

    // 3. Anemo Wind Ribbons reactive to Crosswind Gust
    if (ribbonRef.current) {
      const activeScale = windInt > 0.04 ? 0.65 + windInt * 1.45 : 0.28
      const dirX = Math.cos(windAng)
      const dirZ = Math.sin(windAng)
      const yaw = -windAng
      for (let i = 0; i < ribbonSeeds.length; i++) {
        const r = ribbonSeeds[i]
        const travel = ((t * r.speed * (0.45 + windInt * 2.2) + r.phase) % 72) - 36
        const rx = px + r.ox * 0.5 + dirX * travel
        const ry = py + 5 + r.oy + Math.sin(t * 2.8 + i) * 1.1
        const rz = pz + r.oz * 0.5 + dirZ * travel
        dummy.position.set(rx, ry, rz)
        dummy.rotation.set(0.18, yaw, Math.sin(t * 4.0 + i) * 0.08)
        dummy.scale.set(r.len * activeScale, 0.55 + windInt * 1.1, 1)
        dummy.updateMatrix()
        ribbonRef.current.setMatrixAt(i, dummy.matrix)
      }
      ribbonRef.current.instanceMatrix.needsUpdate = true
    }

    // 4. Player-Reactive Butterflies (scatter away when player runs within 4.5 m)
    if (butterflyRef.current && butterflyStatesRef.current.length > 0) {
      const states = butterflyStatesRef.current
      for (let i = 0; i < states.length; i++) {
        const b = states[i]
        const targetX = b.homeX + Math.cos(t * 0.85 + b.phase) * b.orbitR
        const targetY = b.homeY + Math.sin(t * 1.4 + b.phase) * 0.55
        const targetZ = b.homeZ + Math.sin(t * 0.75 + b.phase) * b.orbitR
        // Spring gently back toward home orbit
        b.vx += (targetX - b.x) * 1.8 * dt
        b.vy += (targetY - b.y) * 2.0 * dt
        b.vz += (targetZ - b.z) * 1.8 * dt
        // Scatter impulse if player approaches within 4.5 m
        const dx = b.x - px
        const dy = b.y - (py + 1.0)
        const dz = b.z - pz
        const distSq = dx * dx + dy * dy + dz * dz
        if (distSq < 20.25 && distSq > 1e-4) {
          const dist = Math.sqrt(distSq)
          const push = (1 - dist / 4.5) * 18.0 * dt
          b.vx += (dx / dist) * push
          b.vy += (0.55 + Math.abs(dy) / dist) * push
          b.vz += (dz / dist) * push
        }
        const damp = Math.exp(-2.8 * dt)
        b.vx *= damp
        b.vy *= damp
        b.vz *= damp
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.z += b.vz * dt

        const heading = Math.atan2(b.vx + 0.001, b.vz + 0.001)
        const flap = 0.45 + Math.abs(Math.sin(t * 14.0 + b.phase)) * 0.85
        dummy.position.set(b.x, b.y, b.z)
        dummy.rotation.set(0, heading, Math.sin(t * 10 + i) * 0.25)
        dummy.scale.set(1, flap, 1)
        dummy.updateMatrix()
        butterflyRef.current.setMatrixAt(i, dummy.matrix)
      }
      butterflyRef.current.instanceMatrix.needsUpdate = true
    }

    // 5. Periodic Shooting Stars in Z4 Celestia
    if (meteorRef.current) {
      const starVis = game.atmosphere.starOpacity
      for (let i = 0; i < meteorSeeds.length; i++) {
        const m = meteorSeeds[i]
        const localT = (t + m.offset) % m.cycle
        const activeDur = 1.15
        if (starVis > 0.08 && localT < activeDur) {
          const u = localT / activeDur
          const fade = Math.sin(u * Math.PI) * starVis
          const sx = Math.cos(m.angle) * m.radius - Math.sin(m.angle) * (u * 130 - 65)
          const sz = Math.sin(m.angle) * m.radius + Math.cos(m.angle) * (u * 130 - 65)
          const sy = m.baseY - u * 48
          dummy.position.set(sx, sy, sz)
          dummy.rotation.set(0, -m.angle, -m.pitch)
          dummy.scale.set(fade * 1.4, fade, fade)
        } else {
          dummy.position.set(0, -500, 0)
          dummy.scale.set(0.001, 0.001, 0.001)
        }
        dummy.updateMatrix()
        meteorRef.current.setMatrixAt(i, dummy.matrix)
      }
      meteorRef.current.instanceMatrix.needsUpdate = true
    }
  })

  if (!active) return null

  return (
    <group name="dynamic-world">
      {/* 1. Patrolling Ghibli Sky Airships in Z2-Z3 */}
      {AIRSHIP_ROUTES.map((route, idx) => (
        <group
          key={route.id}
          name={route.id}
          scale={route.scale}
          ref={(el) => {
            airshipRefs.current[idx] = el
          }}
        >
          <mesh geometry={resources.hullGeo} material={resources.hullMat} />
          <mesh geometry={resources.cabinGeo} material={resources.cabinGlowMat} position={[0, 1.15, -0.4]} />
          <mesh geometry={resources.balloonGeo} material={resources.canvasMat} position={[0, 6.2, 0]} />
          <mesh geometry={resources.stripeGeo} material={resources.crimsonMat} position={[0, 6.2, 1.8]} />
          <mesh geometry={resources.stripeGeo} material={resources.crimsonMat} position={[0, 6.2, -1.8]} />
          <mesh geometry={resources.finGeo} material={resources.crimsonMat} position={[0, 6.2, -6.4]} />
          <group
            position={[0, 0.6, -4.6]}
            ref={(el) => {
              propRefs.current[idx] = el
            }}
          >
            <mesh geometry={resources.propBladeGeo} material={resources.brassMat} />
            <mesh geometry={resources.propBladeGeo} material={resources.brassMat} rotation={[0, 0, Math.PI / 2]} />
          </group>
        </group>
      ))}

      {/* 2. Rising Liyue Sky Lanterns */}
      <instancedMesh ref={lanternRef} name="dynamic-sky-lanterns" args={[resources.lanternGeo, resources.lanternMat, LANTERN_COUNT]} frustumCulled={false} />

      {/* 3. Real-time Anemo Wind Ribbons */}
      <instancedMesh ref={ribbonRef} name="dynamic-wind-ribbons" args={[resources.ribbonGeo, resources.ribbonMat, RIBBON_COUNT]} frustumCulled={false} />

      {/* 4. Player-Reactive Ghibli Butterflies */}
      <instancedMesh ref={butterflyRef} name="dynamic-butterflies" args={[resources.butterflyGeo, resources.butterflyMat, BUTTERFLY_COUNT]} frustumCulled={false} />

      {/* 5. Celestia Shooting Stars */}
      <instancedMesh ref={meteorRef} name="dynamic-shooting-stars" args={[resources.meteorGeo, resources.meteorMat, METEOR_COUNT]} frustumCulled={false} />
    </group>
  )
}
