// Character Movement Juice & VFX (Fase 6 — Gelombang A):
// Single-draw-call pooled InstancedMesh for footstep dust puffs, landing bursts, and double-jump wind rings,
// plus subtle body bank-lean when turning at speed (never mutating physics position/velocity).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DodecahedronGeometry, InstancedMesh, MeshBasicMaterial, Object3D, TorusGeometry } from 'three'
import type { Mesh } from 'three'
import { game } from '../game/game.ts'

const POOL_SIZE = 36

type Puff = {
  active: boolean
  age: number
  life: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  scale0: number
}

function setRingOpacity(mat: MeshBasicMaterial, op: number): void {
  mat.opacity = op
}

export function CharacterJuice() {
  const puffsRef = useRef<InstancedMesh>(null)
  const ringRef = useRef<Mesh>(null)

  const { puffGeo, puffMat, ringGeo, ringMat } = useMemo(() => {
    const puffGeo = new DodecahedronGeometry(0.16, 0)
    const puffMat = new MeshBasicMaterial({
      color: new Color('#fff3d6'),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
    const ringGeo = new TorusGeometry(0.55, 0.045, 8, 24)
    ringGeo.rotateX(Math.PI / 2)
    const ringMat = new MeshBasicMaterial({
      color: new Color('#86f0cf'),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    return { puffGeo, puffMat, ringGeo, ringMat }
  }, [])

  useEffect(
    () => () => {
      puffGeo.dispose()
      puffMat.dispose()
      ringGeo.dispose()
      ringMat.dispose()
    },
    [puffGeo, puffMat, ringGeo, ringMat],
  )

  const poolRef = useRef<Puff[]>(
    Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      age: 0,
      life: 0.5,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      scale0: 1,
    })),
  )
  const cursorRef = useRef(0)
  const stepAccumRef = useRef(0)
  const wasGroundedRef = useRef(true)
  const lastAirJumpsRef = useRef(0)
  const ringAgeRef = useRef(99)
  const ringOriginRef = useRef<[number, number, number]>([0, -999, 0])
  const prevYawRef = useRef(0)
  const dummy = useMemo(() => new Object3D(), [])

  const spawnPuff = (x: number, y: number, z: number, vx: number, vy: number, vz: number, scale0: number, life: number) => {
    const idx = cursorRef.current % POOL_SIZE
    cursorRef.current++
    const p = poolRef.current[idx]
    p.active = true
    p.age = 0
    p.life = life
    p.x = x
    p.y = y
    p.z = z
    p.vx = vx
    p.vy = vy
    p.vz = vz
    p.scale0 = scale0
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const port = game.port
    const ctrl = game.controller
    const playing = game.snapshot.state === 'PLAYING'

    if (playing && port && ctrl) {
      const pos = port.position
      const grounded = port.isGroundedRaw
      const speed = Math.hypot(port.velocity.x, port.velocity.z)

      // 1. Footstep dust puffs while moving on ground
      if (grounded && speed > 1.6) {
        stepAccumRef.current += dt * (ctrl.sprintActive ? 9.5 : 5.2)
        if (stepAccumRef.current >= 1) {
          stepAccumRef.current = 0
          const jitterX = (Math.random() - 0.5) * 0.3
          const jitterZ = (Math.random() - 0.5) * 0.3
          spawnPuff(pos.x + jitterX, pos.y + 0.08, pos.z + jitterZ, -port.velocity.x * 0.14, 0.45 + Math.random() * 0.35, -port.velocity.z * 0.14, ctrl.sprintActive ? 1.15 : 0.78, 0.45)
        }
      }

      // 2. Landing burst when transitioning airborne -> grounded
      if (grounded && !wasGroundedRef.current) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          spawnPuff(pos.x + Math.cos(a) * 0.25, pos.y + 0.1, pos.z + Math.sin(a) * 0.25, Math.cos(a) * 1.4, 0.65, Math.sin(a) * 1.4, 1.25, 0.52)
        }
      }
      wasGroundedRef.current = grounded

      // 3. Double-jump glowing wind ring
      if (ctrl.airJumpCount > lastAirJumpsRef.current) {
        ringAgeRef.current = 0
        ringOriginRef.current = [pos.x, pos.y + 0.15, pos.z]
      }
      lastAirJumpsRef.current = ctrl.airJumpCount

      // 4. Subtle visual bank-lean into turns (purely cosmetic on visual wrapper)
      if (game.visual) {
        const yaw = ctrl.facingYaw
        const dyaw = Math.atan2(Math.sin(yaw - prevYawRef.current), Math.cos(yaw - prevYawRef.current))
        prevYawRef.current = yaw
        const targetLean = grounded && speed > 2.0 ? Math.max(-0.11, Math.min(0.11, -dyaw * 2.2)) : 0
        game.visual.rotation.z += (targetLean - game.visual.rotation.z) * Math.min(1, dt * 10)
      }
    }

    // Update pooled dust puffs
    if (puffsRef.current) {
      const pool = poolRef.current
      for (let i = 0; i < POOL_SIZE; i++) {
        const p = pool[i]
        if (!p.active) {
          dummy.position.set(0, -999, 0)
          dummy.scale.setScalar(0.001)
          dummy.updateMatrix()
          puffsRef.current.setMatrixAt(i, dummy.matrix)
          continue
        }
        p.age += dt
        if (p.age >= p.life) {
          p.active = false
          dummy.position.set(0, -999, 0)
          dummy.scale.setScalar(0.001)
          dummy.updateMatrix()
          puffsRef.current.setMatrixAt(i, dummy.matrix)
          continue
        }
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.z += p.vz * dt
        p.vy *= 0.94
        const k = p.age / p.life
        const sc = p.scale0 * (1 - k) * (0.65 + k * 0.9)
        dummy.position.set(p.x, p.y, p.z)
        dummy.rotation.set(p.age * 2, p.age * 1.5, 0)
        dummy.scale.setScalar(Math.max(0.001, sc))
        dummy.updateMatrix()
        puffsRef.current.setMatrixAt(i, dummy.matrix)
      }
      puffsRef.current.instanceMatrix.needsUpdate = true
    }

    // Update double-jump wind ring
    if (ringRef.current) {
      if (ringAgeRef.current < 0.42) {
        ringAgeRef.current += dt
        const k = Math.min(1, ringAgeRef.current / 0.42)
        ringRef.current.visible = true
        ringRef.current.position.set(ringOriginRef.current[0], ringOriginRef.current[1] - k * 0.2, ringOriginRef.current[2])
        ringRef.current.scale.setScalar(0.7 + k * 1.85)
        setRingOpacity(ringMat, (1 - k) * 0.78)
      } else {
        ringRef.current.visible = false
        setRingOpacity(ringMat, 0)
      }
    }
  })

  return (
    <group name="character-juice">
      <instancedMesh ref={puffsRef} args={[puffGeo, puffMat, POOL_SIZE]} frustumCulled={false} />
      <mesh ref={ringRef} geometry={ringGeo} material={ringMat} visible={false} />
    </group>
  )
}
