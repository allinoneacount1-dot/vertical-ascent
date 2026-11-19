// App shell: hybrid controller in the level chosen by src/level/levels.ts (the 500 m world; slice and G1 blockout via
// ?level= in DEV). <BvhPhysicsWorld> without <Viverse> (D-003). The Canvas never unmounts between menu and game (D-005).
import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { BackSide, Color, Mesh, MeshBasicMaterial, Object3D, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import type { DirectionalLight, FogExp2, HemisphereLight } from 'three'
import { Environment } from '@react-three/drei'
import { BvhPhysicsWorld, usePointerLockRotateZoomActionBindings } from '@react-three/viverse'
import { installInputBindings } from './game/input-bindings.ts'
import { Level } from './level/Level.tsx'
import { AtmosphereParticles } from './level/AtmosphereParticles.tsx'
import { Player } from './controller/Player.tsx'
import { PlayerVfx } from './controller/PlayerVfx.tsx'
import { GameLoop } from './controller/GameLoop.tsx'
import { CameraDriver } from './camera/CameraDriver.tsx'
import { HudAndShadow } from './ui/HudSampler.tsx'
import { Overlay } from './ui/Overlay.tsx'
import { game } from './game/game.ts'
import { installPlayGuards } from './game/enter-playing.ts'
import { attachRenderer } from './game/debug.ts'
import { updateAudioFrame } from './audio/engine.ts'
import { CAMERA } from './camera/camera-rig.ts'
import { assetUrl } from './assets.ts'

function Bindings() {
  usePointerLockRotateZoomActionBindings({ lockOnClick: false })
  return null
}

const HDRI_URL = assetUrl('assets/hdri/industrial_sunset_puresky_1k.hdr')

const SUN: [number, number, number] = [-12, 20, 10]
const SUN_DISTANCE = 80
const FOG_COLOR = '#ecd8c2'
const FOG_DENSITY = 0.00062
const CAMERA_FAR = 2500

// 4-zone Ghibli atmosphere stops: z1 bright warm morning -> z2 golden midday valley -> z3 golden afternoon above clouds -> z4 dusk to celestial indigo
const FOG_STOPS = [new Color('#ecd8c2'), new Color('#cce0ee'), new Color('#ecc497'), new Color('#475785')]
const SKY_TOP_STOPS = [new Color('#6eb1eb'), new Color('#4e98e0'), new Color('#4a72ba'), new Color('#161f42')]
const SUN_STOPS = [new Color('#ffecd2'), new Color('#fff8ea'), new Color('#ffd9a0'), new Color('#c9d2f5')]
const HEMI_SKY_STOPS = [new Color('#a4ccf5'), new Color('#8dc8ff'), new Color('#f2c89c'), new Color('#4f66a6')]
const HEMI_GND_STOPS = [new Color('#cfa882'), new Color('#9cb5b0'), new Color('#b59f88'), new Color('#3d425c')]
const tmpFog = new Color()
const tmpSkyTop = new Color()
const tmpSun = new Color()
const tmpHemiSky = new Color()
const tmpHemiGnd = new Color()

function lerpStops(stops: Color[], t: number, out: Color): Color {
  const clamped = Math.max(0, Math.min(1, t))
  const scaled = clamped * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(scaled))
  return out.copy(stops[i]).lerp(stops[i + 1], scaled - i)
}

/** Shadow light + altitude-driven Ghibli lighting & audio update (with Crosswind Gust roar). */
function SunLight() {
  const light = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const offset = useMemo(() => new Vector3(...SUN).normalize().multiplyScalar(SUN_DISTANCE), [])
  useFrame(({ scene }, dt) => {
    const l = light.current
    const at = game.port?.position
    if (l != null && at != null) {
      target.position.copy(at)
      l.position.copy(at).add(offset)
      target.updateMatrixWorld()
    }
    const p = game.port
    const c = game.controller
    const playing = game.snapshot.state === 'PLAYING'
    const heightM = at != null ? Math.max(0, at.y - game.spawn.y) : game.run.heightM
    const hRatio = game.level.summitM > 0 ? Math.max(0, Math.min(1, heightM / game.level.summitM)) : 0
    const moving = p != null && p.isGroundedRaw && Math.hypot(p.velocity.x, p.velocity.z) > 0.5
    updateAudioFrame(
      Math.min(dt, 0.1),
      playing,
      hRatio,
      c?.bigFall ?? false,
      moving,
      c?.sprintActive ?? false,
      game.challenges.windIntensity,
    )

    if (l != null) {
      l.color.copy(lerpStops(SUN_STOPS, hRatio, tmpSun))
      l.intensity = 1.75 - Math.max(0, hRatio - 0.72) * 1.4
    }
    if (hemi.current != null) {
      hemi.current.color.copy(lerpStops(HEMI_SKY_STOPS, hRatio, tmpHemiSky))
      hemi.current.groundColor.copy(lerpStops(HEMI_GND_STOPS, hRatio, tmpHemiGnd))
    }
    const fog = scene.fog as FogExp2 | null
    lerpStops(FOG_STOPS, hRatio, tmpFog)
    lerpStops(SKY_TOP_STOPS, hRatio, tmpSkyTop)
    if (fog != null) fog.color.copy(tmpFog)
    game.atmosphere.fogHex = `#${tmpFog.getHexString()}`
    game.atmosphere.skyTopHex = `#${tmpSkyTop.getHexString()}`
    game.atmosphere.starOpacity = Math.round(Math.max(0, Math.min(0.92, ((heightM - 330) / 110) * 0.92)) * 1000) / 1000
    game.atmosphere.zone = heightM < 125 ? 'z1' : heightM < 250 ? 'z2' : heightM < 375 ? 'z3' : 'z4'
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#a4c8f5', '#cfa37f', 0.72]} />
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        intensity={1.75}
        position={SUN}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={SUN_DISTANCE * 2}
      />
    </>
  )
}

/** Seamless Ghibli vertical gradient sky dome matched at the horizon to FogExp2 (zero horizon seam). */
function GradientSkyDome() {
  const { dome, uniforms } = useMemo(() => {
    const uniforms = {
      uTop: { value: new Color('#6eb1eb') },
      uHorizon: { value: new Color(FOG_COLOR) },
      uSunDir: { value: new Vector3(...SUN).normalize() },
      uSunCol: { value: new Color('#fff3d4') },
    }
    const mat = new ShaderMaterial({
      uniforms,
      side: BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunCol;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
          float sunDot = max(0.0, dot(normalize(vDir), uSunDir));
          col += uSunCol * pow(sunDot, 28.0) * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
    const dome = new Mesh(new SphereGeometry(CAMERA_FAR * 0.85, 32, 16), mat)
    dome.renderOrder = -1
    dome.frustumCulled = false
    return { dome, uniforms }
  }, [])
  useFrame(({ camera, scene }) => {
    dome.position.copy(camera.position)
    const fog = scene.fog as FogExp2 | null
    if (fog != null) uniforms.uHorizon.value.copy(fog.color)
    uniforms.uTop.value.copy(tmpSkyTop)
    uniforms.uSunCol.value.copy(tmpSun)
  })
  return <primitive object={dome} />
}

function HorizonBowl() {
  const { bowl, mat } = useMemo(() => {
    const mat = new MeshBasicMaterial({ color: FOG_COLOR, side: BackSide, fog: false, depthWrite: false })
    const bowl = new Mesh(
      new SphereGeometry(CAMERA_FAR * 0.8, 48, 12, 0, Math.PI * 2, Math.PI / 2 + 0.004, Math.PI / 2 - 0.004),
      mat,
    )
    bowl.renderOrder = 1
    bowl.frustumCulled = false
    return { bowl, mat }
  }, [])
  useFrame(({ camera, scene }) => {
    bowl.position.copy(camera.position)
    const fog = scene.fog as FogExp2 | null
    if (fog != null) mat.color.copy(fog.color)
  })
  return <primitive object={bowl} />
}

function Lights() {
  return (
    <>
      <Suspense fallback={null}>
        <Environment files={HDRI_URL} background={false} environmentIntensity={0.5} />
      </Suspense>
      <ambientLight intensity={0.5} />
      <SunLight />
    </>
  )
}

export default function App() {
  return (
    <div className="app">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ fov: CAMERA.defaultFov, near: 0.1, far: CAMERA_FAR, position: [0, 3, 6] }}
        style={{ position: 'absolute', inset: '0', touchAction: 'none' }}
        onCreated={({ gl, setDpr }) => {
          game.attachCanvas(gl.domElement)
          attachRenderer(gl)
          installInputBindings(gl.domElement)
          installPlayGuards(gl.domElement)
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault()
            game.dispatch({ type: 'contextLost' })
          })
          gl.domElement.addEventListener('webglcontextrestored', () => {
            game.dispatch({ type: 'contextRestored' })
          })
          game.setDpr = setDpr
          game.applySettings(game.settings)
        }}
      >
        <BvhPhysicsWorld>
          <Bindings />
          <GradientSkyDome />
          <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />
          <HorizonBowl />
          <AtmosphereParticles />
          <Lights />
          <Suspense fallback={null}>
            <Level level={game.level} />
          </Suspense>
          <Player />
          <PlayerVfx />
          <GameLoop />
          <CameraDriver />
          <HudAndShadow />
        </BvhPhysicsWorld>
      </Canvas>
      <Overlay />
    </div>
  )
}
