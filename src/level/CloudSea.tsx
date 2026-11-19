// Pillar 2 (Wave Worldbuilding):
// - Two instanced Cloud Sea rings at z1->z2 (~135 m) and z3->z4 (~345 m) with a wide clear opening
//   around the climbing corridor (r_inner >= 122 m) so TEST-37 424/424 sightlines remain untouched.
// - Subtle celestial Star Dome fading in smoothly above 340 m (z4 dusk -> indigo sky).
// - Total draw calls: 3 (2 InstancedMesh cloud rings + 1 Points star dome).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
} from 'three'
import type { LoadedLevel } from './levels.ts'
import { game } from '../game/game.ts'

import { CLOUD_SEA_ALTITUDES } from './worldMeta.ts'
const PUFFS_PER_LAYER = 76
const STAR_COUNT = 320

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CLOUD_LOW_COL = new Color('#fff8ee')
const CLOUD_GOLD_COL = new Color('#ffe0b8')
const CLOUD_DUSK_COL = new Color('#c2cceb')
const tmpCloud = new Color()

function CloudLayer({ altitude, seed, speed }: { altitude: number; seed: number; speed: number }) {
  const meshRef = useRef<InstancedMesh>(null)
  const geo = useMemo(() => new IcosahedronGeometry(1, 1), [])
  const mat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#fff8ee',
        emissive: '#d8e4f2',
        emissiveIntensity: 0.22,
        roughness: 0.96,
        transparent: true,
        opacity: 0.84,
      }),
    [],
  )

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new Object3D()
    const rng = mulberry32(seed)
    for (let i = 0; i < PUFFS_PER_LAYER; i++) {
      const ang = (i / PUFFS_PER_LAYER) * Math.PI * 2 + (rng() - 0.5) * 0.25
      // Keep a wide clear opening around the climbing tower corridor (r >= 125 m)
      const r = 128 + rng() * 240
      const x = Math.cos(ang) * r
      const z = Math.sin(ang) * r
      const y = (rng() - 0.5) * 14
      const sx = 22 + rng() * 34
      const sy = 6.5 + rng() * 7.5
      const sz = 18 + rng() * 28
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, rng() * Math.PI, 0)
      dummy.scale.set(sx, sy, sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [seed])

  useFrame((_, dt) => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.rotation.y += Math.min(dt, 0.05) * speed
    const hRatio = game.level.summitM > 0 ? Math.max(0, Math.min(1, game.run.heightM / game.level.summitM)) : 0
    if (hRatio < 0.6) tmpCloud.copy(CLOUD_LOW_COL).lerp(CLOUD_GOLD_COL, hRatio / 0.6)
    else tmpCloud.copy(CLOUD_GOLD_COL).lerp(CLOUD_DUSK_COL, (hRatio - 0.6) / 0.4)
    mat.color.copy(tmpCloud)
  })

  return (
    <instancedMesh
      ref={meshRef}
      name={`cloud-sea-${altitude}`}
      position={[0, altitude, 0]}
      args={[geo, mat, PUFFS_PER_LAYER]}
      frustumCulled={false}
    />
  )
}

function StarDome() {
  const { points, geom, mat } = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3)
    const rng = mulberry32(7711)
    const radius = 1450
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = rng() * Math.PI * 2
      // Upper hemisphere stars (elevation 12° to 88°)
      const phi = 0.05 + rng() * (Math.PI * 0.44)
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.cos(phi)
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
    }
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(positions, 3))
    const mat = new PointsMaterial({
      color: '#fff6dc',
      size: 6.5,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
      sizeAttenuation: true,
    })
    const points = new Points(geom, mat)
    points.name = 'star-dome'
    points.frustumCulled = false
    points.renderOrder = 0
    return { points, geom, mat }
  }, [])

  useEffect(
    () => () => {
      geom.dispose()
      mat.dispose()
    },
    [geom, mat],
  )

  const starRef = useRef({ points, mat })
  useFrame(({ camera }) => {
    const s = starRef.current
    s.points.position.copy(camera.position)
    const h = game.run.heightM
    // Fade star dome in smoothly between 330 m and 440 m (z4 dusk -> indigo)
    const opacity = Math.max(0, Math.min(0.92, ((h - 330) / 110) * 0.92))
    s.mat.opacity = opacity
    s.points.visible = opacity > 0.01
  })

  return <primitive object={points} />
}

export function CloudSea({ level }: { level: LoadedLevel }) {
  const active = useMemo(() => level.id === 'main', [level.id])
  if (!active) return null
  return (
    <group name="cloud-sea-system">
      <CloudLayer altitude={CLOUD_SEA_ALTITUDES[0]} seed={1351} speed={0.008} />
      <CloudLayer altitude={CLOUD_SEA_ALTITUDES[1]} seed={3452} speed={-0.011} />
      <StarDome />
    </group>
  )
}
