// App shell: hybrid controller in the level chosen by src/level/levels.ts (the 500 m world; slice and G1 blockout via
// ?level= in DEV). <BvhPhysicsWorld> without <Viverse> (D-003). The Canvas never unmounts between menu and game (D-005).
import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { BackSide, Color, Mesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3 } from 'three'
import type { DirectionalLight, Fog, HemisphereLight } from 'three'
import { Environment, Sky } from '@react-three/drei'
import { BvhPhysicsWorld, usePointerLockRotateZoomActionBindings } from '@react-three/viverse'
import { installInputBindings } from './game/input-bindings.ts'
import { Level } from './level/Level.tsx'
import { AtmosphereParticles } from './level/AtmosphereParticles.tsx'
import { Player } from './controller/Player.tsx'
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

/**
 * Mouse bindings mounted once at the Canvas root (D-004). Keyboard bindings are created imperatively once at
 * Canvas creation (src/game/input-bindings.ts) so rebinding never remounts them (D-021).
 */
function Bindings() {
  usePointerLockRotateZoomActionBindings({ lockOnClick: false })
  return null
}

/** Poly Haven HDRI as image-based lighting only; the visible sky stays drei <Sky> (ref/05 §Sumber HDRI). */
const HDRI_URL = assetUrl('assets/hdri/industrial_sunset_puresky_1k.hdr')

/** Sun direction shared by the sky and the shadow light. */
const SUN: [number, number, number] = [-12, 20, 10]
const SUN_DISTANCE = 80
/** Fog band (ref/03 §Isyarat ketinggian): smoothly shifts with altitude from Ghibli sunset to celestial indigo. */
const FOG_COLOR = '#e4cab6'
const FOG_NEAR = 220
const FOG_FAR = 1500
const CAMERA_FAR = 2500

const FOG_STOPS = [new Color('#e4cab6'), new Color('#c8dff0'), new Color('#b5d6ee'), new Color('#7fa6da')]
const SUN_STOPS = [new Color('#ffebd0'), new Color('#fff7e8'), new Color('#ffffff'), new Color('#fff3d1')]
const HEMI_SKY_STOPS = [new Color('#a4c8f5'), new Color('#8dc8ff'), new Color('#82bef7'), new Color('#6d97e2')]
const HEMI_GND_STOPS = [new Color('#cfa37f'), new Color('#9ab0bf'), new Color('#c2d9c6'), new Color('#d8cba8')]
const tmpFog = new Color()
const tmpSun = new Color()
const tmpHemiSky = new Color()
const tmpHemiGnd = new Color()

function lerpStops(stops: Color[], t: number, out: Color): Color {
  const clamped = Math.max(0, Math.min(1, t))
  const scaled = clamped * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(scaled))
  return out.copy(stops[i]).lerp(stops[i + 1], scaled - i)
}

/** Shadow light + altitude-driven Ghibli lighting & audio update. */
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
    const hRatio = game.level.summitM > 0 ? Math.max(0, Math.min(1, game.run.heightM / game.level.summitM)) : 0
    const moving = p != null && p.isGroundedRaw && Math.hypot(p.velocity.x, p.velocity.z) > 0.5
    updateAudioFrame(Math.min(dt, 0.1), playing, hRatio, c?.bigFall ?? false, moving, c?.sprintActive ?? false)

    // Altitude-driven Ghibli atmosphere (in-place color updates, zero allocations)
    if (l != null) l.color.copy(lerpStops(SUN_STOPS, hRatio, tmpSun))
    if (hemi.current != null) {
      hemi.current.color.copy(lerpStops(HEMI_SKY_STOPS, hRatio, tmpHemiSky))
      hemi.current.groundColor.copy(lerpStops(HEMI_GND_STOPS, hRatio, tmpHemiGnd))
    }
    const fog = scene.fog as Fog | null
    if (fog != null) fog.color.copy(lerpStops(FOG_STOPS, hRatio, tmpFog))
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

/**
 * Fog-coloured bowl below the horizon, centred on the camera: where no ground is drawn (past the far ground plane, seen
 * from the summit) the view shows haze instead of the sky dome's lower half, so the world has no visible edge (ref/03).
 * Drawn after the opaque scene without writing depth, it only fills pixels nothing else covered.
 */
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
    const fog = scene.fog as Fog | null
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
          <Sky sunPosition={SUN} />
          <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />
          <HorizonBowl />
          <AtmosphereParticles />
          <Lights />
          <Suspense fallback={null}>
            <Level level={game.level} />
          </Suspense>
          <Player />
          <GameLoop />
          <CameraDriver />
          <HudAndShadow />
        </BvhPhysicsWorld>
      </Canvas>
      <Overlay />
    </div>
  )
}
