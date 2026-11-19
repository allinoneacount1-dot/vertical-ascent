// 12 Hidden Sky Relics (Golden Origami Spirit Birds) rendered in 1 InstancedMesh (1 draw call, zero collider).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Matrix4, MeshStandardMaterial, OctahedronGeometry, Object3D } from 'three'
import type { LoadedLevel } from './levels.ts'
import { SKY_RELICS } from './relicsData.ts'
import { game } from '../game/game.ts'

const PICKUP_RADIUS_SQ = 1.95 * 1.95
const dummy = new Object3D()
const zeroMat = new Matrix4().makeScale(0, 0, 0)

export function SkyRelics({ level }: { level: LoadedLevel }) {
  const active = level.id === 'main'
  const meshRef = useRef<InstancedMesh>(null)

  const { geo, mat } = useMemo(() => {
    const geo = new OctahedronGeometry(0.46, 0)
    const mat = new MeshStandardMaterial({
      color: '#ffd666',
      emissive: '#ffaa22',
      emissiveIntensity: 1.35,
      roughness: 0.25,
      metalness: 0.55,
    })
    return { geo, mat }
  }, [])

  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )

  useFrame(({ clock }) => {
    const inst = meshRef.current
    if (!active || inst == null) return
    const t = clock.elapsedTime
    const p = game.port?.position
    const playing = game.snapshot.state === 'PLAYING'

    for (let i = 0; i < SKY_RELICS.length; i++) {
      const r = SKY_RELICS[i]
      if (game.collectedRelics.has(r.id)) {
        inst.setMatrixAt(i, zeroMat)
        continue
      }
      const bob = Math.sin(t * 2.4 + i * 0.9) * 0.24
      const rx = r.pos[0]
      const ry = r.pos[1] + bob
      const rz = r.pos[2]
      dummy.position.set(rx, ry, rz)
      dummy.rotation.set(0.35, t * 1.6 + i, 0.25)
      dummy.scale.set(1.15, 0.72, 1.15)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)

      if (playing && p != null) {
        const dx = p.x - rx
        const dy = p.y + 0.95 - ry
        const dz = p.z - rz
        if (dx * dx + dy * dy + dz * dz <= PICKUP_RADIUS_SQ) {
          game.collectRelic(r.id, r.name)
        }
      }
    }
    inst.instanceMatrix.needsUpdate = true
  })

  if (!active) return null
  return <instancedMesh ref={meshRef} name="sky-relics" args={[geo, mat, SKY_RELICS.length]} frustumCulled={false} />
}
