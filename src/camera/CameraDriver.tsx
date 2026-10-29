// Priority -1: the camera rig updates after the controller (ref/02 §Frame order). The only caller of rig.update.
import { useFrame } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { game } from '../game/game.ts'

export function CameraDriver() {
  useFrame((state, delta) => {
    const rig = game.cameraRig
    const target = game.playerRoot
    if (rig == null || target == null) return
    if (game.snapshot.state === 'PAUSED') rig.drainInput()
    rig.update(state.camera as PerspectiveCamera, target, Math.min(delta, 0.1))
  }, -1)
  return null
}
