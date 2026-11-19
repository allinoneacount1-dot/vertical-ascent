// Living Ghibli World Atmosphere & Environmental Storytelling Artifacts (Fase 6 — Gelombang A):
// - Instanced wind-swaying grass & wildflowers (custom vertex-wind ShaderMaterial, 1 draw call)
// - Fluttering cloth prayer banners & ofuda talismans reacting to Crosswind windIntensity
// - Interactive mossy Tōrō stone lantern shrines (glow & chime when player approaches within 8 m)
// - Wind-reactive Ghibli wooden/brass windmills spinning faster during Crosswind Gust
// - Lightweight slanted additive Sunbeams (fake volumetric God Rays, 0 post-processing overhead)
// - Sculpted Ghibli cumulus cloud billows drifting in the outer sky ring (r = 125..210 m)
// - Grounded mossy stone plinths beneath Sky Relics
// 100% non-collider and positioned strictly outside TEST-37 sightline corridors.
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
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import type { LoadedLevel } from './levels.ts'
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

type ShrineSpec = { id: string; pos: [number, number, number]; runeColor: string }
type WindmillSpec = { id: string; pos: [number, number, number]; rotY: number; scale: number }
type BannerSpec = { id: string; pos: [number, number, number]; rotY: number; color: string; height: number }

const SHRINES: readonly ShrineSpec[] = [
  { id: 'toro-start-e', pos: [9.2, 0.0, -5.8], runeColor: '#5fd4a3' },
  { id: 'toro-start-w', pos: [-9.2, 0.0, -5.8], runeColor: '#ffd166' },
  { id: 'toro-cp-125', pos: [RELAXED_CHECKPOINTS[0].pos[0] + 4.4, RELAXED_CHECKPOINTS[0].pos[1], RELAXED_CHECKPOINTS[0].pos[2] - 3.6], runeColor: '#5fd4a3' },
  { id: 'toro-cp-250', pos: [RELAXED_CHECKPOINTS[1].pos[0] + 4.4, RELAXED_CHECKPOINTS[1].pos[1], RELAXED_CHECKPOINTS[1].pos[2] - 3.6], runeColor: '#ffd166' },
  { id: 'toro-cp-375', pos: [RELAXED_CHECKPOINTS[2].pos[0] + 4.4, RELAXED_CHECKPOINTS[2].pos[1], RELAXED_CHECKPOINTS[2].pos[2] - 3.6], runeColor: '#93c5fd' },
]

const WINDMILLS: readonly WindmillSpec[] = [
  { id: 'windmill-plaza', pos: [-16.5, 0.0, -14.0], rotY: 0.55, scale: 1.15 },
  { id: 'windmill-z2', pos: [RELAXED_CHECKPOINTS[0].pos[0] - 5.2, RELAXED_CHECKPOINTS[0].pos[1], RELAXED_CHECKPOINTS[0].pos[2] + 4.2], rotY: -0.7, scale: 1.0 },
  { id: 'windmill-z3', pos: [RELAXED_CHECKPOINTS[1].pos[0] - 5.2, RELAXED_CHECKPOINTS[1].pos[1], RELAXED_CHECKPOINTS[1].pos[2] + 4.2], rotY: 1.1, scale: 1.05 },
  { id: 'windmill-z4', pos: [RELAXED_CHECKPOINTS[2].pos[0] - 5.2, RELAXED_CHECKPOINTS[2].pos[1], RELAXED_CHECKPOINTS[2].pos[2] + 4.2], rotY: 2.3, scale: 1.0 },
]

const BANNERS: readonly BannerSpec[] = [
  { id: 'banner-start-1', pos: [11.5, 2.8, -2.0], rotY: -0.4, color: '#d95b43', height: 3.0 },
  { id: 'banner-start-2', pos: [-11.5, 2.8, -2.0], rotY: 0.4, color: '#f3e5c8', height: 3.0 },
  { id: 'banner-start-3', pos: [6.8, 2.6, 8.8], rotY: 2.6, color: '#e6a84c', height: 2.6 },
  { id: 'banner-z2-1', pos: [RELAXED_CHECKPOINTS[0].pos[0] + 5.2, RELAXED_CHECKPOINTS[0].pos[1] + 2.6, RELAXED_CHECKPOINTS[0].pos[2] + 2.4], rotY: 0.8, color: '#d95b43', height: 2.8 },
  { id: 'banner-z3-1', pos: [RELAXED_CHECKPOINTS[1].pos[0] + 5.2, RELAXED_CHECKPOINTS[1].pos[1] + 2.6, RELAXED_CHECKPOINTS[1].pos[2] + 2.4], rotY: -0.6, color: '#5fd4a3', height: 2.8 },
  { id: 'banner-z4-1', pos: [RELAXED_CHECKPOINTS[2].pos[0] + 5.2, RELAXED_CHECKPOINTS[2].pos[1] + 2.6, RELAXED_CHECKPOINTS[2].pos[2] + 2.4], rotY: 1.4, color: '#818cf8', height: 3.0 },
]

const GOD_RAYS: ReadonlyArray<{ pos: [number, number, number]; height: number; topR: number; botR: number }> = [
  { pos: [-26, 68, -24], height: 150, topR: 7, botR: 28 },
  { pos: [28, 140, 22], height: 170, topR: 8, botR: 32 },
  { pos: [-34, 245, 26], height: 190, topR: 9, botR: 34 },
  { pos: [36, 330, -28], height: 190, topR: 9, botR: 36 },
  { pos: [-18, 430, -18], height: 200, topR: 10, botR: 38 },
]

const GRASS_COUNT = 960
const CLOUD_PUFF_COUNT = 42

function updateLivingUniforms(
  res: {
    grassUniforms: { uTime: { value: number }; uWind: { value: number } }
    bannerUniforms: { uTime: { value: number }; uWind: { value: number } }
    godRayUniforms: { uTime: { value: number }; uOpacity: { value: number } }
  },
  t: number,
  wind: number,
  godRayOpacity: number,
): void {
  res.grassUniforms.uTime.value = t
  res.grassUniforms.uWind.value = wind
  res.bannerUniforms.uTime.value = t
  res.bannerUniforms.uWind.value = wind
  res.godRayUniforms.uTime.value = t
  res.godRayUniforms.uOpacity.value = godRayOpacity
}

function stepShrineGlow(mat: MeshStandardMaterial, target: number, dt: number): void {
  mat.emissiveIntensity += (target - mat.emissiveIntensity) * Math.min(1, dt * 6)
}

export function LivingWorld({ level }: { level: LoadedLevel }) {
  const active = level.id === 'main'
  const grassRef = useRef<InstancedMesh>(null)
  const cloudsRef = useRef<InstancedMesh>(null)
  const altarRef = useRef<InstancedMesh>(null)
  const rotorRefs = useRef<Array<Group | null>>([])
  const shrineLitRef = useRef<boolean[]>(SHRINES.map(() => false))

  const resources = useMemo(() => {
    // 1. Wind-swaying grass blade geometry + vertex-wind shader
    const grassGeo = new PlaneGeometry(0.18, 0.72, 1, 3)
    grassGeo.translate(0, 0.36, 0)
    const grassUniforms = {
      uTime: { value: 0 },
      uWind: { value: 0.35 },
      uBaseColor: { value: new Color('#4c8549') },
      uTipColor: { value: new Color('#b8e27c') },
    }
    const grassMat = new ShaderMaterial({
      uniforms: grassUniforms,
      side: DoubleSide,
      vertexShader: `
        uniform float uTime;
        uniform float uWind;
        varying float vH;
        varying float vSeed;
        void main() {
          vH = clamp(position.y / 0.72, 0.0, 1.0);
          vec4 worldBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vSeed = fract(sin(dot(worldBase.xz, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 pos = position;
          float sway = sin(uTime * (2.2 + uWind * 3.0) + worldBase.x * 0.35 + worldBase.z * 0.28 + vSeed * 6.2831);
          float bend = vH * vH * (0.14 + uWind * 0.38);
          pos.x += sway * bend;
          pos.z += cos(uTime * 1.6 + worldBase.z * 0.25) * bend * 0.55;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uBaseColor;
        uniform vec3 uTipColor;
        varying float vH;
        varying float vSeed;
        void main() {
          vec3 col = mix(uBaseColor, uTipColor, pow(vH, 0.75));
          // Occasional sunlit wildflower tip tint
          if (vSeed > 0.88 && vH > 0.76) col = mix(col, vec3(1.0, 0.92, 0.62), 0.75);
          else if (vSeed < 0.07 && vH > 0.76) col = mix(col, vec3(1.0, 0.76, 0.74), 0.7);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })

    // 2. Fluttering cloth banner shader
    const bannerGeo = new PlaneGeometry(0.72, 1.0, 4, 8)
    bannerGeo.translate(0, -0.5, 0)
    const bannerUniforms = { uTime: { value: 0 }, uWind: { value: 0.35 } }
    const bannerMats = BANNERS.map(
      (b) =>
        new ShaderMaterial({
          uniforms: {
            uTime: bannerUniforms.uTime,
            uWind: bannerUniforms.uWind,
            uColor: { value: new Color(b.color) },
          },
          side: DoubleSide,
          vertexShader: `
            uniform float uTime;
            uniform float uWind;
            varying vec2 vUv;
            void main() {
              vUv = uv;
              vec3 pos = position;
              float pin = 1.0 - uv.y;
              float wave = sin(uTime * (3.2 + uWind * 5.0) - pin * 5.2 + pos.x * 2.0);
              pos.z += wave * pin * (0.16 + uWind * 0.32);
              pos.x += sin(uTime * 2.0 - pin * 3.0) * pin * 0.08;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 uColor;
            varying vec2 vUv;
            void main() {
              float border = step(0.08, vUv.x) * step(vUv.x, 0.92);
              vec3 trim = vec3(0.96, 0.86, 0.56);
              vec3 col = mix(trim, uColor, border);
              float fold = 0.88 + 0.12 * sin(vUv.y * 18.0);
              gl_FragColor = vec4(col * fold, 1.0);
            }
          `,
        }),
    )

    // 3. Fake Volumetric Sunbeams (God Rays)
    const godRayGeo = new ConeGeometry(1, 1, 16, 1, true)
    const godRayUniforms = { uTime: { value: 0 }, uColor: { value: new Color('#ffe6a8') }, uOpacity: { value: 0.11 } }
    const godRayMat = new ShaderMaterial({
      uniforms: godRayUniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormalV = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        void main() {
          float edge = pow(abs(dot(vNormalV, vViewDir)), 1.6);
          float vertFade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
          float shimmer = 0.85 + 0.15 * sin(uTime * 0.7 + vUv.x * 12.566);
          float alpha = edge * vertFade * shimmer * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })

    // 4. Shared materials for Tōrō Shrines, Windmills, Cumulus Clouds & Relic Altars
    const stoneMat = new MeshStandardMaterial({ color: '#9c9689', roughness: 0.9 })
    const mossMat = new MeshStandardMaterial({ color: '#78ad6e', roughness: 0.86 })
    const woodMat = new MeshStandardMaterial({ color: '#8a5d3b', roughness: 0.85 })
    const sailMat = new MeshStandardMaterial({ color: '#f4ead2', roughness: 0.78, side: DoubleSide })
    const brassMat = new MeshStandardMaterial({ color: '#d8a852', roughness: 0.38, metalness: 0.65 })
    const cloudGeo = new SphereGeometry(1, 10, 8)
    const cloudMat = new MeshStandardMaterial({ color: '#fff8ee', emissive: '#e8d7be', emissiveIntensity: 0.22, roughness: 0.95 })
    const altarGeo = new CylinderGeometry(0.62, 0.82, 0.5, 8)
    const poleGeo = new CylinderGeometry(0.06, 0.08, 3.8, 6)
    const armGeo = new BoxGeometry(0.95, 0.07, 0.07)

    const shrineRuneMats = SHRINES.map(
      (s) =>
        new MeshStandardMaterial({
          color: s.runeColor,
          emissive: s.runeColor,
          emissiveIntensity: 0.65,
          roughness: 0.3,
        }),
    )

    return {
      grassGeo,
      grassUniforms,
      grassMat,
      bannerGeo,
      bannerUniforms,
      bannerMats,
      godRayGeo,
      godRayUniforms,
      godRayMat,
      stoneMat,
      mossMat,
      woodMat,
      sailMat,
      brassMat,
      cloudGeo,
      cloudMat,
      altarGeo,
      poleGeo,
      armGeo,
      shrineRuneMats,
    }
  }, [])

  const cloudSeeds = useMemo(() => {
    const rng = mulberry32(6102)
    return Array.from({ length: CLOUD_PUFF_COUNT }, (_, i) => ({
      angle: (i / CLOUD_PUFF_COUNT) * Math.PI * 2 + rng() * 0.35,
      radius: 130 + rng() * 95,
      y: 95 + rng() * 340,
      sx: 14 + rng() * 18,
      sy: 6 + rng() * 7,
      sz: 12 + rng() * 16,
      speed: 0.008 + rng() * 0.012,
    }))
  }, [])

  // Populate static InstancedMeshes (grass tufts + relic stone altars)
  useEffect(() => {
    if (!active) return
    const dummy = new Object3D()
    const rng = mulberry32(6049)

    if (grassRef.current) {
      const patches: Array<{ cx: number; cy: number; cz: number; minR: number; maxR: number; count: number }> = [
        { cx: 0, cy: 0, cz: 0, minR: 7.5, maxR: 26, count: 540 },
        { cx: RELAXED_CHECKPOINTS[0].pos[0], cy: RELAXED_CHECKPOINTS[0].pos[1], cz: RELAXED_CHECKPOINTS[0].pos[2], minR: 2.2, maxR: 6.2, count: 140 },
        { cx: RELAXED_CHECKPOINTS[1].pos[0], cy: RELAXED_CHECKPOINTS[1].pos[1], cz: RELAXED_CHECKPOINTS[1].pos[2], minR: 2.2, maxR: 6.2, count: 140 },
        { cx: RELAXED_CHECKPOINTS[2].pos[0], cy: RELAXED_CHECKPOINTS[2].pos[1], cz: RELAXED_CHECKPOINTS[2].pos[2], minR: 2.2, maxR: 6.2, count: 140 },
      ]
      let idx = 0
      for (const p of patches) {
        for (let i = 0; i < p.count && idx < GRASS_COUNT; i++) {
          const ang = rng() * Math.PI * 2
          const r = p.minR + Math.sqrt(rng()) * (p.maxR - p.minR)
          dummy.position.set(p.cx + Math.cos(ang) * r, p.cy, p.cz + Math.sin(ang) * r)
          dummy.rotation.set(0, rng() * Math.PI * 2, 0)
          const sc = 0.75 + rng() * 0.85
          dummy.scale.set(sc, sc * (0.85 + rng() * 0.5), sc)
          dummy.updateMatrix()
          grassRef.current.setMatrixAt(idx++, dummy.matrix)
        }
      }
      grassRef.current.instanceMatrix.needsUpdate = true
    }

    if (altarRef.current) {
      for (let i = 0; i < SKY_RELICS.length; i++) {
        const rel = SKY_RELICS[i]
        dummy.position.set(rel.pos[0], rel.pos[1] - 1.15, rel.pos[2])
        dummy.rotation.set(0, i * 0.6, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        altarRef.current.setMatrixAt(i, dummy.matrix)
      }
      altarRef.current.instanceMatrix.needsUpdate = true
    }
  }, [active])

  useEffect(
    () => () => {
      resources.grassGeo.dispose()
      resources.grassMat.dispose()
      resources.bannerGeo.dispose()
      for (const m of resources.bannerMats) m.dispose()
      resources.godRayGeo.dispose()
      resources.godRayMat.dispose()
      resources.stoneMat.dispose()
      resources.mossMat.dispose()
      resources.woodMat.dispose()
      resources.sailMat.dispose()
      resources.brassMat.dispose()
      resources.cloudGeo.dispose()
      resources.cloudMat.dispose()
      resources.altarGeo.dispose()
      resources.poleGeo.dispose()
      resources.armGeo.dispose()
      for (const m of resources.shrineRuneMats) m.dispose()
    },
    [resources],
  )

  const cloudDummy = useMemo(() => new Object3D(), [])
  const tmpPos = useMemo(() => new Vector3(), [])

  useFrame(({ clock }, rawDt) => {
    if (!active) return
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    const wind = 0.25 + game.challenges.windIntensity * 1.15

    const h = game.port ? Math.max(0, game.port.position.y - game.spawn.y) : 0
    updateLivingUniforms(resources, t, wind, Math.max(0.025, 0.12 - Math.max(0, (h - 330) / 170) * 0.09))

    // Spin Ghibli windmills faster during Crosswind Gust
    const spinRate = 0.75 + wind * 2.1
    for (let i = 0; i < WINDMILLS.length; i++) {
      const r = rotorRefs.current[i]
      if (r) r.rotation.z -= spinRate * dt
    }

    // Drift outer cumulus clouds
    if (cloudsRef.current) {
      for (let i = 0; i < cloudSeeds.length; i++) {
        const c = cloudSeeds[i]
        const ang = c.angle + t * c.speed
        cloudDummy.position.set(Math.cos(ang) * c.radius, c.y + Math.sin(t * 0.4 + i) * 1.5, Math.sin(ang) * c.radius)
        cloudDummy.rotation.set(0, -ang, 0)
        cloudDummy.scale.set(c.sx, c.sy, c.sz)
        cloudDummy.updateMatrix()
        cloudsRef.current.setMatrixAt(i, cloudDummy.matrix)
      }
      cloudsRef.current.instanceMatrix.needsUpdate = true
    }

    // Interactive Tōrō stone lantern shrine proximity glow + gentle chime
    const playerPos = game.port?.position
    if (playerPos) {
      for (let i = 0; i < SHRINES.length; i++) {
        const s = SHRINES[i]
        const dist = playerPos.distanceTo(tmpPos.set(s.pos[0], s.pos[1] + 1.2, s.pos[2]))
        const near = dist < 8.0
        const targetEmissive = near ? 2.4 + Math.sin(t * 4.5) * 0.35 : 0.65
        stepShrineGlow(resources.shrineRuneMats[i], targetEmissive, dt)
        if (near && !shrineLitRef.current[i]) {
          shrineLitRef.current[i] = true
          playLanternChime()
        } else if (!near && dist > 14) {
          shrineLitRef.current[i] = false
        }
      }
    }
  })

  if (!active) return null

  return (
    <group name="living-world">
      {/* 1. Instanced Wind-Swaying Grass & Wildflowers */}
      <instancedMesh ref={grassRef} name="living-grass" args={[resources.grassGeo, resources.grassMat, GRASS_COUNT]} frustumCulled={false} />

      {/* 2. Grounded Mossy Stone Altars beneath the 12 Sky Relics */}
      <instancedMesh ref={altarRef} name="relic-altars" args={[resources.altarGeo, resources.stoneMat, SKY_RELICS.length]} receiveShadow />

      {/* 3. Interactive Mossy Tōrō Stone Lantern Shrines */}
      {SHRINES.map((s, i) => (
        <group key={s.id} name={s.id} position={s.pos}>
          <mesh position={[0, 0.25, 0]} material={resources.stoneMat} castShadow receiveShadow>
            <cylinderGeometry args={[0.55, 0.72, 0.5, 6]} />
          </mesh>
          <mesh position={[0, 1.1, 0]} material={resources.stoneMat} castShadow receiveShadow>
            <cylinderGeometry args={[0.26, 0.34, 1.25, 6]} />
          </mesh>
          <mesh position={[0, 1.95, 0]} material={resources.shrineRuneMats[i]}>
            <octahedronGeometry args={[0.32, 0]} />
          </mesh>
          <mesh position={[0, 2.42, 0]} material={resources.mossMat} castShadow>
            <coneGeometry args={[0.78, 0.52, 6]} />
          </mesh>
        </group>
      ))}

      {/* 4. Wind-Reactive Ghibli Windmills */}
      {WINDMILLS.map((w, i) => (
        <group key={w.id} name={w.id} position={w.pos} rotation={[0, w.rotY, 0]} scale={w.scale}>
          <mesh position={[0, 2.6, 0]} material={resources.woodMat} castShadow>
            <cylinderGeometry args={[0.16, 0.28, 5.2, 8]} />
          </mesh>
          <mesh position={[0, 5.1, 0.22]} rotation={[Math.PI / 2, 0, 0]} material={resources.brassMat}>
            <cylinderGeometry args={[0.24, 0.24, 0.42, 10]} />
          </mesh>
          <group
            position={[0, 5.1, 0.42]}
            ref={(el) => {
              rotorRefs.current[i] = el
            }}
          >
            {[0, 1, 2, 3].map((b) => (
              <group key={b} rotation={[0, 0, (b * Math.PI) / 2]}>
                <mesh position={[0, 1.35, 0]} material={resources.woodMat}>
                  <boxGeometry args={[0.1, 2.7, 0.08]} />
                </mesh>
                <mesh position={[0.34, 1.55, 0.03]} material={resources.sailMat}>
                  <planeGeometry args={[0.62, 1.95]} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      ))}

      {/* 5. Fluttering Cloth Prayer Banners */}
      {BANNERS.map((b, i) => (
        <group key={b.id} name={b.id} position={b.pos} rotation={[0, b.rotY, 0]}>
          <mesh position={[0, -0.9, 0]} geometry={resources.poleGeo} material={resources.woodMat} castShadow />
          <mesh position={[0.45, 0.95, 0]} geometry={resources.armGeo} material={resources.brassMat} />
          <mesh position={[0.45, 0.92, 0]} scale={[1, b.height, 1]} geometry={resources.bannerGeo} material={resources.bannerMats[i]} />
        </group>
      ))}

      {/* 6. Slanted Additive Sunbeams (Fake Volumetric God Rays) */}
      <group name="living-godrays">
        {GOD_RAYS.map((r, i) => (
          <mesh
            key={i}
            position={r.pos}
            rotation={[0.26, 0.15, -0.44]}
            scale={[r.botR, r.height, r.botR]}
            geometry={resources.godRayGeo}
            material={resources.godRayMat}
            renderOrder={3}
          />
        ))}
      </group>

      {/* 7. Drifting Ghibli Cumulus Cloud Billows */}
      <instancedMesh ref={cloudsRef} name="living-cumulus" args={[resources.cloudGeo, resources.cloudMat, CLOUD_PUFF_COUNT]} frustumCulled={false} />
    </group>
  )
}
