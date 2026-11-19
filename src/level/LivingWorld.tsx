// Gelombang A — Living Ghibli World, Environmental Artifacts, Fake God Rays & Character Movement Juice VFX (Fase 6):
// All visual props are strictly non-collider and positioned outside TEST-37 climbing sightlines.
// Built with InstancedMesh + lightweight custom shaders to stay well under the 60 FPS budget.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import type { LoadedLevel } from './levels.ts'
import { SKY_RELICS } from './relicsData.ts'
import { RELAXED_CHECKPOINTS } from './challenges.ts'
import { game } from '../game/game.ts'
import { playWindChime } from '../audio/engine.ts'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

import { LIVING_WORLD_META } from './worldMeta.ts'

// Mossy Tōrō stone lantern shrines (placed at outer plaza & Catch Deck flanks — zero sightline obstruction)
const SHRINE_SPOTS: ReadonlyArray<{ id: string; pos: [number, number, number]; accent: string }> = [
  { id: 'shrine-plaza-e', pos: [14.5, 0, -6.0], accent: '#5fd4a3' },
  { id: 'shrine-plaza-w', pos: [-14.5, 0, -5.0], accent: '#ffd166' },
  { id: 'shrine-plaza-n', pos: [4.0, 0, -18.5], accent: '#5fd4a3' },
  { id: 'shrine-cp-125', pos: [RELAXED_CHECKPOINTS[0].pos[0] + 4.2, RELAXED_CHECKPOINTS[0].pos[1], RELAXED_CHECKPOINTS[0].pos[2] + 3.8], accent: '#72eac0' },
  { id: 'shrine-cp-250', pos: [RELAXED_CHECKPOINTS[1].pos[0] - 4.2, RELAXED_CHECKPOINTS[1].pos[1], RELAXED_CHECKPOINTS[1].pos[2] + 3.8], accent: '#ffd166' },
  { id: 'shrine-cp-375', pos: [RELAXED_CHECKPOINTS[2].pos[0] + 4.2, RELAXED_CHECKPOINTS[2].pos[1], RELAXED_CHECKPOINTS[2].pos[2] - 3.8], accent: '#818cf8' },
]

// Decorative wind-reactive brass windmills on outer tower flanks
const WINDMILL_SPOTS: ReadonlyArray<{ id: string; pos: [number, number, number]; rotY: number; scale: number }> = [
  { id: 'mill-z1-w', pos: [-26, 2, -16], rotY: 0.6, scale: 1.15 },
  { id: 'mill-z1-e', pos: [28, 12, 14], rotY: -0.9, scale: 1.0 },
  { id: 'mill-z2-n', pos: [18, 118, -32], rotY: 0.3, scale: 1.2 },
  { id: 'mill-z2-s', pos: [-24, 182, 26], rotY: 2.1, scale: 1.1 },
  { id: 'mill-z3-e', pos: [46, 268, -24], rotY: -1.3, scale: 1.3 },
]

// Fluttering cloth prayer banners (placed beside plaza & sanctuary gates)
const BANNER_SPOTS: ReadonlyArray<{ pos: [number, number, number]; rotY: number; color: string; height: number }> = [
  { pos: [11.5, 2.8, -9.5], rotY: 0.35, color: '#d9534f', height: 2.6 },
  { pos: [-11.5, 2.8, -9.5], rotY: -0.35, color: '#f5e6c8', height: 2.6 },
  { pos: [16.0, 2.8, 4.0], rotY: 1.1, color: '#e8a848', height: 2.4 },
  { pos: [-16.0, 2.8, 4.0], rotY: -1.1, color: '#d9534f', height: 2.4 },
  { pos: [6.5, 2.6, 15.0], rotY: 2.8, color: '#5fd4a3', height: 2.2 },
  { pos: [-6.5, 2.6, 15.0], rotY: -2.8, color: '#f5e6c8', height: 2.2 },
  { pos: [RELAXED_CHECKPOINTS[0].pos[0] - 4.0, RELAXED_CHECKPOINTS[0].pos[1] + 2.6, RELAXED_CHECKPOINTS[0].pos[2] - 3.5], rotY: 0.5, color: '#d9534f', height: 2.5 },
  { pos: [RELAXED_CHECKPOINTS[0].pos[0] + 4.0, RELAXED_CHECKPOINTS[0].pos[1] + 2.6, RELAXED_CHECKPOINTS[0].pos[2] - 3.5], rotY: -0.5, color: '#f5e6c8', height: 2.5 },
  { pos: [RELAXED_CHECKPOINTS[1].pos[0] + 4.0, RELAXED_CHECKPOINTS[1].pos[1] + 2.6, RELAXED_CHECKPOINTS[1].pos[2] - 3.5], rotY: 0.8, color: '#e8a848', height: 2.5 },
  { pos: [RELAXED_CHECKPOINTS[1].pos[0] - 4.0, RELAXED_CHECKPOINTS[1].pos[1] + 2.6, RELAXED_CHECKPOINTS[1].pos[2] - 3.5], rotY: -0.8, color: '#5fd4a3', height: 2.5 },
  { pos: [RELAXED_CHECKPOINTS[2].pos[0] - 4.0, RELAXED_CHECKPOINTS[2].pos[1] + 2.6, RELAXED_CHECKPOINTS[2].pos[2] + 3.5], rotY: 0.4, color: '#818cf8', height: 2.6 },
  { pos: [RELAXED_CHECKPOINTS[2].pos[0] + 4.0, RELAXED_CHECKPOINTS[2].pos[1] + 2.6, RELAXED_CHECKPOINTS[2].pos[2] + 3.5], rotY: -0.4, color: '#ffd166', height: 2.6 },
  { pos: [22.0, 74.0, 22.0], rotY: 1.4, color: '#d9534f', height: 2.8 },
  { pos: [-22.0, 155.0, -22.0], rotY: -1.4, color: '#f5e6c8', height: 2.8 },
]

// Fake volumetric sunbeam shafts aligned with SUN [-12, 20, 10]
const GODRAY_SPOTS: ReadonlyArray<{ pos: [number, number, number]; scale: [number, number, number] }> = [
  { pos: [-18, 42, 16], scale: [14, 95, 14] },
  { pos: [24, 96, -22], scale: [16, 110, 16] },
  { pos: [-26, 168, -12], scale: [18, 120, 18] },
  { pos: [32, 248, 18], scale: [18, 125, 18] },
  { pos: [-14, 330, 26], scale: [16, 120, 16] },
  { pos: [18, 410, -28], scale: [15, 110, 15] },
]

type PuffState = {
  active: boolean
  age: number
  life: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  size: number
}

const PUFF_POOL = 28
const tmpObj = new Object3D()
const tmpCol = new Color()

function setLivingUniforms(res: { grassUniforms: { uTime: { value: number }; uWindStrength: { value: number }; uWindDir: { value: Vector2 } }; bannerUniforms: { uTime: { value: number }; uWindStrength: { value: number } }; godRayUniforms: { uOpacity: { value: number } } }, t: number, windInt: number, windAng: number, daylight: number): void {
  res.grassUniforms.uTime.value = t
  res.grassUniforms.uWindStrength.value = 0.28 + windInt * 0.95
  res.grassUniforms.uWindDir.value.set(Math.cos(windAng), Math.sin(windAng))
  res.bannerUniforms.uTime.value = t
  res.bannerUniforms.uWindStrength.value = 0.25 + windInt * 1.1
  res.godRayUniforms.uOpacity.value = 0.11 * daylight
}

export function LivingWorld({ level }: { level: LoadedLevel }) {
  const active = level.id === 'main'

  const grassRef = useRef<InstancedMesh>(null)
  const cloudsRef = useRef<InstancedMesh>(null)
  const altarStoneRef = useRef<InstancedMesh>(null)
  const altarRuneRef = useRef<InstancedMesh>(null)
  const dustRef = useRef<InstancedMesh>(null)
  const jumpRingRef = useRef<Mesh>(null)
  const windmillBladesRef = useRef<Array<Group | null>>([])
  const shrineGlowMatsRef = useRef<MeshStandardMaterial[]>([])
  const visitedShrinesRef = useRef<Set<string>>(new Set())

  const resources = useMemo(() => {
    // 1. Wind-swaying grass blade geometry & ShaderMaterial
    const grassGeo = new PlaneGeometry(0.24, 0.56, 1, 3)
    grassGeo.translate(0, 0.28, 0)
    const grassUniforms = {
      uTime: { value: 0 },
      uWindStrength: { value: 0.35 },
      uWindDir: { value: new Vector2(0.85, 0.52) },
    }
    const grassMat = new ShaderMaterial({
      uniforms: grassUniforms,
      side: DoubleSide,
      vertexShader: `
        uniform float uTime;
        uniform float uWindStrength;
        uniform vec2 uWindDir;
        varying float vH;
        varying vec3 vColor;
        void main() {
          vH = clamp(position.y / 0.56, 0.0, 1.0);
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(0.48, 0.76, 0.42);
          #endif
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          float phase = uTime * (2.2 + uWindStrength * 2.5) + worldPos.x * 0.45 + worldPos.z * 0.45;
          float sway = sin(phase) * (0.14 + uWindStrength * 0.34) * vH * vH;
          worldPos.x += uWindDir.x * sway;
          worldPos.z += uWindDir.y * sway;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        varying float vH;
        varying vec3 vColor;
        void main() {
          vec3 base = vColor * mix(0.62, 1.18, vH);
          vec3 sunTip = vec3(0.98, 0.92, 0.62);
          vec3 col = mix(base, sunTip, smoothstep(0.68, 1.0, vH) * 0.28);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })

    // 2. Fluttering cloth prayer banner shader
    const bannerGeo = new PlaneGeometry(0.62, 2.2, 4, 12)
    bannerGeo.translate(0, -1.1, 0)
    const bannerUniforms = {
      uTime: { value: 0 },
      uWindStrength: { value: 0.35 },
    }
    const bannerMats = BANNER_SPOTS.map((b) => {
      const c = new Color(b.color)
      return new ShaderMaterial({
        uniforms: {
          uTime: bannerUniforms.uTime,
          uWindStrength: bannerUniforms.uWindStrength,
          uColor: { value: c },
        },
        side: DoubleSide,
        vertexShader: `
          uniform float uTime;
          uniform float uWindStrength;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            float hang = 1.0 - uv.y;
            float wave = sin(uTime * (3.6 + uWindStrength * 4.2) - hang * 5.2 + p.x * 2.0);
            p.z += wave * (0.12 + uWindStrength * 0.28) * hang;
            p.x += cos(uTime * 2.4 - hang * 3.5) * 0.06 * hang;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float border = step(0.08, vUv.x) * step(vUv.x, 0.92) * step(0.06, vUv.y);
            vec3 trim = vec3(0.97, 0.85, 0.56);
            vec3 col = mix(trim, uColor, border);
            // Subtle sunlit vertical shading
            col *= mix(0.82, 1.08, vUv.y);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    })
    const poleMat = new MeshStandardMaterial({ color: '#6e4b32', roughness: 0.88 })

    // 3. Fake Volumetric Sunbeams (God Rays)
    const godRayGeo = new ConeGeometry(1.0, 1.0, 16, 1, true)
    const godRayUniforms = {
      uOpacity: { value: 0.11 },
      uColor: { value: new Color('#ffe5a8') },
    }
    const godRayMat = new ShaderMaterial({
      uniforms: godRayUniforms,
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
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float fresnel = pow(abs(dot(vNormal, vViewDir)), 1.6);
          float vFade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.18, vUv.y);
          float alpha = fresnel * vFade * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })

    // 4. Layered Ghibli Cumulus Cloud Billows
    const cloudGeo = new SphereGeometry(1, 10, 8)
    const cloudMat = new MeshStandardMaterial({
      color: '#fff8ec',
      emissive: '#dbeafe',
      emissiveIntensity: 0.22,
      roughness: 0.96,
      transparent: true,
      opacity: 0.86,
    })

    // 5. Mossy Tōrō Stone Lantern Shrine materials
    const shrineStoneMat = new MeshStandardMaterial({ color: '#8e887e', roughness: 0.92 })
    const shrineMossMat = new MeshStandardMaterial({ color: '#78aa6c', roughness: 0.88 })
    const shrineGlowMats = SHRINE_SPOTS.map(
      (s) =>
        new MeshStandardMaterial({
          color: '#ffffff',
          emissive: s.accent,
          emissiveIntensity: 0.65,
          roughness: 0.3,
        }),
    )

    // 6. Wind-reactive Brass Windmill materials
    const millWoodMat = new MeshStandardMaterial({ color: '#7c5335', roughness: 0.86 })
    const millBrassMat = new MeshStandardMaterial({ color: '#d8a64e', roughness: 0.38, metalness: 0.62 })
    const millSailMat = new MeshStandardMaterial({ color: '#f4ead2', roughness: 0.84, side: DoubleSide })

    // 7. Relic Altar pedestals
    const altarStoneGeo = new CylinderGeometry(0.92, 1.12, 0.26, 8)
    const altarStoneMat = new MeshStandardMaterial({ color: '#9c9488', roughness: 0.88 })
    const altarRuneGeo = new TorusGeometry(0.74, 0.045, 6, 20)
    altarRuneGeo.rotateX(Math.PI / 2)
    const altarRuneMat = new MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.72 })

    // 8. Character Movement Juice VFX (Dust Puffs + Jump Wind Ring)
    const dustGeo = new SphereGeometry(0.18, 7, 6)
    const dustMat = new MeshBasicMaterial({ color: '#fff1d0', transparent: true, opacity: 0.62, depthWrite: false })
    const jumpRingGeo = new RingGeometry(0.32, 0.56, 24)
    jumpRingGeo.rotateX(-Math.PI / 2)
    const jumpRingMat = new MeshBasicMaterial({
      color: '#86e5bc',
      transparent: true,
      opacity: 0.0,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    })

    const boxGeo = new BoxGeometry(1, 1, 1)

    return {
      grassGeo,
      grassUniforms,
      grassMat,
      bannerGeo,
      bannerUniforms,
      bannerMats,
      poleMat,
      godRayGeo,
      godRayUniforms,
      godRayMat,
      cloudGeo,
      cloudMat,
      shrineStoneMat,
      shrineMossMat,
      shrineGlowMats,
      millWoodMat,
      millBrassMat,
      millSailMat,
      altarStoneGeo,
      altarStoneMat,
      altarRuneGeo,
      altarRuneMat,
      dustGeo,
      dustMat,
      jumpRingGeo,
      jumpRingMat,
      boxGeo,
    }
  }, [])

  useEffect(() => {
    shrineGlowMatsRef.current = resources.shrineGlowMats
    return () => {
      resources.grassGeo.dispose()
      resources.grassMat.dispose()
      resources.bannerGeo.dispose()
      for (const m of resources.bannerMats) m.dispose()
      resources.poleMat.dispose()
      resources.godRayGeo.dispose()
      resources.godRayMat.dispose()
      resources.cloudGeo.dispose()
      resources.cloudMat.dispose()
      resources.shrineStoneMat.dispose()
      resources.shrineMossMat.dispose()
      for (const m of resources.shrineGlowMats) m.dispose()
      resources.millWoodMat.dispose()
      resources.millBrassMat.dispose()
      resources.millSailMat.dispose()
      resources.altarStoneGeo.dispose()
      resources.altarStoneMat.dispose()
      resources.altarRuneGeo.dispose()
      resources.altarRuneMat.dispose()
      resources.dustGeo.dispose()
      resources.dustMat.dispose()
      resources.jumpRingGeo.dispose()
      resources.jumpRingMat.dispose()
      resources.boxGeo.dispose()
    }
  }, [resources])

  // Populate static InstancedMeshes once (grass, cumulus clouds, relic altars)
  const cloudSeeds = useMemo(() => {
    const rng = mulberry32(6021)
    const puffs: Array<{ baseAngle: number; radius: number; y: number; sx: number; sy: number; sz: number; speed: number }> = []
    for (let c = 0; c < LIVING_WORLD_META.cumulusClusters; c++) {
      const baseAngle = (c / LIVING_WORLD_META.cumulusClusters) * Math.PI * 2 + rng() * 0.35
      const radius = 92 + rng() * 110
      const y = 72 + (c / LIVING_WORLD_META.cumulusClusters) * 360 + (rng() - 0.5) * 18
      const speed = 0.008 + rng() * 0.01
      // 3 puffs per cumulus cluster = 48 instanced spheres
      for (let p = 0; p < 3; p++) {
        const spread = (p - 1) * 0.06
        puffs.push({
          baseAngle: baseAngle + spread,
          radius: radius + (p - 1) * 4,
          y: y + (p === 1 ? 3.5 : 0),
          sx: (p === 1 ? 16 : 11) + rng() * 5,
          sy: (p === 1 ? 8.5 : 5.5) + rng() * 2.5,
          sz: (p === 1 ? 14 : 10) + rng() * 4,
          speed,
        })
      }
    }
    return puffs
  }, [])

  useEffect(() => {
    if (!active) return
    const rng = mulberry32(6011)

    // 1. Grass & wildflower tufts on Start Plaza perimeter + 3 Catch Decks
    if (grassRef.current) {
      const grassColors = ['#69a85a', '#7eb868', '#5c9650', '#96c96e', '#f2d974', '#f7b2ad']
      for (let i = 0; i < LIVING_WORLD_META.grassCount; i++) {
        let x = 0
        let y = 0
        let z = 0
        if (i < 660) {
          // Outer ring of Start Plaza (r = 9..31 m, avoids spawn center)
          const ang = rng() * Math.PI * 2
          const r = 9.0 + rng() * 22.0
          x = Math.cos(ang) * r
          z = Math.sin(ang) * r
          y = 0
        } else {
          // Catch Decks (125m, 250m, 375m)
          const cp = RELAXED_CHECKPOINTS[(i - 660) % RELAXED_CHECKPOINTS.length]
          const ang = rng() * Math.PI * 2
          const r = 2.6 + rng() * 2.8
          x = cp.pos[0] + Math.cos(ang) * r
          y = cp.pos[1]
          z = cp.pos[2] + Math.sin(ang) * r
        }
        const s = 0.72 + rng() * 0.75
        tmpObj.position.set(x, y, z)
        tmpObj.rotation.set(0, rng() * Math.PI * 2, 0)
        tmpObj.scale.set(s, s * (0.85 + rng() * 0.45), s)
        tmpObj.updateMatrix()
        grassRef.current.setMatrixAt(i, tmpObj.matrix)
        const isFlower = rng() > 0.88
        const colHex = isFlower ? grassColors[4 + Math.floor(rng() * 2)] : grassColors[Math.floor(rng() * 4)]
        grassRef.current.setColorAt(i, tmpCol.set(colHex))
      }
      grassRef.current.instanceMatrix.needsUpdate = true
      if (grassRef.current.instanceColor) grassRef.current.instanceColor.needsUpdate = true
    }

    // 2. Relic Altar pedestals right under all 12 Sky Relics
    if (altarStoneRef.current && altarRuneRef.current) {
      for (let i = 0; i < SKY_RELICS.length; i++) {
        const r = SKY_RELICS[i]
        tmpObj.position.set(r.pos[0], r.pos[1] - 0.88, r.pos[2])
        tmpObj.rotation.set(0, i * 0.6, 0)
        tmpObj.scale.set(1, 1, 1)
        tmpObj.updateMatrix()
        altarStoneRef.current.setMatrixAt(i, tmpObj.matrix)

        tmpObj.position.set(r.pos[0], r.pos[1] - 0.72, r.pos[2])
        tmpObj.updateMatrix()
        altarRuneRef.current.setMatrixAt(i, tmpObj.matrix)
      }
      altarStoneRef.current.instanceMatrix.needsUpdate = true
      altarRuneRef.current.instanceMatrix.needsUpdate = true
    }
  }, [active])

  // Character Movement Juice VFX pool state
  const puffsRef = useRef<PuffState[]>(
    Array.from({ length: PUFF_POOL }, () => ({
      active: false,
      age: 0,
      life: 0.45,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 1,
    })),
  )
  const vfxTrackRef = useRef({
    puffIdx: 0,
    stepAccum: 0,
    wasGrounded: true,
    lastAirJumps: 0,
    ringAge: 99,
    ringPos: new Vector3(),
    prevYaw: 0,
    bankLean: 0,
  })

  useFrame(({ clock }, rawDt) => {
    if (!active) return
    const dt = Math.min(rawDt, 0.08)
    const t = clock.elapsedTime
    const windInt = game.challenges.windIntensity
    const windAng = game.challenges.windAngle

    // 1-2. Update wind shaders & daylight god-ray opacity
    const pPos = game.port?.position
    const heightM = pPos ? Math.max(0, pPos.y - game.spawn.y) : 0
    const daylight = Math.max(0.02, 1 - Math.max(0, (heightM - 320) / 140))
    setLivingUniforms(resources, t, windInt, windAng, daylight)

    // 3. Spin brass windmills dynamically with windIntensity
    const spinRate = 0.85 + windInt * 3.4
    for (let i = 0; i < WINDMILL_SPOTS.length; i++) {
      const blades = windmillBladesRef.current[i]
      if (blades) blades.rotation.z -= dt * spinRate * (i % 2 === 0 ? 1 : -1)
    }

    // 4. Gently drift Ghibli cumulus cloud billows
    if (cloudsRef.current) {
      for (let i = 0; i < cloudSeeds.length; i++) {
        const c = cloudSeeds[i]
        const ang = c.baseAngle + t * c.speed
        tmpObj.position.set(Math.cos(ang) * c.radius, c.y + Math.sin(t * 0.4 + i) * 1.2, Math.sin(ang) * c.radius)
        tmpObj.rotation.set(0, ang, 0)
        tmpObj.scale.set(c.sx, c.sy, c.sz)
        tmpObj.updateMatrix()
        cloudsRef.current.setMatrixAt(i, tmpObj.matrix)
      }
      cloudsRef.current.instanceMatrix.needsUpdate = true
    }

    // 5. Interactive Tōrō stone lantern shrines (glow pulse + chime on approach)
    if (pPos) {
      for (let i = 0; i < SHRINE_SPOTS.length; i++) {
        const sh = SHRINE_SPOTS[i]
        const mat = shrineGlowMatsRef.current[i]
        if (!mat) continue
        const distSq = (pPos.x - sh.pos[0]) ** 2 + (pPos.y - sh.pos[1]) ** 2 + (pPos.z - sh.pos[2]) ** 2
        const near = distSq < 81 // 9 m radius
        const targetGlow = near ? 2.1 + Math.sin(t * 5) * 0.35 : 0.65 + Math.sin(t * 1.8 + i) * 0.12
        mat.emissiveIntensity += (targetGlow - mat.emissiveIntensity) * Math.min(1, dt * 6)
        if (near && !visitedShrinesRef.current.has(sh.id) && game.snapshot.state === 'PLAYING') {
          visitedShrinesRef.current.add(sh.id)
          playWindChime()
        }
      }
    }

    // 6. Character Movement Juice VFX (footstep dust, jump/land wind ring, subtle turn bank lean)
    const vt = vfxTrackRef.current
    const puffs = puffsRef.current
    const port = game.port
    const ctrl = game.controller
    const spawnPuff = (x: number, y: number, z: number, count: number, spread: number, size: number) => {
      for (let k = 0; k < count; k++) {
        const pf = puffs[vt.puffIdx % PUFF_POOL]
        vt.puffIdx++
        const a = (k / count) * Math.PI * 2 + Math.random() * 0.8
        pf.active = true
        pf.age = 0
        pf.life = 0.38 + Math.random() * 0.22
        pf.x = x + (Math.random() - 0.5) * 0.25
        pf.y = y + 0.08
        pf.z = z + (Math.random() - 0.5) * 0.25
        pf.vx = Math.cos(a) * spread
        pf.vy = 0.55 + Math.random() * 0.65
        pf.vz = Math.sin(a) * spread
        pf.size = size * (0.75 + Math.random() * 0.5)
      }
    }

    if (port && ctrl && game.snapshot.state === 'PLAYING') {
      const grounded = port.isGroundedRaw
      const hSpeed = Math.hypot(port.velocity.x, port.velocity.z)

      // Footstep dust when moving on ground
      if (grounded && hSpeed > 1.8) {
        vt.stepAccum += dt * (ctrl.sprintActive ? 6.5 : 3.5)
        if (vt.stepAccum >= 1) {
          vt.stepAccum = 0
          spawnPuff(port.position.x, port.position.y, port.position.z, 2, 0.7, ctrl.sprintActive ? 1.15 : 0.85)
        }
      }

      // Landing dust burst
      if (grounded && !vt.wasGrounded) {
        spawnPuff(port.position.x, port.position.y, port.position.z, 6, 1.8, 1.35)
        vt.ringAge = 0
        vt.ringPos.set(port.position.x, port.position.y + 0.06, port.position.z)
      }
      // Takeoff / double-jump wind ring
      if ((!grounded && vt.wasGrounded && port.velocity.y > 2) || ctrl.airJumpCount > vt.lastAirJumps) {
        vt.ringAge = 0
        vt.ringPos.set(port.position.x, port.position.y + 0.1, port.position.z)
        spawnPuff(port.position.x, port.position.y, port.position.z, 4, 1.3, 1.0)
      }
      vt.wasGrounded = grounded
      vt.lastAirJumps = ctrl.airJumpCount

      // Subtle body bank lean into turns (applied to visual wrapper roll z)
      const yawDiff = Math.atan2(Math.sin(ctrl.facingYaw - vt.prevYaw), Math.cos(ctrl.facingYaw - vt.prevYaw))
      vt.prevYaw = ctrl.facingYaw
      const targetLean = Math.max(-0.09, Math.min(0.09, -yawDiff * 1.4 * Math.min(1, hSpeed / 4)))
      vt.bankLean += (targetLean - vt.bankLean) * Math.min(1, dt * 10)
      if (game.visual) game.visual.rotation.z = vt.bankLean
    }

    // Update dust pool matrices
    if (dustRef.current) {
      for (let i = 0; i < PUFF_POOL; i++) {
        const pf = puffs[i]
        if (!pf.active) {
          tmpObj.position.set(0, -999, 0)
          tmpObj.scale.setScalar(0.001)
          tmpObj.updateMatrix()
          dustRef.current.setMatrixAt(i, tmpObj.matrix)
          continue
        }
        pf.age += dt
        if (pf.age >= pf.life) {
          pf.active = false
          tmpObj.position.set(0, -999, 0)
          tmpObj.scale.setScalar(0.001)
          tmpObj.updateMatrix()
          dustRef.current.setMatrixAt(i, tmpObj.matrix)
          continue
        }
        pf.x += pf.vx * dt
        pf.y += pf.vy * dt
        pf.z += pf.vz * dt
        const k = 1 - pf.age / pf.life
        tmpObj.position.set(pf.x, pf.y, pf.z)
        tmpObj.scale.setScalar(pf.size * (0.4 + k * 0.9))
        tmpObj.updateMatrix()
        dustRef.current.setMatrixAt(i, tmpObj.matrix)
      }
      dustRef.current.instanceMatrix.needsUpdate = true
    }

    // Update expanding jump/land wind ring
    if (jumpRingRef.current) {
      vt.ringAge += dt
      if (vt.ringAge < 0.36) {
        const p = vt.ringAge / 0.36
        jumpRingRef.current.visible = true
        jumpRingRef.current.position.copy(vt.ringPos)
        jumpRingRef.current.scale.setScalar(0.7 + p * 2.4)
        resources.jumpRingMat.opacity = (1 - p) * 0.65
      } else {
        jumpRingRef.current.visible = false
      }
    }
  })

  if (!active) return null

  return (
    <group name="living-ghibli-world">
      {/* 1. Instanced wind-swaying grass & wildflowers */}
      <instancedMesh
        ref={grassRef}
        name="living-grass"
        args={[resources.grassGeo, resources.grassMat, LIVING_WORLD_META.grassCount]}
        frustumCulled={false}
      />

      {/* 2. Fluttering Ghibli prayer banners & timber poles */}
      <group name="living-banners">
        {BANNER_SPOTS.map((b, i) => (
          <group key={i} position={b.pos} rotation={[0, b.rotY, 0]}>
            <mesh position={[0, -b.height * 0.5, 0]} material={resources.poleMat} castShadow>
              <cylinderGeometry args={[0.06, 0.08, b.height + 0.6, 6]} />
            </mesh>
            <mesh position={[0.36, 0.18, 0]} rotation={[0, 0, Math.PI / 2]} material={resources.poleMat}>
              <cylinderGeometry args={[0.04, 0.04, 0.85, 6]} />
            </mesh>
            <mesh position={[0.42, 0.16, 0]} geometry={resources.bannerGeo} material={resources.bannerMats[i]} />
          </group>
        ))}
      </group>

      {/* 3. Interactive Mossy Tōrō Stone Lantern Shrines */}
      <group name="living-shrines">
        {SHRINE_SPOTS.map((sh, i) => (
          <group key={sh.id} name={sh.id} position={sh.pos}>
            <mesh position={[0, 0.22, 0]} material={resources.shrineStoneMat} castShadow receiveShadow>
              <cylinderGeometry args={[0.58, 0.72, 0.44, 6]} />
            </mesh>
            <mesh position={[0, 1.05, 0]} material={resources.shrineStoneMat} castShadow receiveShadow>
              <cylinderGeometry args={[0.26, 0.34, 1.25, 6]} />
            </mesh>
            <mesh position={[0, 1.85, 0]} material={resources.shrineGlowMats[i]}>
              <cylinderGeometry args={[0.32, 0.32, 0.48, 6]} />
            </mesh>
            <mesh position={[0, 2.28, 0]} material={resources.shrineStoneMat} castShadow>
              <coneGeometry args={[0.78, 0.46, 6]} />
            </mesh>
            <mesh position={[0, 2.38, 0]} material={resources.shrineMossMat}>
              <cylinderGeometry args={[0.36, 0.62, 0.14, 6]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 4. Wind-reactive Brass Windmills */}
      <group name="living-windmills">
        {WINDMILL_SPOTS.map((m, idx) => (
          <group key={m.id} name={m.id} position={m.pos} rotation={[0, m.rotY, 0]} scale={m.scale}>
            <mesh position={[0, 3.2, 0]} material={resources.millWoodMat} castShadow>
              <cylinderGeometry args={[0.24, 0.48, 6.4, 8]} />
            </mesh>
            <mesh position={[0, 6.2, 0.35]} rotation={[Math.PI / 2, 0, 0]} material={resources.millBrassMat}>
              <cylinderGeometry args={[0.42, 0.42, 0.55, 10]} />
            </mesh>
            <group
              position={[0, 6.2, 0.62]}
              ref={(el) => {
                windmillBladesRef.current[idx] = el
              }}
            >
              {[0, 1, 2, 3].map((k) => (
                <group key={k} rotation={[0, 0, (k * Math.PI) / 2]}>
                  <mesh position={[0, 1.9, 0]} material={resources.millWoodMat}>
                    <boxGeometry args={[0.12, 3.8, 0.08]} />
                  </mesh>
                  <mesh position={[0.48, 2.25, 0.04]} rotation={[0, 0.16, 0]} material={resources.millSailMat}>
                    <boxGeometry args={[0.82, 2.65, 0.04]} />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
        ))}
      </group>

      {/* 5. Fake Volumetric Sunbeams (God Rays) */}
      <group name="living-godrays">
        {GODRAY_SPOTS.map((g, i) => (
          <mesh
            key={i}
            position={g.pos}
            rotation={[0.36, 0.25, -0.44]}
            scale={g.scale}
            geometry={resources.godRayGeo}
            material={resources.godRayMat}
            renderOrder={2}
          />
        ))}
      </group>

      {/* 6. Layered Ghibli Cumulus Cloud Billows */}
      <instancedMesh
        ref={cloudsRef}
        name="living-cumulus"
        args={[resources.cloudGeo, resources.cloudMat, cloudSeeds.length]}
        frustumCulled={false}
      />

      {/* 7. Relic Altar Pedestals */}
      <instancedMesh
        ref={altarStoneRef}
        name="living-relic-altars"
        args={[resources.altarStoneGeo, resources.altarStoneMat, SKY_RELICS.length]}
        receiveShadow
      />
      <instancedMesh
        ref={altarRuneRef}
        name="living-relic-runes"
        args={[resources.altarRuneGeo, resources.altarRuneMat, SKY_RELICS.length]}
      />

      {/* 8. Character Movement Juice VFX */}
      <instancedMesh
        ref={dustRef}
        name="player-dust-vfx"
        args={[resources.dustGeo, resources.dustMat, PUFF_POOL]}
        frustumCulled={false}
      />
      <mesh
        ref={jumpRingRef}
        name="player-jump-ring"
        visible={false}
        geometry={resources.jumpRingGeo}
        material={resources.jumpRingMat}
        renderOrder={4}
      />
    </group>
  )
}
