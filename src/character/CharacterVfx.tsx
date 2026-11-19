// Character Movement Juice VFX (Tahap 2):
// - Pooled instanced footstep dust puffs & radial landing bursts (1 InstancedMesh draw call)
// - Expanding translucent Anemo wind ring on air-jumps / bounces
// - Subtle character body bank-lean when turning while sprinting
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  DodecahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  TorusGeometry,
} from 'three'
import { game } from '../game/game.ts'

const MAX_DUST = 24

type DustPuff = {
  life: number
  maxLife: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  scale: number
}

export function CharacterVfx() {
  const dustRef = useRef<InstancedMesh>(null)
  const ringRef = useRef<Mesh>(null)

  const stateRef = useRef({
    wasGrounded: true,
    lastAirJumps: 0,
    lastYaw: 0,
    lean: 0,
    stepAccum: 0,
    nextIdx: 0,
    ringLife: 0,
    ringX: 0,
    ringY: 0,
    ringZ: 0,
    puffs: Array.from({ length: MAX_DUST }, (): DustPuff => ({
      life: 0,
      maxLife: 0.45,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      scale: 0.15,
    })),
  })

  const { dustGeo, dustMat, ringGeo, ringMat, dummy } = useMemo(() => {
    const dustGeo = new DodecahedronGeometry(0.18, 0)
    const dustMat = new MeshBasicMaterial({
      color: '#f5e7c8',
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    })
    const ringGeo = new TorusGeometry(0.55, 0.045, 8, 24)
    ringGeo.rotateX(Math.PI / 2)
    const ringMat = new MeshBasicMaterial({
      color: '#72f0dc',
      transparent: true,
      opacity: 0.72,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    return { dustGeo, dustMat, ringGeo, ringMat, dummy: new Object3D() }
  }, [])

  useEffect(
    () => () => {
      dustGeo.dispose()
      dustMat.dispose()
      ringGeo.dispose()
      ringMat.dispose()
    },
    [dustGeo, dustMat, ringGeo, ringMat],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = stateRef.current
    const port = game.port
    const ctrl = game.controller

    const spawnDust = (x: number, y: number, z: number, vx: number, vy: number, vz: number, scale: number) => {
      const p = st.puffs[st.nextIdx]
      st.nextIdx = (st.nextIdx + 1) % MAX_DUST
      p.life = 0.42
      p.maxLife = 0.42
      p.x = x
      p.y = y
      p.z = z
      p.vx = vx
      p.vy = vy
      p.vz = vz
      p.scale = scale
    }

    if (port && ctrl && game.snapshot.state === 'PLAYING') {
      const pos = port.position
      const grounded = port.isGroundedRaw

      // Landing radial dust burst
      if (grounded && !st.wasGrounded) {
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2
          spawnDust(pos.x, pos.y + 0.08, pos.z, Math.cos(ang) * 1.4, 0.55, Math.sin(ang) * 1.4, 0.85)
        }
      }
      st.wasGrounded = grounded

      // Footstep dust puffs while sprinting
      if (grounded && ctrl.sprintActive && ctrl.moveSpeed > 2.5) {
        st.stepAccum += dt
        if (st.stepAccum >= 0.14) {
          st.stepAccum = 0
          spawnDust(
            pos.x + (Math.random() - 0.5) * 0.25,
            pos.y + 0.06,
            pos.z + (Math.random() - 0.5) * 0.25,
            (Math.random() - 0.5) * 0.4,
            0.45,
            (Math.random() - 0.5) * 0.4,
            0.6,
          )
        }
      } else {
        st.stepAccum = 0
      }

      // Air-jump Anemo wind ring
      if (ctrl.airJumpCount > st.lastAirJumps) {
        st.ringLife = 0.36
        st.ringX = pos.x
        st.ringY = pos.y + 0.1
        st.ringZ = pos.z
      }
      st.lastAirJumps = ctrl.airJumpCount

      // Subtle body bank-lean when turning while moving
      const yawDelta = Math.atan2(Math.sin(ctrl.facingYaw - st.lastYaw), Math.cos(ctrl.facingYaw - st.lastYaw))
      st.lastYaw = ctrl.facingYaw
      const targetLean = ctrl.moveSpeed > 1.2 ? Math.max(-0.085, Math.min(0.085, yawDelta * 1.6)) : 0
      st.lean += (targetLean - st.lean) * Math.min(1, dt * 10)
      if (game.visual) game.visual.rotation.z = st.lean
    }

    // Update dust pool
    if (dustRef.current) {
      for (let i = 0; i < MAX_DUST; i++) {
        const p = st.puffs[i]
        if (p.life > 0) {
          p.life -= dt
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.z += p.vz * dt
          p.vy *= 0.94
          const frac = Math.max(0, p.life / p.maxLife)
          const sc = p.scale * (1.35 - frac * 0.6) * frac
          dummy.position.set(p.x, p.y, p.z)
          dummy.scale.setScalar(Math.max(0.001, sc))
        } else {
          dummy.position.set(0, -999, 0)
          dummy.scale.setScalar(0.001)
        }
        dummy.updateMatrix()
        dustRef.current.setMatrixAt(i, dummy.matrix)
      }
      dustRef.current.instanceMatrix.needsUpdate = true
    }

    // Update Anemo wind ring
    if (ringRef.current) {
      if (st.ringLife > 0) {
        st.ringLife -= dt
        const prog = 1 - Math.max(0, st.ringLife / 0.36)
        ringRef.current.visible = true
        ringRef.current.position.set(st.ringX, st.ringY, st.ringZ)
        ringRef.current.scale.setScalar(0.6 + prog * 2.1)
      } else {
        ringRef.current.visible = false
      }
    }
  })

  return (
    <group name="character-vfx">
      <instancedMesh ref={dustRef} args={[dustGeo, dustMat, MAX_DUST]} frustumCulled={false} />
      <mesh ref={ringRef} geometry={ringGeo} material={ringMat} visible={false} />
    </group>
  )
}
