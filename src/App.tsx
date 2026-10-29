// App shell: hybrid controller in the level chosen by src/level/levels.ts (G2 slice; G1 blockout via ?level= in DEV). <BvhPhysicsWorld> without <Viverse> (D-003).
// The Canvas never unmounts between menu and game (D-005).
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import { BvhPhysicsWorld, useKeyboardLocomotionActionBindings, usePointerLockRotateZoomActionBindings } from '@react-three/viverse'
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

/** Bindings mounted once at the Canvas root (D-004). Keyboard listens on the canvas, so it must have focus. */
function Bindings() {
  useKeyboardLocomotionActionBindings({ requiresPointerLock: true })
  usePointerLockRotateZoomActionBindings({ lockOnClick: false })
  return null
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight
        intensity={1.6}
        position={[-12, 20, 10]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
    </>
  )
}

export default function App() {
  return (
    <div className="app">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ fov: CAMERA.defaultFov, near: 0.1, far: 500, position: [0, 3, 6] }}
        style={{ position: 'absolute', inset: '0', touchAction: 'none' }}
        onCreated={({ gl }) => {
          game.attachCanvas(gl.domElement)
          attachRenderer(gl)
          installPlayGuards(gl.domElement)
        }}
      >
        <BvhPhysicsWorld>
          <Bindings />
          <Sky sunPosition={[-12, 20, 10]} />
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
