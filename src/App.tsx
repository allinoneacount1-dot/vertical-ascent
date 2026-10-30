// App shell: hybrid controller in the level chosen by src/level/levels.ts (the 500 m world; slice and G1 blockout via
// ?level= in DEV). <BvhPhysicsWorld> without <Viverse> (D-003). The Canvas never unmounts between menu and game (D-005).
import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Object3D, Vector3 } from 'three'
import type { DirectionalLight } from 'three'
import { Environment, Sky } from '@react-three/drei'
import { BvhPhysicsWorld, usePointerLockRotateZoomActionBindings } from '@react-three/viverse'
import { installInputBindings } from './game/input-bindings.ts'
import { Level } from './level/Level.tsx'
import { Player } from './controller/Player.tsx'
import { GameLoop } from './controller/GameLoop.tsx'
import { CameraDriver } from './camera/CameraDriver.tsx'
import { HudAndShadow } from './ui/HudSampler.tsx'
import { Overlay } from './ui/Overlay.tsx'
import { game } from './game/game.ts'
import { installPlayGuards } from './game/enter-playing.ts'
import { attachRenderer } from './game/debug.ts'
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
/** Fog band (ref/03 §Isyarat ketinggian): the far ground plane (4000 m) reaches past 1.2 × FOG_FAR, so no world edge shows. */
const FOG_COLOR = '#cfd9e4'
const FOG_NEAR = 220
const FOG_FAR = 1500
const CAMERA_FAR = 2500

/** Shadow light that follows the player, so the ±40 m shadow box covers wherever the climb is (G4 §5 brought forward). */
function SunLight() {
  const light = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const offset = useMemo(() => new Vector3(...SUN).normalize().multiplyScalar(SUN_DISTANCE), [])
  useFrame(() => {
    const l = light.current
    const at = game.port?.position
    if (l == null || at == null) return
    target.position.copy(at)
    l.position.copy(at).add(offset)
    target.updateMatrixWorld()
  })
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        intensity={1.6}
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
          game.setDpr = setDpr
          game.applySettings(game.settings)
        }}
      >
        <BvhPhysicsWorld>
          <Bindings />
          <Sky sunPosition={SUN} />
          <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />
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
