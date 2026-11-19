// 3D Personal Best Flag (Tahap 3): renders an animated waving Ghibli crimson-gold cloth flag
// directly in the 3D world at the player's previous Personal Best height (from localStorage).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, PlaneGeometry } from 'three'
import type { Group, Mesh } from 'three'
import type { LoadedLevel } from './levels.ts'
import { routePlatforms } from './schema.ts'
import { game } from '../game/game.ts'

export function PersonalBestFlag({ level }: { level: LoadedLevel }) {
  const groupRef = useRef<Group>(null)
  const clothRef = useRef<Mesh>(null)

  const route = useMemo(() => routePlatforms(level.data), [level])
  const clothGeo = useMemo(() => new PlaneGeometry(1.9, 1.05, 10, 4), [])

  useEffect(() => () => clothGeo.dispose(), [clothGeo])

  useFrame((state) => {
    const g = groupRef.current
    if (!g) return
    const bestH = game.records.bestHeightM
    if (bestH < 2 || route.length === 0) {
      g.visible = false
      return
    }
    // Find nearest route platform at or closest to bestH
    let bestPad = route[0]
    let bestDiff = Infinity
    for (const p of route) {
      const diff = Math.abs(p.pos[1] - level.data.spawn[1] - bestH)
      if (diff < bestDiff) {
        bestDiff = diff
        bestPad = p
      }
    }
    g.visible = true
    g.position.set(bestPad.pos[0] + 1.35, bestPad.pos[1], bestPad.pos[2] + 1.35)

    // Animate cloth vertices with gentle Ghibli wind wave
    const posAttr = clothGeo.getAttribute('position')
    const t = state.clock.elapsedTime * 4.5 + game.challenges.windIntensity * 6
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i)
      const pin = (x + 0.95) / 1.9 // 0 at pole, 1 at trailing edge
      const wave = Math.sin(pin * 5.2 - t) * 0.18 * pin + Math.cos(pin * 2.8 - t * 0.7) * 0.06 * pin
      posAttr.setZ(i, wave)
    }
    posAttr.needsUpdate = true
  })

  return (
    <group ref={groupRef} visible={false} name="personal-best-flag">
      {/* Gilded wooden flagpole */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.075, 3.6, 8]} />
        <meshStandardMaterial color="#e0b85c" metalness={0.45} roughness={0.38} />
      </mesh>
      <mesh position={[0, 3.68, 0]}>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshStandardMaterial color="#fff1b8" emissive="#ffd15c" emissiveIntensity={1.1} roughness={0.3} />
      </mesh>
      {/* Waving crimson pennant */}
      <mesh ref={clothRef} geometry={clothGeo} position={[0.98, 3.05, 0]}>
        <meshStandardMaterial
          color="#d94545"
          emissive="#7a1b1b"
          emissiveIntensity={0.35}
          roughness={0.68}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
}
