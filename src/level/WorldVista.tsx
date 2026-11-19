// Pillar 1 & 3 (Wave Worldbuilding):
// - 360° Ghibli Ground Vista (y <= -0.15 m, outside start plaza r > 48 m): layered rolling meadow hills,
//   shimmering river/lake basin, instanced terracotta village houses & stylized trees, distant pale-blue mountain ring.
// - 5 Distant Decorative Floating Islands (r = 175-255 m, z2-z4, non-collider) with falling waterfalls into the clouds.
// - Instanced circling flock of Ghibli birds in z1-z2 (non-collider, outside climbing corridor).
// Built with InstancedMesh + shared materials (~9 draw calls total, zero TEST-37 sightline impact).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  Vector3,
} from 'three'
import type { LoadedLevel } from './levels.ts'
import { getSurfaceTextures } from './textures.ts'

import { DISTANT_ISLANDS, WORLD_VISTA_META } from './worldMeta.ts'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Gently sculpted rolling Ghibli valley hills outside the start plaza (r = 52..620 m). */
function buildValleyTerrainGeometry(): RingGeometry {
  const geo = new RingGeometry(48, 640, 72, 18)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const r = Math.hypot(x, z)
    const ang = Math.atan2(z, x)
    // Keep inner edge flush below y = -0.3 so start plaza never z-fights
    const t = Math.max(0, Math.min(1, (r - 58) / 260))
    const hill =
      (Math.sin(ang * 3 + 0.5) * 10 + Math.cos(ang * 5 - 1.2) * 7 + Math.sin(r * 0.025) * 6) * t * t
    // Subtle river depression on the south-west quadrant
    const riverCut = Math.exp(-Math.pow((r - 128) / 28, 2)) * -5.2
    const outerRise = Math.max(0, (r - 360) / 280) ** 2 * 42
    pos.setY(i, -1.2 + hill + riverCut + outerRise)
  }
  geo.computeVertexNormals()
  return geo
}

/** Distant pale-blue silhouette mountain ring at r = 640..840 m. */
function buildMountainRingGeometry(): CylinderGeometry {
  const geo = new CylinderGeometry(760, 820, 140, 64, 3, true)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ang = Math.atan2(z, x)
    if (y > 0) {
      const ridge =
        Math.sin(ang * 7) * 34 +
        Math.cos(ang * 13 + 0.8) * 22 +
        Math.sin(ang * 23 - 0.4) * 11
      pos.setY(i, y + ridge)
    }
  }
  geo.translate(0, 48, 0)
  geo.computeVertexNormals()
  return geo
}

type BirdSeed = {
  radius: number
  baseY: number
  speed: number
  phase: number
  bobAmp: number
  dir: 1 | -1
}

export function WorldVista({ level }: { level: LoadedLevel }) {
  const active = useMemo(() => level.id === 'main', [level.id])

  const housesRef = useRef<InstancedMesh>(null)
  const roofsRef = useRef<InstancedMesh>(null)
  const trunksRef = useRef<InstancedMesh>(null)
  const canopiesRef = useRef<InstancedMesh>(null)
  const birdsRef = useRef<InstancedMesh>(null)
  const waterfallsRef = useRef<InstancedMesh>(null)

  const { valleyGeo, mountainGeo, grassMat, lakeMat, mountainMat, houseMat, roofMat, trunkMat, canopyMat, islandRockMat, islandCapMat, waterfallMat, birdGeo, birdMat } =
    useMemo(() => {
      const mossTex = getSurfaceTextures('moss')
      const valleyGeo = buildValleyTerrainGeometry()
      const mountainGeo = buildMountainRingGeometry()
      const grassMat = new MeshStandardMaterial({
        color: '#79a86d',
        roughness: 0.94,
        ...(mossTex ? { map: mossTex.map } : {}),
      })
      const lakeMat = new MeshStandardMaterial({
        color: '#5fa8cf',
        emissive: '#1c4d6e',
        emissiveIntensity: 0.25,
        roughness: 0.18,
        metalness: 0.35,
      })
      const mountainMat = new MeshBasicMaterial({
        color: '#8ba8c4',
        side: DoubleSide,
        transparent: true,
        opacity: 0.72,
      })
      const houseMat = new MeshStandardMaterial({ color: '#c49d72', roughness: 0.9 })
      const roofMat = new MeshStandardMaterial({ color: '#6fb362', roughness: 0.84 })
      const trunkMat = new MeshStandardMaterial({ color: '#6e4c36', roughness: 0.92 })
      const canopyMat = new MeshStandardMaterial({ color: '#5d9658', roughness: 0.86 })
      const islandRockMat = new MeshStandardMaterial({ color: '#8a8275', roughness: 0.92 })
      const islandCapMat = new MeshStandardMaterial({ color: '#82b578', roughness: 0.86 })
      const waterfallMat = new MeshBasicMaterial({
        color: '#dff6ff',
        transparent: true,
        opacity: 0.62,
        side: DoubleSide,
        depthWrite: false,
      })
      // Minimal V-wing bird silhouette (single instanced draw call)
      const birdGeo = new ConeGeometry(0.42, 1.35, 3)
      birdGeo.rotateX(Math.PI / 2)
      birdGeo.scale(2.4, 0.28, 1.0)
      const birdMat = new MeshBasicMaterial({ color: '#fff8ec' })
      return {
        valleyGeo,
        mountainGeo,
        grassMat,
        lakeMat,
        mountainMat,
        houseMat,
        roofMat,
        trunkMat,
        canopyMat,
        islandRockMat,
        islandCapMat,
        waterfallMat,
        birdGeo,
        birdMat,
      }
    }, [])

  const birdSeeds = useMemo<BirdSeed[]>(() => {
    const rng = mulberry32(4301)
    return Array.from({ length: WORLD_VISTA_META.circlingBirds }, (_, i) => ({
      radius: 78 + rng() * 68,
      baseY: 28 + (i / WORLD_VISTA_META.circlingBirds) * 145,
      speed: 0.14 + rng() * 0.12,
      phase: rng() * Math.PI * 2,
      bobAmp: 1.4 + rng() * 2.2,
      dir: i % 2 === 0 ? 1 : -1,
    }))
  }, [])

  // Populate static InstancedMeshes once
  useEffect(() => {
    if (!active) return
    const dummy = new Object3D()
    const rng = mulberry32(9104)

    // 1. Mini Ghibli terracotta village clusters (r = 72..195 m, outside river & start plaza)
    if (housesRef.current && roofsRef.current) {
      for (let i = 0; i < WORLD_VISTA_META.villageHouses; i++) {
        const clusterAng = ((i % 4) * Math.PI) / 2 + 0.35
        const ang = clusterAng + (rng() - 0.5) * 0.65
        const r = 74 + rng() * 115
        if (Math.abs(r - 128) < 16) continue
        const x = Math.cos(ang) * r
        const z = Math.sin(ang) * r
        const w = 3.2 + rng() * 2.6
        const h = 2.8 + rng() * 2.4
        const d = 3.2 + rng() * 2.4
        const yaw = rng() * Math.PI * 2
        dummy.position.set(x, h / 2 - 0.8, z)
        dummy.rotation.set(0, yaw, 0)
        dummy.scale.set(w, h, d)
        dummy.updateMatrix()
        housesRef.current.setMatrixAt(i, dummy.matrix)

        dummy.position.set(x, h - 0.1, z)
        dummy.scale.set(w * 0.82, h * 0.55, d * 0.82)
        dummy.updateMatrix()
        roofsRef.current.setMatrixAt(i, dummy.matrix)
      }
      housesRef.current.instanceMatrix.needsUpdate = true
      roofsRef.current.instanceMatrix.needsUpdate = true
    }

    // 2. Instanced Ghibli valley trees (r = 68..280 m)
    if (trunksRef.current && canopiesRef.current) {
      for (let i = 0; i < WORLD_VISTA_META.valleyTrees; i++) {
        const ang = rng() * Math.PI * 2
        const r = 68 + rng() * 215
        const x = Math.cos(ang) * r
        const z = Math.sin(ang) * r
        const s = 0.85 + rng() * 1.4
        dummy.position.set(x, 1.8 * s - 0.8, z)
        dummy.rotation.set(0, rng() * Math.PI, 0)
        dummy.scale.set(s, s, s)
        dummy.updateMatrix()
        trunksRef.current.setMatrixAt(i, dummy.matrix)

        dummy.position.set(x, 4.4 * s - 0.8, z)
        dummy.scale.set(s * 1.15, s * 1.05, s * 1.15)
        dummy.updateMatrix()
        canopiesRef.current.setMatrixAt(i, dummy.matrix)
      }
      trunksRef.current.instanceMatrix.needsUpdate = true
      canopiesRef.current.instanceMatrix.needsUpdate = true
    }

    // 3. Waterfalls hanging from distant floating islands
    if (waterfallsRef.current) {
      for (let i = 0; i < DISTANT_ISLANDS.length; i++) {
        const isl = DISTANT_ISLANDS[i]
        const dirToOrigin = new Vector3(-isl.pos[0], 0, -isl.pos[2]).normalize()
        const wx = isl.pos[0] + dirToOrigin.x * (isl.radius * 0.78)
        const wz = isl.pos[2] + dirToOrigin.z * (isl.radius * 0.78)
        dummy.position.set(wx, isl.pos[1] - isl.waterfallHeight / 2 + 0.5, wz)
        dummy.rotation.set(0, Math.atan2(dirToOrigin.x, dirToOrigin.z), 0)
        dummy.scale.set(3.2, isl.waterfallHeight, 1)
        dummy.updateMatrix()
        waterfallsRef.current.setMatrixAt(i, dummy.matrix)
      }
      waterfallsRef.current.instanceMatrix.needsUpdate = true
    }
  }, [active])

  const birdDummy = useMemo(() => new Object3D(), [])
  const birdMat4 = useMemo(() => new Matrix4(), [])

  // Animate circling flock of birds (zero per-frame allocations)
  useFrame((state) => {
    if (!active || !birdsRef.current) return
    const t = state.clock.elapsedTime
    for (let i = 0; i < birdSeeds.length; i++) {
      const b = birdSeeds[i]
      const ang = b.phase + t * b.speed * b.dir
      const x = Math.cos(ang) * b.radius
      const z = Math.sin(ang) * b.radius
      const y = b.baseY + Math.sin(t * 1.3 + b.phase) * b.bobAmp
      const tangentYaw = Math.atan2(-Math.sin(ang) * b.dir, Math.cos(ang) * b.dir)
      const flap = 0.75 + Math.sin(t * 9.5 + i * 1.7) * 0.28
      birdDummy.position.set(x, y, z)
      birdDummy.rotation.set(0, tangentYaw, Math.sin(t * 1.2 + i) * 0.14)
      birdDummy.scale.set(1, flap, 1)
      birdDummy.updateMatrix()
      birdMat4.copy(birdDummy.matrix)
      birdsRef.current.setMatrixAt(i, birdMat4)
    }
    birdsRef.current.instanceMatrix.needsUpdate = true
  })

  if (!active) return null

  return (
    <group name="world-vista">
      {/* Ground valley hills */}
      <mesh geometry={valleyGeo} material={grassMat} receiveShadow />
      {/* Shimmering Ghibli valley river/lake basin */}
      <mesh position={[0, -3.4, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lakeMat}>
        <ringGeometry args={[100, 158, 56]} />
      </mesh>
      {/* Distant pale-blue mountain silhouette ring */}
      <mesh geometry={mountainGeo} material={mountainMat} />

      {/* Instanced terracotta village houses */}
      <instancedMesh ref={housesRef} args={[undefined, undefined, WORLD_VISTA_META.villageHouses]} material={houseMat}>
        <cylinderGeometry args={[0.72, 1.05, 2.6, 7]} />
      </instancedMesh>
      <instancedMesh ref={roofsRef} args={[undefined, undefined, WORLD_VISTA_META.villageHouses]} material={roofMat}>
        <dodecahedronGeometry args={[0.85, 0]} />
      </instancedMesh>

      {/* Instanced stylized valley trees */}
      <instancedMesh ref={trunksRef} args={[undefined, undefined, WORLD_VISTA_META.valleyTrees]} material={trunkMat}>
        <cylinderGeometry args={[0.32, 0.48, 3.6, 6]} />
      </instancedMesh>
      <instancedMesh ref={canopiesRef} args={[undefined, undefined, WORLD_VISTA_META.valleyTrees]} material={canopyMat}>
        <icosahedronGeometry args={[2.3, 1]} />
      </instancedMesh>

      {/* 5 Distant Decorative Floating Islands + Waterfalls (non-collider) */}
      {DISTANT_ISLANDS.map((isl) => (
        <group key={isl.id} position={isl.pos}>
          <mesh position={[0, -isl.depth / 2, 0]} material={islandRockMat}>
            <cylinderGeometry args={[isl.radius * 0.92, isl.radius * 0.16, isl.depth, 9]} />
          </mesh>
          <mesh position={[0, 1.4, 0]} material={islandCapMat}>
            <cylinderGeometry args={[isl.radius * 0.96, isl.radius * 1.02, 3.2, 9]} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={waterfallsRef} args={[undefined, undefined, DISTANT_ISLANDS.length]} material={waterfallMat}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>

      {/* Circling flock of Ghibli birds in z1-z2 */}
      <instancedMesh ref={birdsRef} args={[birdGeo, birdMat, WORLD_VISTA_META.circlingBirds]} frustumCulled={false} />
    </group>
  )
}
