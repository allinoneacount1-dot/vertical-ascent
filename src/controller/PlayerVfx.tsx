// Character Movement Juice VFX & Subtle Bank Lean (Fase 6 — Gelombang A):
// Pooled 32-instance soft dust puffs (footsteps + landing burst) + expanding double-jump wind ring,
// plus smooth body lean into turns. Zero per-frame allocations and zero physics collider impact.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, SphereGeometry, TorusGeometry } from 'three'
import { game } from '../game/game.ts'

const PUFF_COUNT = 32
const dummy = new Object3D()
const zeroMat = new Matrix4().makeScale(0, 0, 0)

type Puff = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  life: number
  size: number
}

export function PlayerVfx() {
  const puffsRef = useRef<InstancedMesh>(null)
  const ringRef = useRef<Mesh>(null)

  const puffsRefArr = useRef<Puff[]>(
    Array.from({ length: PUFF_COUNT }, () => ({
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 99,
        life: 0.5,
        size: 0.2,
      })),
  )
  const cursorRef = useRef(0)
  const stepTimerRef = useRef(0)
  const prevGroundedRef = useRef(true)
  const prevAirJumpsRef = useRef(0)
  const prevYawRef = useRef(0)
  const leanRef = useRef(0)
  const ringAgeRef = useRef(99)
  const ringPosRef = useRef<[number, number, number]>([0, -999, 0])

  const { puffGeo, puffMat, ringGeo, ringMat } = useMemo(() => {
    const puffGeo = new SphereGeometry(0.18, 6, 5)
    const puffMat = new MeshBasicMaterial({
      color: '#f5e8cc',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
    const ringGeo = new TorusGeometry(0.55, 0.055, 8, 24)
    ringGeo.rotateX(Math.PI / 2)
    const ringMat = new MeshBasicMaterial({
      color: '#72eac0',
      transparent: true,
      opacity: 0.72,
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

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const port = game.port
    const ctrl = game.controller
    const visual = game.visual
    const inst = puffsRef.current
    if (!inst) return

    const spawnPuff = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number) => {
      const p = puffsRefArr.current[cursorRef.current % PUFF_COUNT]
      cursorRef.current = (cursorRef.current + 1) % PUFF_COUNT
      p.x = x
      p.y = y
      p.z = z
      p.vx = vx
      p.vy = vy
      p.vz = vz
      p.age = 0
      p.life = life
      p.size = size
    }

    if (port && ctrl && game.snapshot.state === 'PLAYING') {
      const pos = port.position
      const grounded = port.isGroundedRaw
      const speed = ctrl.moveSpeed

      // 1. Footstep dust puffs while walking/sprinting on ground
      if (grounded && speed > 1.2) {
        stepTimerRef.current += dt * (ctrl.sprintActive ? 1.65 : 1.0)
        if (stepTimerRef.current >= 0.24) {
          stepTimerRef.current = 0
          spawnPuff(
            pos.x + (Math.random() - 0.5) * 0.25,
            pos.y + 0.08,
            pos.z + (Math.random() - 0.5) * 0.25,
            (Math.random() - 0.5) * 0.6,
            0.55 + Math.random() * 0.35,
            (Math.random() - 0.5) * 0.6,
            0.48,
            ctrl.sprintActive ? 1.1 : 0.78,
          )
        }
      }

      // 2. Landing radial dust burst
      if (grounded && !prevGroundedRef.current) {
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + Math.random() * 0.3
          spawnPuff(pos.x, pos.y + 0.06, pos.z, Math.cos(ang) * 1.6, 0.75, Math.sin(ang) * 1.6, 0.52, 1.15)
        }
      }
      prevGroundedRef.current = grounded

      // 3. Double-jump cyan-gold wind ring
      if (ctrl.airJumpCount > prevAirJumpsRef.current) {
        ringAgeRef.current = 0
        ringPosRef.current = [pos.x, pos.y + 0.12, pos.z]
      }
      prevAirJumpsRef.current = ctrl.airJumpCount

      // 4. Subtle bank lean into turns (visual wrapper z-roll)
      const dyaw = Math.atan2(Math.sin(ctrl.facingYaw - prevYawRef.current), Math.cos(ctrl.facingYaw - prevYawRef.current))
      prevYawRef.current = ctrl.facingYaw
      const targetLean = grounded && speed > 1.5 ? Math.max(-0.09, Math.min(0.09, -dyaw * 1.4)) : 0
      leanRef.current += (targetLean - leanRef.current) * Math.min(1, dt * 10)
      if (visual) visual.rotation.z = leanRef.current
    }

    // Step puffs
    for (let i = 0; i < PUFF_COUNT; i++) {
      const p = puffsRefArr.current[i]
      if (p.age >= p.life) {
        inst.setMatrixAt(i, zeroMat)
        continue
      }
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.vy *= 0.94
      const t = Math.min(1, p.age / p.life)
      const s = p.size * (0.55 + t * 1.1) * (1 - t)
      dummy.position.set(p.x, p.y, p.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(Math.max(0.001, s))
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
    }
    inst.instanceMatrix.needsUpdate = true

    // Step air-jump wind ring
    const ring = ringRef.current
    if (ring) {
      if (ringAgeRef.current < 0.42) {
        ringAgeRef.current += dt
        const t = Math.min(1, ringAgeRef.current / 0.42)
        ring.visible = true
        ring.position.set(ringPosRef.current[0], ringPosRef.current[1] - t * 0.18, ringPosRef.current[2])
        ring.scale.setScalar(0.85 + t * 2.1)
        const rm = ring.material as MeshBasicMaterial
        rm.opacity = (1 - t) * 0.72
      } else {
        ring.visible = false
      }
    }
  })

  return (
    <group name="player-vfx">
      <instancedMesh ref={puffsRef} args={[puffGeo, puffMat, PUFF_COUNT]} frustumCulled={false} />
      <mesh ref={ringRef} geometry={ringGeo} material={ringMat} visible={false} />
    </group>
  )
}
