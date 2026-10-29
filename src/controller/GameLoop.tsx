// Frame order (ref/02 §Frame order): -3 frame clock + platforms, -2 controller. No positive priorities.
import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { JumpAction, MoveBackwardAction, MoveForwardAction, MoveLeftAction, MoveRightAction, RunAction } from '@react-three/viverse'
import { game } from '../game/game.ts'
import type { ControlInput } from './character-controller.ts'

const input: ControlInput = { forward: 0, backward: 0, left: 0, right: 0, run: false }

export function GameLoop() {
  // JumpAction is an EventAction: requiresPointerLock does not gate it, so gate here (D-004); stamp sim time (D-011)
  useEffect(() => {
    const abort = new AbortController()
    JumpAction.subscribe(
      () => {
        if (game.snapshot.state !== 'PLAYING' || document.pointerLockElement !== game.canvas) return
        game.controller?.pressJump()
        game.run.noteMovementInput()
      },
      { signal: abort.signal },
    )
    return () => abort.abort()
  }, [])

  // -3: clamp/discard the frame delta, then platforms + world clock (or defer to per-slice advance)
  useFrame((_, delta) => {
    game.frame++
    const playing = game.snapshot.state === 'PLAYING'
    const dt = game.frameClock.begin(delta, playing)
    game.motion.beginFrame(dt)
  }, -3)

  // -2: input → sprintActive → velocity → per slice: carry → jump → step (character-controller.ts)
  useFrame(() => {
    const controller = game.controller
    if (controller == null) return
    const dt = game.frameClock.dt
    if (dt > 0) {
      input.forward = MoveForwardAction.get()
      input.backward = MoveBackwardAction.get()
      input.left = MoveLeftAction.get()
      input.right = MoveRightAction.get()
      input.run = RunAction.get()
      if (input.forward + input.backward + input.left + input.right > 0) game.run.noteMovementInput()
      controller.stepFrame(dt, input, game.cameraRig?.yaw ?? game.spawnYaw, game.sprintMode)
      game.checkKillPlane()
    }
    if (game.visual) controller.applyFacing(game.visual)
  }, -2)

  return null
}
