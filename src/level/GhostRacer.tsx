// Personal Best Ghost Racer 3D spirit silhouette (Fase 1):
// Non-collider translucent cyan-gold Ghibli wisp + halo ring racing alongside the player on main runs.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, CapsuleGeometry, Group, MeshBasicMaterial, TorusGeometry } from 'three'
import type { LoadedLevel } from './levels.ts'
import type { GhostPose } from '../game/ghost.ts'
import { game } from '../game/game.ts'

const pose: GhostPose = { x: 0, y: 0, z: 0, yaw: 0, active: false }

export function GhostRacer({ level }: { level: LoadedLevel }) {
  const active = level.id === 'main'
  const groupRef = useRef<Group>(null)

  const { bodyGeo, haloGeo, bodyMat, haloMat } = useMemo(() => {
    const bodyGeo = new CapsuleGeometry(0.28, 1.05, 6, 12)
    const haloGeo = new TorusGeometry(0.46, 0.04, 8, 24)
    haloGeo.rotateX(Math.PI / 2)
    const bodyMat = new MeshBasicMaterial({
      color: '#72eac0',
      transparent: true,
      opacity: 0.44,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const haloMat = new MeshBasicMaterial({
      color: '#ffd166',
      transparent: true,
      opacity: 0.72,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    return { bodyGeo, haloGeo, bodyMat, haloMat }
  }, [])

  useEffect(
    () => () => {
      bodyGeo.dispose()
      haloGeo.dispose()
      bodyMat.dispose()
      haloMat.dispose()
    },
    [bodyGeo, haloGeo, bodyMat, haloMat],
  )

  useFrame(({ clock }) => {
    const g = groupRef.current
    if (!active || g == null) return
    if (game.snapshot.state !== 'PLAYING' || game.snapshot.mode !== 'run') {
      g.visible = false
      return
    }
    game.ghost.sampleAt(game.run.timerMs, pose)
    if (!pose.active) {
      g.visible = false
      return
    }
    g.visible = true
    g.position.set(pose.x, pose.y + 0.92 + Math.sin(clock.elapsedTime * 4) * 0.06, pose.z)
    g.rotation.y = pose.yaw
  })

  if (!active) return null
  return (
    <group ref={groupRef} name="ghost-racer" visible={false}>
      <mesh geometry={bodyGeo} material={bodyMat} />
      <mesh geometry={haloGeo} material={haloMat} position={[0, 0.82, 0]} />
    </group>
  )
}
