// Frame order (ref/02 §Frame order): -3 frame clock + Wind Focus timeScale + platforms, -2 controller + challenges.
import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { JumpAction, MoveBackwardAction, MoveForwardAction, MoveLeftAction, MoveRightAction, RunAction } from '@react-three/viverse'
import { game } from '../game/game.ts'
import { useUi } from '../game/store.ts'
import { setFocusAudio } from '../audio/engine.ts'
import type { ControlInput } from './character-controller.ts'

const input: ControlInput = { forward: 0, backward: 0, left: 0, right: 0, run: false }

const used = new Set<string>()
function markUsed(action: string): void {
  if (used.has(action)) return
  used.add(action)
  useUi.setState({ usedActions: [...used] })
}
function noteUsed(i: ControlInput): void {
  if (i.forward + i.backward + i.left + i.right > 0) markUsed('move')
  if (i.run) markUsed('run')
}

export function GameLoop() {
  useEffect(() => {
    const abort = new AbortController()
    JumpAction.subscribe(
      () => {
        if (game.snapshot.state !== 'PLAYING' || document.pointerLockElement !== game.canvas) return
        game.controller?.pressJump()
        game.run.noteMovementInput()
        markUsed('jump')
      },
      { signal: abort.signal },
    )
    return () => abort.abort()
  }, [])

  // -3: clamp/discard the frame delta, apply Wind Focus timeScale (0.45x), then platforms + world clock
  useFrame((_, delta) => {
    game.frame++
    const playing = game.snapshot.state === 'PLAYING'
    const rawDt = game.frameClock.begin(delta, playing)
    const timeScale = game.challenges.updateFocus(
      rawDt,
      playing,
      game.port?.isGroundedRaw ?? false,
      game.modifiers.noWindFocus,
    )
    setFocusAudio(game.challenges.focusActive)
    if (game.model && playing) game.model.mixer.timeScale = timeScale
    const simDt = rawDt * timeScale
    game.simDt = simDt
    game.motion.beginFrame(simDt)
  }, -3)

  // -2: input → sprintActive → velocity → per slice: carry → jump → step → challenges → kill plane
  useFrame(() => {
    const controller = game.controller
    if (controller == null) return
    const dt = game.simDt
    if (dt > 0) {
      input.forward = MoveForwardAction.get()
      input.backward = MoveBackwardAction.get()
      input.left = MoveLeftAction.get()
      input.right = MoveRightAction.get()
      input.run = RunAction.get()
      if (input.forward + input.backward + input.left + input.right > 0) game.run.noteMovementInput()
      controller.stepFrame(dt, input, game.cameraRig?.yaw ?? game.spawnYaw, game.sprintMode)
      game.stepChallenges(dt)
      game.checkKillPlane()
      noteUsed(input)
    }
    if (game.cameraRig) game.cameraRig.sprinting = controller.sprintActive && controller.moveSpeed > 0
    if (game.visual) controller.applyFacing(game.visual)
  }, -2)

  return null
}
