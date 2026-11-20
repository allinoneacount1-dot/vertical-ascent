// Living Ghibli World & Environmental Storytelling Artifacts (Fase 6 — Gelombang A):
// - 900 instanced wind-swaying grass blades + 180 wildflowers driven by real-time windIntensity/windAngle
// - 16 fluttering cloth prayer banners (vertex-wave shader)
// - 8 ancient mossy stone lantern shrines (Toro) with proximity glow & chime
// - 6 spinning Ghibli brass-and-wood windmills reacting to Crosswind Gust
// - 6 fake volumetric sunbeams (additive fresnel God Rays, 0 post-processing cost)
// - 28 drifting Ghibli cumulus cloud billows + 12 mossy altars beneath Sky Relics + climber camp props
// Strictly non-collider visuals so TEST-37 (424/424 sightlines) and BVH budgets remain 100% intact.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { LoadedLevel } from './levels.ts'
import { colliderSize, groundTerrainHeight } from './procedural.ts'
import { RELAXED_CHECKPOINTS } from './challenges.ts'
import { SKY_RELICS } from './relicsData.ts'
import { game } from '../game/game.ts'
import { playLanternChime } from '../audio/engine.ts'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type ToroShrineSpec = { id: string; pos: [number, number, number]; zone: string }
export type WindmillSpec = { id: string; pos: [number, number, number]; yaw: number; scale: number }
export type BannerSpec = { id: string; pos: [number, number, number]; yaw: number; color: string }

const TORO_SHRINES: readonly ToroShrineSpec[] = [
  { id: 'toro-plaza-east', pos: [7.4, 0, -4.2], zone: 'z1' },
  { id: 'toro-plaza-west', pos: [-7.2, 0, -4.5], zone: 'z1' },
  { id: 'toro-z1-garden', pos: [11.5, 58, -8.5], zone: 'z1' },
  { id: 'toro-cp-125', pos: [RELAXED_CHECKPOINTS[0].pos[0] + 3.2, RELAXED_CHECKPOINTS[0].pos[1], RELAXED_CHECKPOINTS[0].pos[2] - 2.6], zone: 'z2' },
  { id: 'toro-cp-250', pos: [RELAXED_CHECKPOINTS[1].pos[0] + 3.2, RELAXED_CHECKPOINTS[1].pos[1], RELAXED_CHECKPOINTS[1].pos[2] - 2.6], zone: 'z3' },
  { id: 'toro-cp-375', pos: [RELAXED_CHECKPOINTS[2].pos[0] + 3.2, RELAXED_CHECKPOINTS[2].pos[1], RELAXED_CHECKPOINTS[2].pos[2] - 2.6], zone: 'z4' },
  { id: 'toro-z4-gate', pos: [52, 435, -12], zone: 'z4' },
  { id: 'toro-summit-edge', pos: [74, 500, -10.5], zone: 'z4' },
]

const WINDMILLS: readonly WindmillSpec[] = [
  { id: 'windmill-plaza-ridge', pos: [-16, 4.5, -14], yaw: 0.55, scale: 1.15 },
  { id: 'windmill-z1-outpost', pos: [24, 72, -18], yaw: -0.4, scale: 1.25 },
  { id: 'windmill-z2-deck', pos: [-22, 148, 16], yaw: 1.1, scale: 1.4 },
  { id: 'windmill-z2-upper', pos: [32, 215, -24], yaw: -0.9, scale: 1.3 },
  { id: 'windmill-z3-spire', pos: [-28, 305, -20], yaw: 0.7, scale: 1.5 },
  { id: 'windmill-z4-watch', pos: [42, 412, 22], yaw: -1.3, scale: 1.35 },
]

const BANNERS: readonly BannerSpec[] = [
  { id: 'banner-p1', pos: [-4.5, 3.2, -7.8], yaw: 0.2, color: '#c84b3c' },
  { id: 'banner-p2', pos: [4.5, 3.2, -7.8], yaw: -0.2, color: '#f2e2c4' },
  { id: 'banner-p3', pos: [-9.2, 3.4, 2.5], yaw: 1.4, color: '#3b8c7e' },
  { id: 'banner-p4', pos: [9.2, 3.4, 2.5], yaw: -1.4, color: '#c84b3c' },
  { id: 'banner-z1a', pos: [8.5, 42, -10], yaw: 0.4, color: '#f2e2c4' },
  { id: 'banner-z1b', pos: [-8.5, 86, 6], yaw: -0.6, color: '#c84b3c' },
  { id: 'banner-cp1a', pos: [RELAXED_CHECKPOINTS[0].pos[0] - 3.4, RELAXED_CHECKPOINTS[0].pos[1] + 3.2, RELAXED_CHECKPOINTS[0].pos[2] - 2.2], yaw: 0.1, color: '#c84b3c' },
  { id: 'banner-cp1b', pos: [RELAXED_CHECKPOINTS[0].pos[0] + 3.4, RELAXED_CHECKPOINTS[0].pos[1] + 3.2, RELAXED_CHECKPOINTS[0].pos[2] + 2.2], yaw: 2.9, color: '#f2e2c4' },
  { id: 'banner-z2a', pos: [14, 178, -12], yaw: 0.8, color: '#3b8c7e' },
  { id: 'banner-z2b', pos: [-14, 212, 10], yaw: -0.9, color: '#e6b450' },
  { id: 'banner-cp2a', pos: [RELAXED_CHECKPOINTS[1].pos[0] - 3.4, RELAXED_CHECKPOINTS[1].pos[1] + 3.2, RELAXED_CHECKPOINTS[1].pos[2] - 2.2], yaw: 0.2, color: '#3b8c7e' },
  { id: 'banner-cp2b', pos: [RELAXED_CHECKPOINTS[1].pos[0] + 3.4, RELAXED_CHECKPOINTS[1].pos[1] + 3.2, RELAXED_CHECKPOINTS[1].pos[2] + 2.2], yaw: 2.8, color: '#f2e2c4' },
  { id: 'banner-z3a', pos: [20, 310, -14], yaw: 0.5, color: '#e6b450' },
  { id: 'banner-cp3a', pos: [RELAXED_CHECKPOINTS[2].pos[0] - 3.4, RELAXED_CHECKPOINTS[2].pos[1] + 3.2, RELAXED_CHECKPOINTS[2].pos[2] - 2.2], yaw: 0.0, color: '#c84b3c' },
  { id: 'banner-cp3b', pos: [RELAXED_CHECKPOINTS[2].pos[0] + 3.4, RELAXED_CHECKPOINTS[2].pos[1] + 3.2, RELAXED_CHECKPOINTS[2].pos[2] + 2.2], yaw: 3.1, color: '#e6b450' },
  { id: 'banner-z4a', pos: [66, 472, -14], yaw: 0.3, color: '#f2e2c4' },
]

const GOD_RAY_SLOTS: readonly { pos: [number, number, number]; scale: [number, number, number] }[] = [
  { pos: [-18, 28, -22], scale: [14, 72, 14] },
  { pos: [24, 85, -16], scale: [16, 84, 16] },
  { pos: [-26, 168, 12], scale: [18, 92, 18] },
  { pos: [28, 258, -18], scale: [18, 96, 18] },
  { pos: [-22, 348, -12], scale: [20, 105, 20] },
  { pos: [48, 445, -16], scale: [22, 110, 22] },
]

const GRASS_COUNT = 2400
const FLOWER_COUNT = 180
const CUMULUS_COUNT = 28
const CLIFF_PINE_COUNT = 24
const COBBLESTONE_COUNT = 72
const GROUND_ROCK_COUNT = 80
const FERN_COUNT = 140

/** Layered Liyue cliff-pine foliage pads (3 offset flattened cones merged into 1 instanced geometry). */
function buildCliffPineCanopyGeometry() {
  const tier1 = new ConeGeometry(1.75, 0.82, 7).toNonIndexed()
  tier1.translate(0.55, 2.55, 0)
  const tier2 = new ConeGeometry(1.38, 0.72, 7).toNonIndexed()
  tier2.translate(0.95, 3.25, 0.12)
  const tier3 = new ConeGeometry(0.95, 0.62, 7).toNonIndexed()
  tier3.translate(1.25, 3.85, -0.08)
  const merged = mergeGeometries([tier1, tier2, tier3], false)!
  tier1.dispose()
  tier2.dispose()
  tier3.dispose()
  return merged
}

/** Leaning cliff-pine trunk curving outward from rocky Z1-Z2 cliff ledges. */
function buildCliffPineTrunkGeometry() {
  const lower = new CylinderGeometry(0.18, 0.28, 1.9, 6).toNonIndexed()
  lower.rotateZ(-0.26)
  lower.translate(0.24, 0.9, 0)
  const upper = new CylinderGeometry(0.11, 0.18, 1.85, 6).toNonIndexed()
  upper.rotateZ(-0.42)
  upper.translate(0.78, 2.45, 0)
  const merged = mergeGeometries([lower, upper], false)!
  lower.dispose()
  upper.dispose()
  return merged
}

function syncLivingUniforms(
  grassUniforms: {
    uTime: { value: number }
    uWind: { value: number }
    uWindDir: { value: Vector2 }
    uPlayerPos: { value: Vector3 }
  },
  bannerUniforms: { uTime: { value: number }; uWind: { value: number } },
  rayUniforms: { uTime: { value: number }; uOpacity: { value: number } },
  t: number,
  windInt: number,
  windAng: number,
  starOpacity: number,
  playerPos: Vector3 | undefined,
): void {
  grassUniforms.uTime.value = t
  grassUniforms.uWind.value = 0.3 + windInt * 0.85
  grassUniforms.uWindDir.value.set(Math.cos(windAng), Math.sin(windAng))
  if (playerPos != null) grassUniforms.uPlayerPos.value.copy(playerPos)
  bannerUniforms.uTime.value = t
  bannerUniforms.uWind.value = 0.35 + windInt * 0.9
  rayUniforms.uTime.value = t
  rayUniforms.uOpacity.value = Math.max(0.03, 0.15 * (1 - starOpacity * 0.85))
}

export function LivingWorld({ level }: { level: LoadedLevel }) {
  const active = level.id === 'main'
  const grassRef = useRef<InstancedMesh>(null)
  const flowerRef = useRef<InstancedMesh>(null)
  const cumulusRef = useRef<InstancedMesh>(null)
  const pineTrunkRef = useRef<InstancedMesh>(null)
  const pineCanopyRef = useRef<InstancedMesh>(null)
  const cobbleRef = useRef<InstancedMesh>(null)
  const groundRockRef = useRef<InstancedMesh>(null)
  const fernRef = useRef<InstancedMesh>(null)
  const sailRefs = useRef<Array<Group | null>>([])
  const shrineGlowRefs = useRef<Array<MeshStandardMaterial | null>>([])
  const litShrinesRef = useRef<Set<string>>(new Set())

  const resources = useMemo(() => {
    // 1. Wind-swaying + player-reactive grass shader (instanced, 1 draw call)
    const grassGeo = new PlaneGeometry(0.16, 0.78, 1, 3)
    grassGeo.translate(0, 0.39, 0)
    const grassUniforms = {
      uTime: { value: 0 },
      uWind: { value: 0.35 },
      uWindDir: { value: new Vector2(1, 0) },
      uPlayerPos: { value: new Vector3(0, -100, 0) },
      uBaseColor: { value: new Color('#366d3c') },
      uTipColor: { value: new Color('#b5e46e') },
      uSunTipColor: { value: new Color('#e8f694') },
    }
    const grassMat = new ShaderMaterial({
      uniforms: grassUniforms,
      side: DoubleSide,
      vertexShader: `
        uniform float uTime;
        uniform float uWind;
        uniform vec2 uWindDir;
        uniform vec3 uPlayerPos;
        varying float vH;
        varying float vTint;
        void main() {
          vH = clamp(position.y / 0.78, 0.0, 1.0);
          vec4 worldBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float phase = worldBase.x * 0.35 + worldBase.z * 0.28 + worldBase.y * 0.1;
          vTint = fract(sin(dot(worldBase.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float sway = sin(uTime * (2.2 + uWind * 3.0) + phase) * (0.14 + uWind * 0.36) * vH * vH;
          vec3 pos = position;
          pos.x += uWindDir.x * sway;
          pos.z += uWindDir.y * sway;
          // Player-reactive bend when footsteps pass nearby (2.2 m radius)
          vec3 toBlade = worldBase.xyz - uPlayerPos;
          float vDist = abs(toBlade.y);
          float hDist = length(toBlade.xz);
          float push = smoothstep(2.2, 0.2, hDist) * smoothstep(2.4, 0.3, vDist);
          vec2 pushDir = hDist > 0.001 ? normalize(toBlade.xz) : vec2(1.0, 0.0);
          pos.x += pushDir.x * push * 0.62 * vH;
          pos.z += pushDir.y * push * 0.62 * vH;
          pos.y -= push * 0.26 * vH * vH;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uBaseColor;
        uniform vec3 uTipColor;
        uniform vec3 uSunTipColor;
        varying float vH;
        varying float vTint;
        void main() {
          vec3 tip = mix(uTipColor, uSunTipColor, vTint * 0.55);
          vec3 col = mix(uBaseColor, tip, pow(vH, 0.72));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })

    // 2. Wildflower blossom instanced mesh
    const flowerGeo = new SphereGeometry(0.11, 6, 5)
    const flowerMat = new MeshBasicMaterial({ color: '#fff2a6' })

    // 3. Fluttering prayer banner shader (vertical hanging cloth)
    const bannerGeo = new PlaneGeometry(0.62, 2.35, 3, 10)
    bannerGeo.translate(0, -1.175, 0)
    const bannerUniforms = {
      uTime: { value: 0 },
      uWind: { value: 0.4 },
    }
    const makeBannerMat = (hex: string) =>
      new ShaderMaterial({
        uniforms: {
          uTime: bannerUniforms.uTime,
          uWind: bannerUniforms.uWind,
          uColor: { value: new Color(hex) },
        },
        side: DoubleSide,
        vertexShader: `
          uniform float uTime;
          uniform float uWind;
          varying float vPin;
          void main() {
            vPin = clamp(-position.y / 2.35, 0.0, 1.0);
            vec3 pos = position;
            float wave = sin(uTime * (3.2 + uWind * 4.5) - vPin * 5.2) * (0.16 + uWind * 0.32) * vPin;
            float flutter = cos(uTime * 6.0 + pos.x * 4.0) * 0.04 * vPin;
            pos.z += wave + flutter;
            pos.x += wave * 0.22;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vPin;
          void main() {
            vec3 shade = mix(uColor * 0.85, uColor * 1.12, 1.0 - vPin * 0.4);
            gl_FragColor = vec4(shade, 1.0);
          }
        `,
      })

    const bannerMats = new Map<string, ShaderMaterial>()
    for (const b of BANNERS) {
      if (!bannerMats.has(b.color)) bannerMats.set(b.color, makeBannerMat(b.color))
    }

    // 4. Fake volumetric God Rays (slanted additive fresnel cone, 0 post-processing overhead)
    const rayGeo = new ConeGeometry(1, 1, 16, 1, true)
    const rayUniforms = {
      uTime: { value: 0 },
      uColor: { value: new Color('#ffe7b3') },
      uOpacity: { value: 0.14 },
    }
    const rayMat = new ShaderMaterial({
      uniforms: rayUniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float edge = pow(abs(dot(vNormal, vViewDir)), 1.6);
          float vFade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.2, vUv.y);
          float shimmer = 0.85 + 0.15 * sin(uTime * 0.7 + vUv.x * 12.0);
          gl_FragColor = vec4(uColor, edge * vFade * shimmer * uOpacity);
        }
      `,
    })

    // 5. Shared stone, wood, brass, canvas, and cumulus cloud materials
    const stoneMat = new MeshStandardMaterial({ color: '#8f897e', roughness: 0.92 })
    const mossMat = new MeshStandardMaterial({ color: '#6ca365', roughness: 0.88 })
    const woodMat = new MeshStandardMaterial({ color: '#7a5233', roughness: 0.86 })
    const brassMat = new MeshStandardMaterial({ color: '#d8a448', roughness: 0.36, metalness: 0.65 })
    const sailMat = new MeshStandardMaterial({ color: '#f5ebd6', roughness: 0.75, side: DoubleSide })
    const tentMat = new MeshStandardMaterial({ color: '#d46a4c', roughness: 0.85, side: DoubleSide })
    const cumulusGeo = new SphereGeometry(1, 10, 8)
    const cumulusMat = new MeshStandardMaterial({
      color: '#fffaf0',
      emissive: '#f5d9b0',
      emissiveIntensity: 0.18,
      roughness: 0.96,
      transparent: true,
      opacity: 0.72,
    })

    // Reusable shrine/windmill geometries
    const poleGeo = new CylinderGeometry(0.06, 0.08, 3.6, 6)
    const crossbarGeo = new BoxGeometry(0.95, 0.08, 0.08)
    const shrineBaseGeo = new CylinderGeometry(0.58, 0.72, 0.45, 6)
    const shrinePillarGeo = new CylinderGeometry(0.24, 0.3, 1.35, 6)
    const shrineBoxGeo = new BoxGeometry(0.56, 0.56, 0.56)
    const shrineRoofGeo = new ConeGeometry(0.92, 0.55, 6)
    const altarGeo = new CylinderGeometry(0.65, 0.88, 0.42, 8)
    const windmillPostGeo = new CylinderGeometry(0.26, 0.42, 6.2, 8)
    const sailArmGeo = new BoxGeometry(0.14, 4.4, 0.14)
    const sailClothGeo = new PlaneGeometry(1.15, 3.4)
    const pineTrunkGeo = buildCliffPineTrunkGeometry()
    const pineCanopyGeo = buildCliffPineCanopyGeometry()
    const pineBarkMat = new MeshStandardMaterial({ color: '#5c3f2c', roughness: 0.92 })
    const pineNeedleMat = new MeshStandardMaterial({ color: '#39734a', roughness: 0.84 })
    const cobbleGeo = new CylinderGeometry(0.46, 0.54, 0.08, 7)
    const groundRockGeo = new DodecahedronGeometry(0.45, 0)
    const fernGeo = new ConeGeometry(0.42, 0.55, 6)
    const fernMat = new MeshStandardMaterial({ color: '#528f48', roughness: 0.86 })

    return {
      grassGeo,
      grassMat,
      grassUniforms,
      flowerGeo,
      flowerMat,
      bannerGeo,
      bannerUniforms,
      bannerMats,
      rayGeo,
      rayMat,
      rayUniforms,
      stoneMat,
      mossMat,
      woodMat,
      brassMat,
      sailMat,
      tentMat,
      cumulusGeo,
      cumulusMat,
      poleGeo,
      crossbarGeo,
      shrineBaseGeo,
      shrinePillarGeo,
      shrineBoxGeo,
      shrineRoofGeo,
      altarGeo,
      windmillPostGeo,
      sailArmGeo,
      sailClothGeo,
      pineTrunkGeo,
      pineCanopyGeo,
      pineBarkMat,
      pineNeedleMat,
      cobbleGeo,
      groundRockGeo,
      fernGeo,
      fernMat,
    }
  }, [])

  const cumulusSeeds = useMemo(() => {
    const rng = mulberry32(6042)
    return Array.from({ length: CUMULUS_COUNT }, (_, i) => ({
      angle: (i / CUMULUS_COUNT) * Math.PI * 2 + rng() * 0.4,
      radius: 62 + rng() * 78,
      y: 75 + (i / CUMULUS_COUNT) * 355,
      sx: 12 + rng() * 14,
      sy: 5 + rng() * 5,
      sz: 9 + rng() * 10,
      speed: (0.012 + rng() * 0.016) * (i % 2 === 0 ? 1 : -1),
    }))
  }, [])

  useEffect(() => {
    if (!active) return
    const dummy = new Object3D()
    const rng = mulberry32(6001)

    // Populate instanced grass around Start Plaza rim, Catch Decks, and Z1-Z2 walkable cliff platforms
    if (grassRef.current) {
      const anchors: Array<{ cx: number; cy: number; cz: number; minR: number; maxR: number; count: number }> = [
        { cx: 0, cy: 0, cz: 0, minR: 7.5, maxR: 30, count: 780 },
        { cx: RELAXED_CHECKPOINTS[0].pos[0], cy: RELAXED_CHECKPOINTS[0].pos[1], cz: RELAXED_CHECKPOINTS[0].pos[2], minR: 2.2, maxR: 4.5, count: 120 },
        { cx: RELAXED_CHECKPOINTS[1].pos[0], cy: RELAXED_CHECKPOINTS[1].pos[1], cz: RELAXED_CHECKPOINTS[1].pos[2], minR: 2.2, maxR: 4.5, count: 110 },
        { cx: RELAXED_CHECKPOINTS[2].pos[0], cy: RELAXED_CHECKPOINTS[2].pos[1], cz: RELAXED_CHECKPOINTS[2].pos[2], minR: 2.2, maxR: 4.5, count: 100 },
      ]
      let idx = 0
      for (const a of anchors) {
        for (let k = 0; k < a.count && idx < GRASS_COUNT; k++, idx++) {
          const ang = rng() * Math.PI * 2
          const r = a.minR + rng() * (a.maxR - a.minR)
          dummy.position.set(a.cx + Math.cos(ang) * r, a.cy, a.cz + Math.sin(ang) * r)
          dummy.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.14)
          const s = 0.65 + rng() * 0.85
          dummy.scale.set(s, s, s)
          dummy.updateMatrix()
          grassRef.current.setMatrixAt(idx, dummy.matrix)
        }
      }
      // Scatter lush grass tufts flush on top of flat static walkable Z1-Z2 platforms
      const greenPlatforms = level.data.platforms.filter((e) => {
        if (e.motion != null || e.tag === 'hazard' || (e.rotX != null && Math.abs(e.rotX) > 0.01)) return false
        if (e.pos[1] < 2 || e.pos[1] > 245) return false
        const p = level.prefabs.get(e.prefab)
        return p != null && p.walkable && p.collider != null
      })
      const remaining = GRASS_COUNT - idx
      if (greenPlatforms.length > 0 && remaining > 0) {
        const perPlat = Math.max(4, Math.floor(remaining / greenPlatforms.length))
        for (const e of greenPlatforms) {
          const p = level.prefabs.get(e.prefab)!
          const [w, h, d] = colliderSize(p)
          const off = p.collider!.offset
          const cosY = Math.cos(e.rotY)
          const sinY = Math.sin(e.rotY)
          const cx = e.pos[0] + (off[0] * cosY + off[2] * sinY) * p.scale
          const cz = e.pos[2] + (-off[0] * sinY + off[2] * cosY) * p.scale
          const topY = e.pos[1] + off[1] * p.scale + h * 0.5
          const hx = Math.max(0.25, w * 0.38)
          const hz = Math.max(0.25, d * 0.38)
          for (let k = 0; k < perPlat && idx < GRASS_COUNT; k++, idx++) {
            const lx = (rng() * 2 - 1) * hx
            const lz = (rng() * 2 - 1) * hz
            const wx = cx + lx * cosY + lz * sinY
            const wz = cz - lx * sinY + lz * cosY
            dummy.position.set(wx, topY, wz)
            dummy.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.16)
            const s = 0.55 + rng() * 0.65
            dummy.scale.set(s, s, s)
            dummy.updateMatrix()
            grassRef.current.setMatrixAt(idx, dummy.matrix)
          }
          if (idx >= GRASS_COUNT) break
        }
      }
      // Hide any unused grass slots below kill plane
      for (; idx < GRASS_COUNT; idx++) {
        dummy.position.set(0, -500, 0)
        dummy.scale.set(0.001, 0.001, 0.001)
        dummy.updateMatrix()
        grassRef.current.setMatrixAt(idx, dummy.matrix)
      }
      grassRef.current.instanceMatrix.needsUpdate = true
    }

    // Populate sunlit wildflowers near grass borders
    if (flowerRef.current) {
      const flowerColors = [new Color('#fff199'), new Color('#ffb7c5'), new Color('#bce6ff'), new Color('#ffd082')]
      for (let i = 0; i < FLOWER_COUNT; i++) {
        const ang = rng() * Math.PI * 2
        const r = 8.2 + rng() * 20
        dummy.position.set(Math.cos(ang) * r, 0.36 + rng() * 0.22, Math.sin(ang) * r)
        dummy.rotation.set(0, rng() * Math.PI, 0)
        dummy.scale.setScalar(0.8 + rng() * 0.6)
        dummy.updateMatrix()
        flowerRef.current.setMatrixAt(i, dummy.matrix)
        flowerRef.current.setColorAt(i, flowerColors[i % flowerColors.length])
      }
      flowerRef.current.instanceMatrix.needsUpdate = true
      if (flowerRef.current.instanceColor) flowerRef.current.instanceColor.needsUpdate = true
    }

    // Populate leaning Liyue cliff pines on outer edges of tall Z1-Z2 platforms (strictly non-collider, outside jump center)
    if (pineTrunkRef.current && pineCanopyRef.current) {
      const cliffPlatforms = level.data.platforms.filter((e) => {
        if (e.motion != null || e.tag === 'hazard' || (e.rotX != null && Math.abs(e.rotX) > 0.01)) return false
        if (e.pos[1] < 24 || e.pos[1] > 245) return false
        const p = level.prefabs.get(e.prefab)
        if (!p || !p.walkable || !p.collider) return false
        const [w, , d] = colliderSize(p)
        return w >= 3.2 && d >= 3.2
      })
      let placed = 0
      const step = Math.max(1, Math.floor(cliffPlatforms.length / CLIFF_PINE_COUNT))
      for (let i = 0; i < cliffPlatforms.length && placed < CLIFF_PINE_COUNT; i += step) {
        const e = cliffPlatforms[i]
        const p = level.prefabs.get(e.prefab)!
        const [w, h, d] = colliderSize(p)
        const off = p.collider!.offset
        const cosY = Math.cos(e.rotY)
        const sinY = Math.sin(e.rotY)
        const cx = e.pos[0] + (off[0] * cosY + off[2] * sinY) * p.scale
        const cz = e.pos[2] + (-off[0] * sinY + off[2] * cosY) * p.scale
        const topY = e.pos[1] + off[1] * p.scale + h * 0.5
        // Anchor on outer corner leaning away from spire center (0, 0) so sightlines stay wide open
        const outAng = Math.atan2(cz, cx)
        const rimR = Math.min(w, d) * 0.44
        const px = cx + Math.cos(outAng) * rimR
        const pz = cz + Math.sin(outAng) * rimR
        const s = 0.85 + rng() * 0.45
        dummy.position.set(px, topY - 0.15, pz)
        dummy.rotation.set(0, -outAng, 0)
        dummy.scale.set(s, s, s)
        dummy.updateMatrix()
        pineTrunkRef.current.setMatrixAt(placed, dummy.matrix)
        pineCanopyRef.current.setMatrixAt(placed, dummy.matrix)
        placed++
      }
      for (; placed < CLIFF_PINE_COUNT; placed++) {
        dummy.position.set(0, -500, 0)
        dummy.scale.set(0.001, 0.001, 0.001)
        dummy.updateMatrix()
        pineTrunkRef.current.setMatrixAt(placed, dummy.matrix)
        pineCanopyRef.current.setMatrixAt(placed, dummy.matrix)
      }
      pineTrunkRef.current.instanceMatrix.needsUpdate = true
      pineCanopyRef.current.instanceMatrix.needsUpdate = true
    }

    // Populate cobblestone stepping stones from Spawn (0,0) to z1-spiral-tower (12,-4) & camp (-8.6, 5.4)
    if (cobbleRef.current) {
      for (let i = 0; i < COBBLESTONE_COUNT; i++) {
        const toTower = i < 48
        const u = toTower ? (i / 47) : ((i - 48) / (COBBLESTONE_COUNT - 49))
        const tx = toTower ? u * 10.5 + Math.sin(u * Math.PI * 2) * 0.8 : -u * 7.5 + Math.sin(u * Math.PI) * 0.7
        const tz = toTower ? u * -3.5 + Math.cos(u * Math.PI * 2) * 0.65 : u * 4.8 + Math.cos(u * Math.PI) * 0.55
        const ox = tx + (rng() - 0.5) * 1.15
        const oz = tz + (rng() - 0.5) * 1.15
        const gy = groundTerrainHeight(ox, oz)
        dummy.position.set(ox, gy + 0.015, oz)
        dummy.rotation.set(0, rng() * Math.PI * 2, 0)
        dummy.scale.set(0.65 + rng() * 0.7, 0.8 + rng() * 0.5, 0.55 + rng() * 0.65)
        dummy.updateMatrix()
        cobbleRef.current.setMatrixAt(i, dummy.matrix)
      }
      cobbleRef.current.instanceMatrix.needsUpdate = true
    }

    // Populate mossy ground rocks & low fern clusters resting flush on groundTerrainHeight
    if (groundRockRef.current) {
      for (let i = 0; i < GROUND_ROCK_COUNT; i++) {
        const ang = rng() * Math.PI * 2
        const r = 11.5 + rng() * 52
        const gx = Math.cos(ang) * r
        const gz = Math.sin(ang) * r
        const gy = groundTerrainHeight(gx, gz)
        const sx = 0.55 + rng() * 1.4
        const sy = 0.35 + rng() * 0.7
        const sz = 0.55 + rng() * 1.3
        dummy.position.set(gx, gy + sy * 0.14, gz)
        dummy.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3)
        dummy.scale.set(sx, sy, sz)
        dummy.updateMatrix()
        groundRockRef.current.setMatrixAt(i, dummy.matrix)
      }
      groundRockRef.current.instanceMatrix.needsUpdate = true
    }

    if (fernRef.current) {
      for (let i = 0; i < FERN_COUNT; i++) {
        const ang = rng() * Math.PI * 2
        const r = 9.5 + rng() * 44
        const gx = Math.cos(ang) * r
        const gz = Math.sin(ang) * r
        const gy = groundTerrainHeight(gx, gz)
        const s = 0.65 + rng() * 1.1
        dummy.position.set(gx, gy + 0.22 * s, gz)
        dummy.rotation.set((rng() - 0.5) * 0.18, rng() * Math.PI * 2, (rng() - 0.5) * 0.18)
        dummy.scale.set(s * 1.25, s * 0.85, s * 1.25)
        dummy.updateMatrix()
        fernRef.current.setMatrixAt(i, dummy.matrix)
      }
      fernRef.current.instanceMatrix.needsUpdate = true
    }
  }, [active, level])

  useEffect(
    () => () => {
      resources.grassGeo.dispose()
      resources.grassMat.dispose()
      resources.flowerGeo.dispose()
      resources.flowerMat.dispose()
      resources.bannerGeo.dispose()
      for (const m of resources.bannerMats.values()) m.dispose()
      resources.rayGeo.dispose()
      resources.rayMat.dispose()
      resources.stoneMat.dispose()
      resources.mossMat.dispose()
      resources.woodMat.dispose()
      resources.brassMat.dispose()
      resources.sailMat.dispose()
      resources.tentMat.dispose()
      resources.cumulusGeo.dispose()
      resources.cumulusMat.dispose()
      resources.poleGeo.dispose()
      resources.crossbarGeo.dispose()
      resources.shrineBaseGeo.dispose()
      resources.shrinePillarGeo.dispose()
      resources.shrineBoxGeo.dispose()
      resources.shrineRoofGeo.dispose()
      resources.altarGeo.dispose()
      resources.windmillPostGeo.dispose()
      resources.sailArmGeo.dispose()
      resources.sailClothGeo.dispose()
      resources.pineTrunkGeo.dispose()
      resources.pineCanopyGeo.dispose()
      resources.pineBarkMat.dispose()
      resources.pineNeedleMat.dispose()
      resources.cobbleGeo.dispose()
      resources.groundRockGeo.dispose()
      resources.fernGeo.dispose()
      resources.fernMat.dispose()
    },
    [resources],
  )

  const cloudDummy = useMemo(() => new Object3D(), [])

  useFrame(({ clock }, rawDt) => {
    if (!active) return
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    const windInt = game.challenges.windIntensity
    const windAng = game.challenges.windAngle

    syncLivingUniforms(
      resources.grassUniforms,
      resources.bannerUniforms,
      resources.rayUniforms,
      t,
      windInt,
      windAng,
      game.atmosphere.starOpacity,
      game.port?.position,
    )

    // Spin Ghibli windmill sails faster when crosswind gusts hit
    const spinSpeed = 0.65 + windInt * 2.6
    for (let i = 0; i < WINDMILLS.length; i++) {
      const sail = sailRefs.current[i]
      if (sail) sail.rotation.z -= spinSpeed * dt * (i % 2 === 0 ? 1 : -1)
    }

    // Drift cumulus cloud billows around the climbing spire
    if (cumulusRef.current) {
      for (let i = 0; i < cumulusSeeds.length; i++) {
        const c = cumulusSeeds[i]
        const a = c.angle + t * c.speed
        cloudDummy.position.set(Math.cos(a) * c.radius, c.y + Math.sin(t * 0.4 + i) * 1.4, Math.sin(a) * c.radius)
        cloudDummy.rotation.set(0, -a, 0)
        cloudDummy.scale.set(c.sx, c.sy, c.sz)
        cloudDummy.updateMatrix()
        cumulusRef.current.setMatrixAt(i, cloudDummy.matrix)
      }
      cumulusRef.current.instanceMatrix.needsUpdate = true
    }

    // Proximity-activated Toro Stone Lantern Shrines
    const p = game.port?.position
    if (p) {
      for (let i = 0; i < TORO_SHRINES.length; i++) {
        const s = TORO_SHRINES[i]
        const dx = p.x - s.pos[0]
        const dy = p.y - s.pos[1]
        const dz = p.z - s.pos[2]
        const near = dx * dx + dy * dy + dz * dz < 64
        const mat = shrineGlowRefs.current[i]
        if (near && !litShrinesRef.current.has(s.id)) {
          litShrinesRef.current.add(s.id)
          game.livingWorld.litShrines = litShrinesRef.current.size
          playLanternChime()
        }
        if (mat) {
          const targetEmissive = litShrinesRef.current.has(s.id) ? 1.85 + Math.sin(t * 3 + i) * 0.25 : 0.45
          mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * Math.min(1, dt * 4)
        }
      }
    }
  })

  if (!active) return null

  return (
    <group name="living-world">
      {/* 1. Instanced wind-swaying grass, wildflowers & leaning Liyue cliff pines */}
      <instancedMesh ref={grassRef} name="living-grass" args={[resources.grassGeo, resources.grassMat, GRASS_COUNT]} frustumCulled={false} />
      <instancedMesh ref={flowerRef} name="living-flowers" args={[resources.flowerGeo, resources.flowerMat, FLOWER_COUNT]} frustumCulled={false} />
      <instancedMesh ref={pineTrunkRef} name="living-cliff-pine-trunks" args={[resources.pineTrunkGeo, resources.pineBarkMat, CLIFF_PINE_COUNT]} frustumCulled={false} />
      <instancedMesh ref={pineCanopyRef} name="living-cliff-pine-canopies" args={[resources.pineCanopyGeo, resources.pineNeedleMat, CLIFF_PINE_COUNT]} frustumCulled={false} />
      <instancedMesh ref={cobbleRef} name="living-cobblestones" args={[resources.cobbleGeo, resources.stoneMat, COBBLESTONE_COUNT]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={groundRockRef} name="living-ground-rocks" args={[resources.groundRockGeo, resources.stoneMat, GROUND_ROCK_COUNT]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={fernRef} name="living-meadow-ferns" args={[resources.fernGeo, resources.fernMat, FERN_COUNT]} frustumCulled={false} />

      {/* 2. Fluttering Ghibli cloth prayer banners */}
      <group name="living-banners">
        {BANNERS.map((b) => (
          <group key={b.id} position={b.pos} rotation={[0, b.yaw, 0]}>
            <mesh geometry={resources.poleGeo} material={resources.woodMat} position={[0, -1.6, 0]} />
            <mesh geometry={resources.crossbarGeo} material={resources.woodMat} position={[0, 0.1, 0]} />
            <mesh geometry={resources.bannerGeo} material={resources.bannerMats.get(b.color)!} position={[0, 0.05, 0.05]} />
          </group>
        ))}
      </group>

      {/* 3. Ancient Mossy Stone Lantern Shrines (Toro) */}
      <group name="living-shrines">
        {TORO_SHRINES.map((s, idx) => (
          <group key={s.id} position={s.pos} name={s.id}>
            <mesh geometry={resources.shrineBaseGeo} material={resources.stoneMat} position={[0, 0.22, 0]} castShadow receiveShadow />
            <mesh geometry={resources.shrinePillarGeo} material={resources.stoneMat} position={[0, 1.05, 0]} castShadow />
            <mesh geometry={resources.shrineBoxGeo} position={[0, 1.95, 0]}>
              <meshStandardMaterial
                ref={(el) => {
                  shrineGlowRefs.current[idx] = el
                }}
                color="#9ff5e2"
                emissive="#4ee0c0"
                emissiveIntensity={0.45}
                roughness={0.35}
              />
            </mesh>
            <mesh geometry={resources.shrineRoofGeo} material={resources.stoneMat} position={[0, 2.5, 0]} castShadow />
            <mesh geometry={resources.shrineRoofGeo} material={resources.mossMat} position={[0, 2.58, 0]} scale={[0.88, 0.45, 0.88]} />
          </group>
        ))}
      </group>

      {/* 4. Spinning Ghibli Brass & Wood Windmills */}
      <group name="living-windmills">
        {WINDMILLS.map((w, idx) => (
          <group key={w.id} position={w.pos} rotation={[0, w.yaw, 0]} scale={w.scale} name={w.id}>
            <mesh geometry={resources.windmillPostGeo} material={resources.woodMat} position={[0, 3.1, 0]} castShadow />
            <mesh position={[0, 5.8, 0.35]} rotation={[Math.PI / 2, 0, 0]} material={resources.brassMat}>
              <cylinderGeometry args={[0.32, 0.32, 0.55, 10]} />
            </mesh>
            <group
              position={[0, 5.8, 0.65]}
              ref={(el) => {
                sailRefs.current[idx] = el
              }}
            >
              {[0, 1, 2, 3].map((k) => (
                <group key={k} rotation={[0, 0, (k * Math.PI) / 2]}>
                  <mesh geometry={resources.sailArmGeo} material={resources.woodMat} position={[0, 2.1, 0]} />
                  <mesh geometry={resources.sailClothGeo} material={resources.sailMat} position={[0.62, 2.25, 0.04]} rotation={[0, 0.14, 0]} />
                </group>
              ))}
            </group>
          </group>
        ))}
      </group>

      {/* 5. Fake Volumetric God Rays (sunbeams slanted from SUN direction) */}
      <group name="living-god-rays">
        {GOD_RAY_SLOTS.map((r, i) => (
          <mesh key={i} position={r.pos} rotation={[0.28, 0.2, 0.34]} scale={r.scale} geometry={resources.rayGeo} material={resources.rayMat} />
        ))}
      </group>

      {/* 6. Drifting Ghibli Cumulus Cloud Billows */}
      <instancedMesh ref={cumulusRef} name="living-cumulus" args={[resources.cumulusGeo, resources.cumulusMat, CUMULUS_COUNT]} frustumCulled={false} />

      {/* 7. Mossy Stone Altars beneath the 12 Sky Relics */}
      <group name="living-relic-altars">
        {SKY_RELICS.map((r) => (
          <group key={r.id} position={[r.pos[0], r.pos[1] - 1.35, r.pos[2]]}>
            <mesh geometry={resources.altarGeo} material={resources.stoneMat} />
            <mesh geometry={resources.altarGeo} material={resources.mossMat} position={[0, 0.18, 0]} scale={[0.82, 0.35, 0.82]} />
          </group>
        ))}
      </group>

      {/* 8. Climber Camp Storytelling Props on Start Plaza edge */}
      <group name="living-camp-props" position={[-8.6, 0, 5.4]} rotation={[0, 0.65, 0]}>
        <mesh position={[0, 0.95, 0]} material={resources.tentMat} castShadow>
          <coneGeometry args={[1.65, 1.9, 4]} />
        </mesh>
        <mesh position={[2.1, 0.42, 0.6]} material={resources.stoneMat}>
          <cylinderGeometry args={[0.26, 0.34, 0.84, 8]} />
        </mesh>
        <mesh position={[2.65, 0.32, 0.25]} material={resources.brassMat}>
          <cylinderGeometry args={[0.18, 0.26, 0.64, 8]} />
        </mesh>
      </group>
    </group>
  )
}
