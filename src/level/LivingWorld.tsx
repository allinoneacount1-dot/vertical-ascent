// Genshin Impact x Ghibli Living World Atmosphere & Artifacts (Tahap 2):
// - 1,200 instanced wind-swaying grass tufts & wildflowers (1 InstancedMesh draw call, vertex wind shader)
// - Fluttering cloth prayer banners driven by live windIntensity & windAngle
// - Interactive mossy Tōrō stone lantern shrines with glowing teal/gold runes + proximity chime
// - Spinning brass-and-wood windmills reacting to Crosswind Gusts
// - Lightweight additive fake volumetric golden-hour God Rays (0 post-processing overhead)
// - Carved stone altar pedestals beneath all 12 Sky Relics
// All elements are strictly non-collider and positioned clear of TEST-37 climbing sightlines.
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
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
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

const TORO_SHRINES: ReadonlyArray<{ id: string; pos: [number, number, number] }> = [
  { id: 'toro-plaza-e', pos: [7.5, 0, -5.5] },
  { id: 'toro-plaza-w', pos: [-7.5, 0, -5.5] },
  { id: 'toro-cp-125', pos: [RELAXED_CHECKPOINTS[0].pos[0] + 4.2, RELAXED_CHECKPOINTS[0].pos[1] - 0.1, RELAXED_CHECKPOINTS[0].pos[2] + 3.2] },
  { id: 'toro-cp-250', pos: [RELAXED_CHECKPOINTS[1].pos[0] + 4.2, RELAXED_CHECKPOINTS[1].pos[1] - 0.1, RELAXED_CHECKPOINTS[1].pos[2] + 3.2] },
  { id: 'toro-cp-375', pos: [RELAXED_CHECKPOINTS[2].pos[0] + 4.2, RELAXED_CHECKPOINTS[2].pos[1] - 0.1, RELAXED_CHECKPOINTS[2].pos[2] + 3.2] },
]

const WINDMILLS: ReadonlyArray<{ id: string; pos: [number, number, number]; rotY: number; scale: number }> = [
  { id: 'windmill-plaza', pos: [-16, 0, -14], rotY: 0.6, scale: 1.25 },
  { id: 'windmill-z2', pos: [RELAXED_CHECKPOINTS[0].pos[0] - 9.5, RELAXED_CHECKPOINTS[0].pos[1] - 1.2, RELAXED_CHECKPOINTS[0].pos[2] - 7.5], rotY: 1.4, scale: 1.1 },
  { id: 'windmill-z3', pos: [RELAXED_CHECKPOINTS[1].pos[0] - 9.5, RELAXED_CHECKPOINTS[1].pos[1] - 1.2, RELAXED_CHECKPOINTS[1].pos[2] - 7.5], rotY: -0.9, scale: 1.15 },
]

const BANNERS: ReadonlyArray<{ id: string; pos: [number, number, number]; rotY: number; color: string }> = [
  { id: 'banner-plaza-1', pos: [5.8, 0, -4.2], rotY: 0.35, color: '#d95b43' },
  { id: 'banner-plaza-2', pos: [-5.8, 0, -4.2], rotY: -0.35, color: '#4ea8a1' },
  { id: 'banner-cp1', pos: [RELAXED_CHECKPOINTS[0].pos[0] - 3.8, RELAXED_CHECKPOINTS[0].pos[1], RELAXED_CHECKPOINTS[0].pos[2] + 2.8], rotY: 0.8, color: '#e8b954' },
  { id: 'banner-cp2', pos: [RELAXED_CHECKPOINTS[1].pos[0] - 3.8, RELAXED_CHECKPOINTS[1].pos[1], RELAXED_CHECKPOINTS[1].pos[2] + 2.8], rotY: 1.1, color: '#58d5b8' },
  { id: 'banner-cp3', pos: [RELAXED_CHECKPOINTS[2].pos[0] - 3.8, RELAXED_CHECKPOINTS[2].pos[1], RELAXED_CHECKPOINTS[2].pos[2] + 2.8], rotY: -0.6, color: '#e8b954' },
]

const GOD_RAYS: ReadonlyArray<{ pos: [number, number, number]; radius: number; height: number }> = [
  { pos: [-14, 34, 12], radius: 9, height: 85 },
  { pos: [22, 95, -18], radius: 12, height: 110 },
  { pos: [-20, 185, 16], radius: 14, height: 125 },
  { pos: [18, 295, -12], radius: 15, height: 135 },
  { pos: [42, 415, -10], radius: 16, height: 145 },
]

const GRASS_COUNT = 1200

function updateLivingUniforms(
  u: {
    grassUniforms: { uTime: { value: number }; uWind: { value: number }; uWindDir: { value: Vector3 } }
    bannerUniforms: { uTime: { value: number }; uWind: { value: number } }
    rayUniforms: { uOpacity: { value: number } }
  },
  t: number,
  wind: number,
  wAng: number,
  h: number,
): void {
  u.grassUniforms.uTime.value = t
  u.grassUniforms.uWind.value = wind
  u.grassUniforms.uWindDir.value.set(Math.cos(wAng), 0, Math.sin(wAng))
  u.bannerUniforms.uTime.value = t
  u.bannerUniforms.uWind.value = wind
  u.rayUniforms.uOpacity.value = Math.max(0.025, 0.1 * (1 - Math.max(0, (h - 330) / 140)))
}

function stepRuneGlow(mat: MeshStandardMaterial, near: boolean, dt: number): void {
  const targetInt = near ? 2.4 : 0.85
  mat.emissiveIntensity += (targetInt - mat.emissiveIntensity) * Math.min(1, dt * 6)
}

export function LivingWorld({ level }: { level: LoadedLevel }) {
  const active = level.id === 'main'
  const grassRef = useRef<InstancedMesh>(null)
  const windmillBladesRef = useRef<Array<Group | null>>([])
  const shrineGlowRefs = useRef<Array<Mesh | null>>([])
  const chimedRef = useRef<Set<string>>(new Set())

  const resources = useMemo(() => {
    // 1. Instanced wind-swaying grass blade tuft (custom lightweight vertex-wind ShaderMaterial)
    const grassGeo = new ConeGeometry(0.11, 0.62, 3, 2)
    grassGeo.translate(0, 0.31, 0)
    const grassUniforms = {
      uTime: { value: 0 },
      uWind: { value: 0.35 },
      uWindDir: { value: new Vector3(1, 0, 0.3) },
      uBaseCol: { value: new Color('#3e7a47') },
      uTipCol: { value: new Color('#9be068') },
    }
    const grassMat = new ShaderMaterial({
      uniforms: grassUniforms,
      side: DoubleSide,
      vertexShader: `
        uniform float uTime;
        uniform float uWind;
        uniform vec3 uWindDir;
        varying float vH;
        varying float vTint;
        void main() {
          vec3 p = position;
          vH = clamp(p.y / 0.62, 0.0, 1.0);
          vec4 worldBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float phase = worldBase.x * 0.35 + worldBase.z * 0.27;
          float sway = sin(uTime * (2.2 + uWind * 3.8) + phase) * (0.12 + uWind * 0.28) * vH * vH;
          p.x += uWindDir.x * sway;
          p.z += uWindDir.z * sway;
          vTint = fract(sin(dot(worldBase.xz, vec2(12.9898, 78.233))) * 43758.5453);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uBaseCol;
        uniform vec3 uTipCol;
        varying float vH;
        varying float vTint;
        void main() {
          vec3 col = mix(uBaseCol, uTipCol, vH);
          if (vTint > 0.88 && vH > 0.72) col = mix(col, vec3(1.0, 0.93, 0.52), 0.82);
          else if (vTint < 0.08 && vH > 0.72) col = mix(col, vec3(0.65, 0.88, 1.0), 0.75);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })

    // 2. Fluttering cloth prayer banner shader
    const bannerGeo = new PlaneGeometry(0.95, 2.3, 4, 12)
    bannerGeo.translate(0, -1.15, 0)
    const bannerUniforms = {
      uTime: { value: 0 },
      uWind: { value: 0.35 },
    }
    const bannerMats = BANNERS.map(
      (b) =>
        new ShaderMaterial({
          uniforms: {
            uTime: bannerUniforms.uTime,
            uWind: bannerUniforms.uWind,
            uColor: { value: new Color(b.color) },
            uTrim: { value: new Color('#f6e7c1') },
          },
          side: DoubleSide,
          vertexShader: `
            uniform float uTime;
            uniform float uWind;
            varying vec2 vUv;
            void main() {
              vUv = uv;
              vec3 p = position;
              float pin = 1.0 - uv.y;
              float wave = sin(uTime * (3.2 + uWind * 5.0) - uv.y * 5.2 + p.x * 2.0);
              p.z += wave * (0.14 + uWind * 0.25) * pin;
              p.x += cos(uTime * 2.1 - uv.y * 3.0) * 0.06 * pin;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 uColor;
            uniform vec3 uTrim;
            varying vec2 vUv;
            void main() {
              float border = step(vUv.x, 0.12) + step(0.88, vUv.x) + step(vUv.y, 0.08);
              vec3 col = mix(uColor, uTrim, clamp(border, 0.0, 1.0));
              gl_FragColor = vec4(col, 1.0);
            }
          `,
        }),
    )

    // 3. Lightweight fake volumetric golden-hour God Rays (fresnel-faded additive cones)
    const rayGeo = new ConeGeometry(1, 1, 16, 1, true)
    const rayUniforms = {
      uColor: { value: new Color('#ffe6a3') },
      uOpacity: { value: 0.095 },
    }
    const rayMat = new ShaderMaterial({
      uniforms: rayUniforms,
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
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        void main() {
          float edge = pow(abs(dot(vNormalV, vViewDir)), 1.6);
          float vert = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
          gl_FragColor = vec4(uColor, edge * vert * uOpacity);
        }
      `,
    })

    // 4. Shared artifact materials & geometries
    const stoneMat = new MeshStandardMaterial({ color: '#aba294', roughness: 0.88 })
    const mossMat = new MeshStandardMaterial({ color: '#6fb362', roughness: 0.84 })
    const woodMat = new MeshStandardMaterial({ color: '#7d5636', roughness: 0.85 })
    const sailMat = new MeshStandardMaterial({ color: '#f4ead2', roughness: 0.78, side: DoubleSide })
    const brassMat = new MeshStandardMaterial({ color: '#d8a64e', roughness: 0.38, metalness: 0.62 })
    const runeMats = TORO_SHRINES.map(
      () => new MeshStandardMaterial({ color: '#72f0dc', emissive: '#38d9c0', emissiveIntensity: 0.9, roughness: 0.3 }),
    )
    const poleGeo = new CylinderGeometry(0.07, 0.1, 3.8, 7)
    const crossGeo = new CylinderGeometry(0.05, 0.05, 1.25, 6)
    crossGeo.rotateZ(Math.PI / 2)
    const altarBaseGeo = new CylinderGeometry(0.85, 1.05, 0.38, 8)
    const altarRingGeo = new CylinderGeometry(0.62, 0.72, 0.16, 8)
    const sailGeo = new BoxGeometry(0.9, 3.2, 0.05)

    return {
      grassGeo,
      grassMat,
      grassUniforms,
      bannerGeo,
      bannerMats,
      bannerUniforms,
      rayGeo,
      rayMat,
      rayUniforms,
      stoneMat,
      mossMat,
      woodMat,
      sailMat,
      brassMat,
      runeMats,
      poleGeo,
      crossGeo,
      altarBaseGeo,
      altarRingGeo,
      sailGeo,
    }
  }, [])

  // Populate 1,200 instanced grass & wildflower tufts across plaza rim & Catch Deck edges
  useEffect(() => {
    if (!active || !grassRef.current) return
    const dummy = new Object3D()
    const rng = mulberry32(202611)
    let idx = 0

    // A. Start Plaza lush outer grass ring (r = 8.5..44 m)
    for (let i = 0; i < 820 && idx < GRASS_COUNT; i++) {
      const ang = rng() * Math.PI * 2
      const r = 8.5 + Math.pow(rng(), 0.75) * 36
      const s = 0.75 + rng() * 0.95
      dummy.position.set(Math.cos(ang) * r, -0.02, Math.sin(ang) * r)
      dummy.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.12)
      dummy.scale.set(s, s * (0.85 + rng() * 0.55), s)
      dummy.updateMatrix()
      grassRef.current.setMatrixAt(idx++, dummy.matrix)
    }

    // B. Catch Deck grassy clusters (125m, 250m, 375m)
    for (const cp of RELAXED_CHECKPOINTS) {
      for (let i = 0; i < 95 && idx < GRASS_COUNT; i++) {
        const ang = rng() * Math.PI * 2
        const r = 2.6 + rng() * 3.4
        const s = 0.7 + rng() * 0.75
        dummy.position.set(cp.pos[0] + Math.cos(ang) * r, cp.pos[1] - 0.04, cp.pos[2] + Math.sin(ang) * r)
        dummy.rotation.set(0, rng() * Math.PI * 2, 0)
        dummy.scale.set(s, s, s)
        dummy.updateMatrix()
        grassRef.current.setMatrixAt(idx++, dummy.matrix)
      }
    }

    // C. Around Sky Relic altars
    for (const rel of SKY_RELICS) {
      for (let i = 0; i < 8 && idx < GRASS_COUNT; i++) {
        const ang = rng() * Math.PI * 2
        const r = 0.9 + rng() * 0.9
        const s = 0.65 + rng() * 0.5
        dummy.position.set(rel.pos[0] + Math.cos(ang) * r, rel.pos[1] - 1.0, rel.pos[2] + Math.sin(ang) * r)
        dummy.rotation.set(0, rng() * Math.PI * 2, 0)
        dummy.scale.set(s, s, s)
        dummy.updateMatrix()
        grassRef.current.setMatrixAt(idx++, dummy.matrix)
      }
    }

    grassRef.current.count = idx
    grassRef.current.instanceMatrix.needsUpdate = true
  }, [active])

  useEffect(
    () => () => {
      resources.grassGeo.dispose()
      resources.grassMat.dispose()
      resources.bannerGeo.dispose()
      for (const m of resources.bannerMats) m.dispose()
      resources.rayGeo.dispose()
      resources.rayMat.dispose()
      resources.stoneMat.dispose()
      resources.mossMat.dispose()
      resources.woodMat.dispose()
      resources.sailMat.dispose()
      resources.brassMat.dispose()
      for (const m of resources.runeMats) m.dispose()
      resources.poleGeo.dispose()
      resources.crossGeo.dispose()
      resources.altarBaseGeo.dispose()
      resources.altarRingGeo.dispose()
      resources.sailGeo.dispose()
    },
    [resources],
  )

  useFrame(({ clock }, rawDt) => {
    if (!active) return
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    const wind = 0.35 + game.challenges.windIntensity * 1.1
    const wAng = game.challenges.windAngle

    const h = game.port ? Math.max(0, game.port.position.y - game.spawn.y) : 0
    updateLivingUniforms(resources, t, wind, wAng, h)

    // Spin windmills faster during Crosswind Gusts
    const spinSpeed = 0.65 + game.challenges.windIntensity * 2.8
    for (let i = 0; i < WINDMILLS.length; i++) {
      const blades = windmillBladesRef.current[i]
      if (blades) blades.rotation.z -= spinSpeed * dt * (i % 2 === 0 ? 1 : -1)
    }

    // Proximity-reactive Tōrō stone lantern shrines
    const feet = game.port?.position
    if (feet) {
      for (let i = 0; i < TORO_SHRINES.length; i++) {
        const s = TORO_SHRINES[i]
        const dx = feet.x - s.pos[0]
        const dy = feet.y - s.pos[1]
        const dz = feet.z - s.pos[2]
        const near = dx * dx + dy * dy + dz * dz < 64
        stepRuneGlow(resources.runeMats[i], near, dt)
        if (near && !chimedRef.current.has(s.id) && game.snapshot.state === 'PLAYING') {
          chimedRef.current.add(s.id)
          playLanternChime()
        }
      }
    }
  })

  if (!active) return null

  return (
    <group name="living-world-genshin">
      {/* 1. Instanced wind-swaying grass & wildflowers */}
      <instancedMesh
        ref={grassRef}
        name="wind-grass"
        args={[resources.grassGeo, resources.grassMat, GRASS_COUNT]}
        frustumCulled={false}
      />

      {/* 2. Fluttering cloth prayer banners */}
      {BANNERS.map((b, i) => (
        <group key={b.id} name={b.id} position={b.pos} rotation={[0, b.rotY, 0]}>
          <mesh geometry={resources.poleGeo} material={resources.woodMat} position={[0, 1.9, 0]} castShadow />
          <mesh geometry={resources.crossGeo} material={resources.woodMat} position={[0.45, 3.65, 0]} />
          <mesh geometry={resources.bannerGeo} material={resources.bannerMats[i]} position={[0.52, 3.62, 0]} />
        </group>
      ))}

      {/* 3. Interactive Tōrō stone lantern shrines */}
      {TORO_SHRINES.map((s, i) => (
        <group key={s.id} name={s.id} position={s.pos}>
          <mesh position={[0, 0.25, 0]} material={resources.stoneMat} castShadow receiveShadow>
            <cylinderGeometry args={[0.55, 0.72, 0.5, 6]} />
          </mesh>
          <mesh position={[0, 1.05, 0]} material={resources.stoneMat} castShadow>
            <cylinderGeometry args={[0.26, 0.34, 1.2, 6]} />
          </mesh>
          <mesh
            ref={(el) => {
              shrineGlowRefs.current[i] = el
            }}
            position={[0, 1.82, 0]}
            material={resources.runeMats[i]}
          >
            <cylinderGeometry args={[0.28, 0.28, 0.42, 6]} />
          </mesh>
          <mesh position={[0, 2.24, 0]} material={resources.stoneMat} castShadow>
            <coneGeometry args={[0.76, 0.5, 6]} />
          </mesh>
          <mesh position={[0, 2.38, 0]} material={resources.mossMat}>
            <coneGeometry args={[0.52, 0.24, 6]} />
          </mesh>
        </group>
      ))}

      {/* 4. Wind-reactive brass & wood windmills */}
      {WINDMILLS.map((w, i) => (
        <group key={w.id} name={w.id} position={w.pos} rotation={[0, w.rotY, 0]} scale={w.scale}>
          <mesh position={[0, 3.2, 0]} material={resources.woodMat} castShadow>
            <cylinderGeometry args={[0.22, 0.45, 6.4, 8]} />
          </mesh>
          <mesh position={[0, 6.1, 0.28]} rotation={[Math.PI / 2, 0, 0]} material={resources.brassMat}>
            <cylinderGeometry args={[0.35, 0.35, 0.65, 10]} />
          </mesh>
          <group
            position={[0, 6.1, 0.62]}
            ref={(el) => {
              windmillBladesRef.current[i] = el
            }}
          >
            {[0, 1, 2, 3].map((k) => (
              <group key={k} rotation={[0, 0, (k * Math.PI) / 2]}>
                <mesh geometry={resources.sailGeo} material={resources.sailMat} position={[0.25, 1.85, 0]} />
                <mesh position={[0, 1.75, -0.04]} material={resources.woodMat}>
                  <boxGeometry args={[0.14, 3.4, 0.12]} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      ))}

      {/* 5. Fake volumetric golden-hour God Rays */}
      {GOD_RAYS.map((r, i) => (
        <mesh
          key={i}
          name={`god-ray-${i}`}
          position={r.pos}
          rotation={[0.24, 0, -0.34]}
          scale={[r.radius, r.height, r.radius]}
          geometry={resources.rayGeo}
          material={resources.rayMat}
          renderOrder={3}
        />
      ))}

      {/* 6. Carved stone altar pedestals beneath all 12 Sky Relics */}
      {SKY_RELICS.map((rel) => (
        <group key={`altar-${rel.id}`} position={[rel.pos[0], rel.pos[1] - 0.92, rel.pos[2]]}>
          <mesh geometry={resources.altarBaseGeo} material={resources.stoneMat} receiveShadow />
          <mesh geometry={resources.altarRingGeo} material={resources.mossMat} position={[0, 0.22, 0]} />
        </group>
      ))}
    </group>
  )
}
