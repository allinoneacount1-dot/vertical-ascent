// Pillar 1 & 3 (Wave Worldbuilding):
// - 360° Ghibli Ground Vista (y <= -0.15 m, outside start plaza r > 48 m): layered rolling meadow hills,
//   shimmering river/lake basin, instanced terracotta village houses & stylized trees, distant pale-blue mountain ring.
// - 5 Distant Decorative Floating Islands (r = 175-255 m, z2-z4, non-collider) with falling waterfalls into the clouds.
// - Instanced circling flock of Ghibli birds in z1-z2 (non-collider, outside climbing corridor).
// Built with InstancedMesh + shared materials (~9 draw calls total, zero TEST-37 sightline impact).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import type { BufferGeometry, FogExp2 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
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

/** Shared valley terrain height sampler so cottages and trees sit flush on the hills. */
function valleyTerrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const ang = Math.atan2(z, x)
  const t = Math.max(0, Math.min(1, (r - 58) / 260))
  const hill =
    (Math.sin(ang * 3 + 0.5) * 10 + Math.cos(ang * 5 - 1.2) * 7 + Math.sin(r * 0.025) * 6) * t * t
  const riverCut = Math.exp(-Math.pow((r - 128) / 28, 2)) * -5.2
  const outerRise = Math.max(0, (r - 360) / 280) ** 2 * 42
  return -1.2 + hill + riverCut + outerRise
}

/** Gently sculpted rolling Ghibli valley hills outside the start plaza (r = 52..620 m). */
function buildValleyTerrainGeometry(): RingGeometry {
  const geo = new RingGeometry(48, 640, 72, 18)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, valleyTerrainHeight(x, z))
  }
  geo.computeVertexNormals()
  return geo
}

/** Distant aerial-perspective mountain silhouette ring. */
function buildMountainRingGeometry(
  rTop: number,
  rBot: number,
  height: number,
  yOffset: number,
  phase: number,
  amp: number,
): CylinderGeometry {
  const geo = new CylinderGeometry(rTop, rBot, height, 72, 3, true)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ang = Math.atan2(z, x)
    if (y > 0) {
      const ridge =
        (Math.sin(ang * 7 + phase) * 34 +
          Math.cos(ang * 13 + phase * 1.7 + 0.8) * 22 +
          Math.sin(ang * 23 - phase * 0.6 - 0.4) * 11) *
        amp
      pos.setY(i, y + ridge)
    }
  }
  geo.translate(0, yOffset, 0)
  geo.computeVertexNormals()
  return geo
}

/** Mondstadt/Ghibli pitched gable roof + stone chimney merged into one instanced geometry. */
function buildCottageRoofGeometry(): BufferGeometry {
  const roof = new ConeGeometry(0.86, 0.72, 4).toNonIndexed()
  roof.rotateY(Math.PI / 4)
  roof.translate(0, 0.36, 0)
  const chimney = new BoxGeometry(0.18, 0.42, 0.18).toNonIndexed()
  chimney.translate(0.24, 0.56, 0.12)
  const merged = mergeGeometries([roof, chimney], false)!
  roof.dispose()
  chimney.dispose()
  return merged
}

/** Warm glowing cottage windows wrapped around all 4 facades. */
function buildCottageWindowGeometry(): BufferGeometry {
  const w1 = new BoxGeometry(1.03, 0.24, 0.24).toNonIndexed()
  w1.translate(0, 0.08, 0.18)
  const w2 = new BoxGeometry(0.24, 0.24, 1.03).toNonIndexed()
  w2.translate(0.16, 0.08, 0)
  const merged = mergeGeometries([w1, w2], false)!
  w1.dispose()
  w2.dispose()
  return merged
}

/** Genshin/Ghibli 3-cluster tree canopy with sphere-blended soft normals for painterly shading. */
function buildMultiClusterCanopyGeometry(): BufferGeometry {
  const puffs: Array<[number, number, number, number]> = [
    [0, 0.55, 0, 1.85],
    [-1.15, -0.15, 0.65, 1.45],
    [1.15, -0.05, -0.55, 1.5],
    [0.15, -0.2, 1.15, 1.3],
  ]
  const parts = puffs.map(([px, py, pz, r]) => {
    const s = new SphereGeometry(r, 9, 7).toNonIndexed()
    s.translate(px, py, pz)
    return s
  })
  const merged = mergeGeometries(parts, false)!
  for (const p of parts) p.dispose()
  // Soft anime/Ghibli foliage normals radiating smoothly from canopy core
  const pos = merged.attributes.position
  const norm = merged.attributes.normal
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i) + 0.45, pos.getZ(i)).normalize()
    norm.setXYZ(i, v.x, v.y, v.z)
  }
  norm.needsUpdate = true
  return merged
}

type BirdSeed = {
  radius: number
  baseY: number
  speed: number
  phase: number
  bobAmp: number
  dir: 1 | -1
}

function syncVistaUniforms(
  waterUniforms: { uTime: { value: number }; uFogColor: { value: Color } },
  waterfallUniforms: { uTime: { value: number } },
  t: number,
  fog: FogExp2 | null,
): void {
  waterUniforms.uTime.value = t
  waterfallUniforms.uTime.value = t
  if (fog != null) waterUniforms.uFogColor.value.copy(fog.color)
}

export function WorldVista({ level }: { level: LoadedLevel }) {
  const active = useMemo(() => level.id === 'main', [level.id])

  const housesRef = useRef<InstancedMesh>(null)
  const roofsRef = useRef<InstancedMesh>(null)
  const windowsRef = useRef<InstancedMesh>(null)
  const trunksRef = useRef<InstancedMesh>(null)
  const canopiesRef = useRef<InstancedMesh>(null)
  const birdsRef = useRef<InstancedMesh>(null)
  const waterfallsRef = useRef<InstancedMesh>(null)

  const {
    valleyGeo,
    mountainNearGeo,
    mountainMidGeo,
    mountainFarGeo,
    cottageWallGeo,
    cottageRoofGeo,
    cottageWindowGeo,
    treeCanopyGeo,
    grassMat,
    lakeMat,
    waterUniforms,
    mountainNearMat,
    mountainMidMat,
    mountainFarMat,
    houseMat,
    roofMat,
    windowMat,
    trunkMat,
    canopyMat,
    islandRockMat,
    islandCapMat,
    waterfallMat,
    waterfallUniforms,
    birdGeo,
    birdMat,
  } = useMemo(() => {
      const mossTex = getSurfaceTextures('moss')
      const valleyGeo = buildValleyTerrainGeometry()
      const mountainNearGeo = buildMountainRingGeometry(590, 650, 95, 22, 0.3, 0.65)
      const mountainMidGeo = buildMountainRingGeometry(740, 810, 155, 52, 1.8, 1.05)
      const mountainFarGeo = buildMountainRingGeometry(910, 980, 220, 86, 3.4, 1.45)
      const cottageWallGeo = new BoxGeometry(1, 1, 1)
      const cottageRoofGeo = buildCottageRoofGeometry()
      const cottageWindowGeo = buildCottageWindowGeometry()
      const treeCanopyGeo = buildMultiClusterCanopyGeometry()
      const grassMat = new MeshStandardMaterial({
        color: '#79a86d',
        roughness: 0.94,
        ...(mossTex ? { map: mossTex.map } : {}),
      })
      // Genshin/Ghibli stylized valley water: dual ripples, shoreline foam, sunlit sparkles & horizon fog blend
      const waterUniforms = {
        uTime: { value: 0 },
        uDeepColor: { value: new Color('#2d7fb0') },
        uShallowColor: { value: new Color('#62c4d4') },
        uFoamColor: { value: new Color('#effbff') },
        uSunColor: { value: new Color('#fff4cf') },
        uFogColor: { value: new Color('#ecd8c2') },
      }
      const lakeMat = new ShaderMaterial({
        uniforms: waterUniforms,
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uDeepColor;
          uniform vec3 uShallowColor;
          uniform vec3 uFoamColor;
          uniform vec3 uSunColor;
          uniform vec3 uFogColor;
          varying vec3 vWorldPos;
          void main() {
            float r = length(vWorldPos.xz);
            float bankEdge = min(abs(r - 100.0), abs(r - 158.0));
            float shallow = smoothstep(14.0, 0.0, bankEdge);
            float w1 = sin(vWorldPos.x * 0.24 + uTime * 1.15 + cos(vWorldPos.z * 0.19 - uTime * 0.8));
            float w2 = cos(vWorldPos.z * 0.31 - uTime * 1.45 + sin(vWorldPos.x * 0.22 + uTime * 0.9));
            float ripple = 0.5 + 0.5 * (w1 * 0.55 + w2 * 0.45);
            vec3 col = mix(uDeepColor, uShallowColor, shallow * 0.72 + ripple * 0.22);
            // Animated shoreline foam along inner & outer banks
            float foamWave = sin(bankEdge * 1.35 - uTime * 2.4 + w1 * 1.6);
            float foam = smoothstep(4.2, 0.6, bankEdge) * smoothstep(0.15, 0.8, foamWave);
            float innerFoam = smoothstep(1.3, 0.0, bankEdge) * 0.85;
            col = mix(col, uFoamColor, clamp(foam * 0.7 + innerFoam, 0.0, 0.92));
            // Painterly sunlit water sparkles
            float sparkle = pow(max(0.0, w1 * w2), 5.0) * 0.55;
            col += uSunColor * sparkle;
            // Distance fog blend matching FogExp2
            float dist = length(cameraPosition - vWorldPos);
            float fogFactor = 1.0 - exp(-pow(dist * 0.00062, 2.0));
            col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      const mountainNearMat = new MeshBasicMaterial({
        color: '#6b949c',
        side: DoubleSide,
        transparent: true,
        opacity: 0.82,
      })
      const mountainMidMat = new MeshBasicMaterial({
        color: '#7fa4c4',
        side: DoubleSide,
        transparent: true,
        opacity: 0.68,
      })
      const mountainFarMat = new MeshBasicMaterial({
        color: '#a9c1da',
        side: DoubleSide,
        transparent: true,
        opacity: 0.52,
      })
      const houseMat = new MeshStandardMaterial({ color: '#f0e2c8', roughness: 0.88 })
      const roofMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 })
      const windowMat = new MeshStandardMaterial({
        color: '#ffe3a8',
        emissive: '#ffb347',
        emissiveIntensity: 0.85,
        roughness: 0.35,
      })
      const trunkMat = new MeshStandardMaterial({ color: '#6b4a33', roughness: 0.92 })
      const canopyMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.82 })
      const islandRockMat = new MeshStandardMaterial({ color: '#8a8275', roughness: 0.92 })
      const islandCapMat = new MeshStandardMaterial({ color: '#82b578', roughness: 0.86 })
      // Scrolling stylized waterfall shader with crest foam & bottom plunge mist
      const waterfallUniforms = {
        uTime: { value: 0 },
        uWaterColor: { value: new Color('#9fe4f8') },
        uFoamColor: { value: new Color('#f4fdff') },
      }
      const waterfallMat = new ShaderMaterial({
        uniforms: waterfallUniforms,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uWaterColor;
          uniform vec3 uFoamColor;
          varying vec2 vUv;
          void main() {
            float flow = vUv.y * 8.0 + uTime * 3.8;
            float s1 = 0.5 + 0.5 * sin(vUv.x * 22.0 + sin(flow * 0.8) * 1.4);
            float s2 = 0.5 + 0.5 * sin(vUv.x * 42.0 - flow * 1.6);
            float streaks = smoothstep(0.32, 0.92, s1 * 0.6 + s2 * 0.4);
            float topCrest = smoothstep(0.82, 1.0, vUv.y);
            float bottomMist = smoothstep(0.24, 0.0, vUv.y);
            float sideSoft = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            vec3 col = mix(uWaterColor, uFoamColor, clamp(streaks * 0.62 + topCrest * 0.75 + bottomMist * 0.85, 0.0, 1.0));
            float alpha = sideSoft * (0.48 + streaks * 0.34 + topCrest * 0.25) * smoothstep(0.0, 0.08, vUv.y);
            gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.86));
          }
        `,
      })
      // Minimal V-wing bird silhouette (single instanced draw call)
      const birdGeo = new ConeGeometry(0.42, 1.35, 3)
      birdGeo.rotateX(Math.PI / 2)
      birdGeo.scale(2.4, 0.28, 1.0)
      const birdMat = new MeshBasicMaterial({ color: '#fff8ec' })
      return {
        valleyGeo,
        mountainNearGeo,
        mountainMidGeo,
        mountainFarGeo,
        cottageWallGeo,
        cottageRoofGeo,
        cottageWindowGeo,
        treeCanopyGeo,
        grassMat,
        lakeMat,
        waterUniforms,
        mountainNearMat,
        mountainMidMat,
        mountainFarMat,
        houseMat,
        roofMat,
        windowMat,
        trunkMat,
        canopyMat,
        islandRockMat,
        islandCapMat,
        waterfallMat,
        waterfallUniforms,
        birdGeo,
        birdMat,
      }
    }, [])

  useEffect(
    () => () => {
      valleyGeo.dispose()
      mountainNearGeo.dispose()
      mountainMidGeo.dispose()
      mountainFarGeo.dispose()
      cottageWallGeo.dispose()
      cottageRoofGeo.dispose()
      cottageWindowGeo.dispose()
      treeCanopyGeo.dispose()
      grassMat.dispose()
      lakeMat.dispose()
      mountainNearMat.dispose()
      mountainMidMat.dispose()
      mountainFarMat.dispose()
      houseMat.dispose()
      roofMat.dispose()
      windowMat.dispose()
      trunkMat.dispose()
      canopyMat.dispose()
      islandRockMat.dispose()
      islandCapMat.dispose()
      waterfallMat.dispose()
      birdGeo.dispose()
      birdMat.dispose()
    },
    [
      valleyGeo,
      mountainNearGeo,
      mountainMidGeo,
      mountainFarGeo,
      cottageWallGeo,
      cottageRoofGeo,
      cottageWindowGeo,
      treeCanopyGeo,
      grassMat,
      lakeMat,
      mountainNearMat,
      mountainMidMat,
      mountainFarMat,
      houseMat,
      roofMat,
      windowMat,
      trunkMat,
      canopyMat,
      islandRockMat,
      islandCapMat,
      waterfallMat,
      birdGeo,
      birdMat,
    ],
  )

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

    // 1. Mondstadt / Ghibli terracotta village clusters grounded on valleyTerrainHeight (outside river & start plaza)
    if (housesRef.current && roofsRef.current && windowsRef.current) {
      const roofPalette = [new Color('#c45b3e'), new Color('#a84632'), new Color('#cf7446'), new Color('#5c8a66')]
      let placed = 0
      for (let i = 0; i < WORLD_VISTA_META.villageHouses; i++) {
        const clusterAng = ((i % 4) * Math.PI) / 2 + 0.35
        const ang = clusterAng + (rng() - 0.5) * 0.65
        const r = 74 + rng() * 115
        if (Math.abs(r - 128) < 26) continue
        const x = Math.cos(ang) * r
        const z = Math.sin(ang) * r
        const groundY = valleyTerrainHeight(x, z)
        const w = 3.2 + rng() * 2.4
        const h = 2.8 + rng() * 2.2
        const d = 3.2 + rng() * 2.2
        const yaw = rng() * Math.PI * 2
        dummy.position.set(x, groundY + h * 0.5 - 0.35, z)
        dummy.rotation.set(0, yaw, 0)
        dummy.scale.set(w, h, d)
        dummy.updateMatrix()
        housesRef.current.setMatrixAt(placed, dummy.matrix)
        windowsRef.current.setMatrixAt(placed, dummy.matrix)

        dummy.position.set(x, groundY + h - 0.35, z)
        dummy.scale.set(w * 1.12, h * 0.85, d * 1.12)
        dummy.updateMatrix()
        roofsRef.current.setMatrixAt(placed, dummy.matrix)
        roofsRef.current.setColorAt(placed, roofPalette[placed % roofPalette.length])
        placed++
      }
      for (; placed < WORLD_VISTA_META.villageHouses; placed++) {
        dummy.position.set(0, -500, 0)
        dummy.scale.set(0.001, 0.001, 0.001)
        dummy.updateMatrix()
        housesRef.current.setMatrixAt(placed, dummy.matrix)
        roofsRef.current.setMatrixAt(placed, dummy.matrix)
        windowsRef.current.setMatrixAt(placed, dummy.matrix)
      }
      housesRef.current.instanceMatrix.needsUpdate = true
      roofsRef.current.instanceMatrix.needsUpdate = true
      windowsRef.current.instanceMatrix.needsUpdate = true
      if (roofsRef.current.instanceColor) roofsRef.current.instanceColor.needsUpdate = true
    }

    // 2. Instanced Genshin/Ghibli multi-cluster valley trees grounded on valleyTerrainHeight (avoiding river)
    if (trunksRef.current && canopiesRef.current) {
      const foliagePalette = [
        new Color('#4f9454'),
        new Color('#68ad57'),
        new Color('#3e7d4c'),
        new Color('#88bd5c'),
        new Color('#b8b852'),
      ]
      let placed = 0
      for (let i = 0; i < WORLD_VISTA_META.valleyTrees; i++) {
        const ang = rng() * Math.PI * 2
        const r = 68 + rng() * 215
        if (Math.abs(r - 128) < 28) continue
        const x = Math.cos(ang) * r
        const z = Math.sin(ang) * r
        const groundY = valleyTerrainHeight(x, z)
        const s = 0.85 + rng() * 1.4
        const yaw = rng() * Math.PI * 2
        dummy.position.set(x, groundY + 1.8 * s - 0.4, z)
        dummy.rotation.set(0, yaw, 0)
        dummy.scale.set(s, s, s)
        dummy.updateMatrix()
        trunksRef.current.setMatrixAt(placed, dummy.matrix)

        dummy.position.set(x, groundY + 4.2 * s - 0.4, z)
        dummy.scale.set(s * 1.08, s * 1.02, s * 1.08)
        dummy.updateMatrix()
        canopiesRef.current.setMatrixAt(placed, dummy.matrix)
        canopiesRef.current.setColorAt(placed, foliagePalette[placed % foliagePalette.length])
        placed++
      }
      for (; placed < WORLD_VISTA_META.valleyTrees; placed++) {
        dummy.position.set(0, -500, 0)
        dummy.scale.set(0.001, 0.001, 0.001)
        dummy.updateMatrix()
        trunksRef.current.setMatrixAt(placed, dummy.matrix)
        canopiesRef.current.setMatrixAt(placed, dummy.matrix)
      }
      trunksRef.current.instanceMatrix.needsUpdate = true
      canopiesRef.current.instanceMatrix.needsUpdate = true
      if (canopiesRef.current.instanceColor) canopiesRef.current.instanceColor.needsUpdate = true
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

  // Animate circling flock of birds + stylized water/waterfall shaders (zero per-frame allocations)
  useFrame((state) => {
    if (!active) return
    const t = state.clock.elapsedTime
    syncVistaUniforms(waterUniforms, waterfallUniforms, t, state.scene.fog as FogExp2 | null)
    if (!birdsRef.current) return
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
      {/* 3-Layer Aerial Perspective Mountain Silhouette Rings */}
      <mesh geometry={mountainNearGeo} material={mountainNearMat} />
      <mesh geometry={mountainMidGeo} material={mountainMidMat} />
      <mesh geometry={mountainFarGeo} material={mountainFarMat} />

      {/* Instanced Mondstadt/Ghibli terracotta village cottages with warm glowing windows */}
      <instancedMesh ref={housesRef} args={[cottageWallGeo, houseMat, WORLD_VISTA_META.villageHouses]} />
      <instancedMesh ref={roofsRef} args={[cottageRoofGeo, roofMat, WORLD_VISTA_META.villageHouses]} />
      <instancedMesh ref={windowsRef} args={[cottageWindowGeo, windowMat, WORLD_VISTA_META.villageHouses]} />

      {/* Instanced Genshin/Ghibli stylized multi-cluster valley trees */}
      <instancedMesh ref={trunksRef} args={[undefined, undefined, WORLD_VISTA_META.valleyTrees]} material={trunkMat}>
        <cylinderGeometry args={[0.32, 0.48, 3.6, 6]} />
      </instancedMesh>
      <instancedMesh ref={canopiesRef} args={[treeCanopyGeo, canopyMat, WORLD_VISTA_META.valleyTrees]} />

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
