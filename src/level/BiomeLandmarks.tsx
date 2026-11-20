// Iconic Genshin Impact x Studio Ghibli Biome Landmarks (Gelombang 3):
// - Z1 (0-125 m): Mondstadt-style stone arch viaduct spanning the shimmering valley river
// - Z2 (125-250 m): Liyue Jueyun Karst cliff pavilions perched on outer rock spires
// - Z3 (250-375 m): Laputa-inspired broken floating sky aqueduct above the cloud sea
// - Z4 (375-500 m): Celestia ivory-gold sanctuary pillars & rotating golden astrolabe halo
// Strictly non-collider framing landmarks positioned outside the climbing corridor.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, MeshStandardMaterial } from 'three'
import type { LoadedLevel } from './levels.ts'
import { getSurfaceTextures } from './textures.ts'

const VIADUCT_ARCHES = [-24, -12, 0, 12, 24] as const
const PAVILION_SLOTS: readonly { id: string; pos: [number, number, number]; yaw: number; scale: number }[] = [
  { id: 'liyue-pavilion-east', pos: [68, 152, -48], yaw: -0.65, scale: 1.55 },
  { id: 'liyue-pavilion-west', pos: [-74, 214, 42], yaw: 0.9, scale: 1.7 },
]
const AQUEDUCT_SPANS = [-28, -14, 0, 14, 28] as const
const CELESTIA_PILLARS: readonly { id: string; pos: [number, number, number]; h: number }[] = [
  { id: 'celestia-p1', pos: [-54, 418, -46], h: 34 },
  { id: 'celestia-p2', pos: [62, 434, -52], h: 38 },
  { id: 'celestia-p3', pos: [-48, 462, 48], h: 32 },
  { id: 'celestia-p4', pos: [58, 478, 44], h: 42 },
]

export function BiomeLandmarks({ level }: { level: LoadedLevel }) {
  const active = level.id === 'main'
  const haloOuterRef = useRef<Group>(null)
  const haloInnerRef = useRef<Group>(null)
  const crystalRef = useRef<Group>(null)

  const mats = useMemo(() => {
    const stoneTex = getSurfaceTextures('stone')
    const cliffTex = getSurfaceTextures('cliff')
    const marbleTex = getSurfaceTextures('marble')
    const stone = new MeshStandardMaterial({
      color: '#dfd5c3',
      roughness: 0.88,
      ...(stoneTex ? { map: stoneTex.map, bumpMap: stoneTex.bumpMap, bumpScale: 0.08 } : {}),
    })
    const cliff = new MeshStandardMaterial({
      color: '#c49d76',
      roughness: 0.92,
      ...(cliffTex ? { map: cliffTex.map, bumpMap: cliffTex.bumpMap, bumpScale: 0.1 } : {}),
    })
    const marble = new MeshStandardMaterial({
      color: '#f5f0e6',
      roughness: 0.42,
      metalness: 0.08,
      ...(marbleTex ? { map: marbleTex.map, bumpMap: marbleTex.bumpMap, bumpScale: 0.05 } : {}),
    })
    const vermilion = new MeshStandardMaterial({ color: '#b83c2f', roughness: 0.72 })
    const tileRoof = new MeshStandardMaterial({ color: '#c48f3e', roughness: 0.55, metalness: 0.25 })
    const moss = new MeshStandardMaterial({ color: '#5fa059', roughness: 0.88 })
    const gold = new MeshStandardMaterial({
      color: '#f0c35e',
      emissive: '#d69a2c',
      emissiveIntensity: 0.32,
      roughness: 0.3,
      metalness: 0.68,
    })
    const lantern = new MeshStandardMaterial({
      color: '#fff1c2',
      emissive: '#ffbe55',
      emissiveIntensity: 1.5,
      roughness: 0.25,
    })
    const aether = new MeshStandardMaterial({
      color: '#9ef4ff',
      emissive: '#38d9f5',
      emissiveIntensity: 1.45,
      roughness: 0.2,
      metalness: 0.2,
    })
    return { stone, cliff, marble, vermilion, tileRoof, moss, gold, lantern, aether }
  }, [])

  useEffect(
    () => () => {
      mats.stone.dispose()
      mats.cliff.dispose()
      mats.marble.dispose()
      mats.vermilion.dispose()
      mats.tileRoof.dispose()
      mats.moss.dispose()
      mats.gold.dispose()
      mats.lantern.dispose()
      mats.aether.dispose()
    },
    [mats],
  )

  useFrame(({ clock }) => {
    if (!active) return
    const t = clock.elapsedTime
    if (haloOuterRef.current) {
      haloOuterRef.current.rotation.y = t * 0.14
      haloOuterRef.current.rotation.z = Math.sin(t * 0.25) * 0.12
    }
    if (haloInnerRef.current) {
      haloInnerRef.current.rotation.x = t * 0.22
      haloInnerRef.current.rotation.y = -t * 0.18
    }
    if (crystalRef.current) {
      crystalRef.current.rotation.y = t * 0.65
      crystalRef.current.position.y = Math.sin(t * 1.1) * 1.1
    }
  })

  if (!active) return null

  return (
    <group name="biome-landmarks">
      {/* Z1: Mondstadt-style stone arch viaduct spanning across the shimmering valley river */}
      <group name="z1-mondstadt-viaduct" position={[0, 3.2, -128]} rotation={[0, 0.18, 0]}>
        {/* Main roadway deck & stone parapets */}
        <mesh material={mats.stone} position={[0, 4.6, 0]}>
          <boxGeometry args={[68, 1.4, 7.6]} />
        </mesh>
        <mesh material={mats.stone} position={[0, 5.7, 3.4]}>
          <boxGeometry args={[68, 0.9, 0.7]} />
        </mesh>
        <mesh material={mats.stone} position={[0, 5.7, -3.4]}>
          <boxGeometry args={[68, 0.9, 0.7]} />
        </mesh>
        {VIADUCT_ARCHES.map((x) => (
          <group key={x} position={[x, 0, 0]}>
            {/* Masonry pier plunging into valley river */}
            <mesh material={mats.stone} position={[-6, -2.6, 0]}>
              <boxGeometry args={[2.6, 13.5, 8.2]} />
            </mesh>
            {/* Arch ring */}
            <mesh material={mats.stone} position={[0, 0.8, 0]}>
              <torusGeometry args={[5.4, 1.15, 8, 18, Math.PI]} />
            </mesh>
            {/* Warm Mondstadt bridge lantern posts */}
            <mesh material={mats.gold} position={[-6, 7.2, 3.4]}>
              <cylinderGeometry args={[0.14, 0.2, 2.2, 6]} />
            </mesh>
            <mesh material={mats.lantern} position={[-6, 8.5, 3.4]}>
              <octahedronGeometry args={[0.45, 0]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Z2: Liyue Jueyun Karst Cliff Pavilions on outer spires */}
      {PAVILION_SLOTS.map((pav) => (
        <group key={pav.id} name={pav.id} position={pav.pos} rotation={[0, pav.yaw, 0]} scale={pav.scale}>
          {/* Tall karst spire base */}
          <mesh material={mats.cliff} position={[0, -18, 0]}>
            <cylinderGeometry args={[6.2, 2.4, 36, 9]} />
          </mesh>
          <mesh material={mats.moss} position={[0, 0.35, 0]}>
            <cylinderGeometry args={[6.5, 6.3, 1.1, 9]} />
          </mesh>
          {/* Hexagonal stone platform */}
          <mesh material={mats.stone} position={[0, 1.1, 0]}>
            <cylinderGeometry args={[4.4, 4.9, 0.9, 6]} />
          </mesh>
          {/* 6 Vermilion pillars */}
          {[0, 1, 2, 3, 4, 5].map((k) => {
            const ang = (k * Math.PI) / 3
            return (
              <mesh key={k} material={mats.vermilion} position={[Math.cos(ang) * 3.2, 3.6, Math.sin(ang) * 3.2]}>
                <cylinderGeometry args={[0.2, 0.24, 4.4, 8]} />
              </mesh>
            )
          })}
          {/* Double-tier upturned Liyue pagoda roof */}
          <mesh material={mats.tileRoof} position={[0, 6.5, 0]}>
            <coneGeometry args={[5.5, 1.9, 6]} />
          </mesh>
          <mesh material={mats.tileRoof} position={[0, 8.2, 0]}>
            <coneGeometry args={[3.4, 1.8, 6]} />
          </mesh>
          <mesh material={mats.gold} position={[0, 9.45, 0]}>
            <sphereGeometry args={[0.42, 8, 8]} />
          </mesh>
          {/* Glowing hanging lantern inside pavilion */}
          <mesh material={mats.lantern} position={[0, 4.4, 0]}>
            <sphereGeometry args={[0.68, 8, 8]} />
          </mesh>
        </group>
      ))}

      {/* Z3: Laputa-inspired broken floating sky aqueduct above the cloud sea */}
      <group name="z3-laputa-aqueduct" position={[-66, 308, -62]} rotation={[0.04, 0.52, -0.03]}>
        {/* Broken stone water channel */}
        <mesh material={mats.stone} position={[0, 7.2, 0]}>
          <boxGeometry args={[72, 1.8, 5.2]} />
        </mesh>
        <mesh material={mats.moss} position={[-6, 8.2, 0]}>
          <boxGeometry args={[48, 0.55, 5.5]} />
        </mesh>
        <mesh material={mats.gold} position={[0, 6.2, 2.7]}>
          <boxGeometry args={[72, 0.35, 0.25]} />
        </mesh>
        {AQUEDUCT_SPANS.map((x, idx) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh material={mats.stone} position={[-7, -1.2, 0]}>
              <boxGeometry args={[2.8, 16.5 - (idx % 2) * 2.5, 5.6]} />
            </mesh>
            <mesh material={mats.stone} position={[0, 2.2, 0]}>
              <torusGeometry args={[6.2, 1.1, 8, 18, Math.PI]} />
            </mesh>
            {/* Hanging emerald moss vine */}
            <mesh material={mats.moss} position={[-5.4, -5.2, 2.8]}>
              <cylinderGeometry args={[0.25, 0.08, 7.5, 6]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Z4: Celestia Ivory-Gold Sanctuary Pillars & Rotating Astrolabe Halo */}
      <group name="z4-celestia-sanctuary">
        {CELESTIA_PILLARS.map((p) => (
          <group key={p.id} position={p.pos}>
            <mesh material={mats.marble}>
              <cylinderGeometry args={[1.65, 2.15, p.h, 8]} />
            </mesh>
            <mesh material={mats.gold} position={[0, p.h * 0.5 + 0.6, 0]}>
              <cylinderGeometry args={[2.5, 1.8, 1.2, 8]} />
            </mesh>
            <mesh material={mats.aether} position={[0, p.h * 0.5 + 2.8, 0]}>
              <octahedronGeometry args={[1.3, 0]} />
            </mesh>
          </group>
        ))}
        {/* Floating Celestial Astrolabe Halo high in the starry sky */}
        <group position={[18, 496, -78]}>
          <group ref={haloOuterRef}>
            <mesh material={mats.gold}>
              <torusGeometry args={[26, 0.72, 10, 48]} />
            </mesh>
          </group>
          <group ref={haloInnerRef}>
            <mesh material={mats.marble}>
              <torusGeometry args={[18, 0.52, 8, 40]} />
            </mesh>
          </group>
          <group ref={crystalRef}>
            <mesh material={mats.aether}>
              <octahedronGeometry args={[4.2, 0]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}
