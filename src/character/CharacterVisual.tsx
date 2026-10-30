// Character model + animation graph of the hybrid controller (DIRECTIVE D-001). Reads game-owned flags only;
// never writes position, velocity, the controller's input velocity or the camera (ref/02 Pemilik besaran).
import { Suspense, useEffect } from 'react'
import { LoopOnce, LoopRepeat } from 'three'
import type { RootState } from '@react-three/fiber'
import { Graph, GrapthState, RunTimeline, Switch, SwitchCase, forever } from '@react-three/timeline'
import type { TimelineClock } from '@react-three/timeline'
import { CharacterAnimationAction, CharacterModelProvider, useCharacterModelLoader } from '@react-three/viverse'
import { ACTIVE_MODEL_OPTIONS, CLIPS, FADE_S, JUMP_UP_MIN_S, LAND_HOLD_S, RISING_VY } from './rig.ts'
import { addClimbingPack } from './protagonist-style.ts'
import { game } from '../game/game.ts'
import { setClipReporter } from '../game/debug.ts'

type Flags = { moving: boolean; sprint: boolean; grounded: boolean; vy: number }

const flags: Flags = { moving: false, sprint: false, grounded: true, vy: 0 }

/** Stable getter: graph closures are captured at state start, so they must read live values (pitfall 21). */
function readFlags(): Flags {
  const c = game.controller
  const p = game.port
  if (c == null || p == null) {
    flags.moving = false
    flags.sprint = false
    flags.grounded = true
    flags.vy = 0
    return flags
  }
  flags.moving = c.moveSpeed > 0
  flags.sprint = c.sprintActive
  // grounded with the coyote window as hysteresis, so a one-slice contact flicker does not start a fall clip
  flags.grounded = p.secondsSinceGrounded < p.settings.coyoteTime
  flags.vy = p.velocity.y
  return flags
}

const isRising = () => {
  const f = readFlags()
  return !f.grounded && f.vy > RISING_VY
}
const isFalling = () => {
  const f = readFlags()
  return !f.grounded && f.vy <= RISING_VY
}

let activeClip: string | null = null
const clip = (name: string) => () => {
  activeClip = name
}

/** Air jumps already shown; a new one (double jump, D-038) replays jumpUp from jumpLoop. */
let seenAirJumps = 0
const airJumpCount = () => game.controller?.airJumpCount ?? 0
const startJumpUp = () => {
  activeClip = 'jumpUp'
  seenAirJumps = airJumpCount()
}
const newAirJump = () => airJumpCount() !== seenAirJumps
setClipReporter(() => activeClip)

export function CharacterVisual() {
  const model = useCharacterModelLoader(ACTIVE_MODEL_OPTIONS)
  useEffect(() => {
    // D-017 silhouette change for the protagonist (a VRM, the only model with a humanoid); the mannequin stays as it is
    const humanoid = (model as { humanoid?: Parameters<typeof addClimbingPack>[1] }).humanoid
    if (humanoid != null) addClimbingPack(model.scene, humanoid)
    game.setModel(model)
    return () => game.setModel(null)
  }, [model])
  return (
    <CharacterModelProvider model={model}>
      <RunTimeline>
        <Graph enterState="move">
          <GrapthState name="move" transitionTo={{ jumpUp: { whenUpdate: isRising }, jumpLoop: { whenUpdate: isFalling } }}>
            <Switch>
              <SwitchCase index={0} condition={() => !readFlags().moving}>
                <Suspense fallback={null}>
                  <CharacterAnimationAction {...CLIPS.idle} loop={LoopRepeat} until={forever} fadeDuration={FADE_S} init={clip('idle')} />
                </Suspense>
              </SwitchCase>
              <SwitchCase index={1} condition={() => readFlags().sprint}>
                <Suspense fallback={null}>
                  <CharacterAnimationAction {...CLIPS.run} loop={LoopRepeat} until={forever} fadeDuration={FADE_S} init={clip('run')} />
                </Suspense>
              </SwitchCase>
              <SwitchCase index={2}>
                <Suspense fallback={null}>
                  <CharacterAnimationAction {...CLIPS.walk} loop={LoopRepeat} until={forever} fadeDuration={FADE_S} init={clip('walk')} />
                </Suspense>
              </SwitchCase>
            </Switch>
          </GrapthState>
          <GrapthState
            name="jumpUp"
            transitionTo={{
              jumpDown: {
                whenUpdate: (_s: RootState, _c: TimelineClock, actionTime: number) => actionTime > JUMP_UP_MIN_S && readFlags().grounded,
              },
              finally: 'jumpLoop',
            }}
          >
            <Suspense fallback={null}>
              <CharacterAnimationAction {...CLIPS.jumpUp} loop={LoopOnce} fadeDuration={FADE_S} init={startJumpUp} />
            </Suspense>
          </GrapthState>
          <GrapthState
            name="jumpLoop"
            transitionTo={{ jumpDown: { whenUpdate: () => readFlags().grounded }, jumpUp: { whenUpdate: () => !readFlags().grounded && newAirJump() } }}
          >
            <Suspense fallback={null}>
              <CharacterAnimationAction {...CLIPS.jumpLoop} loop={LoopRepeat} until={forever} fadeDuration={FADE_S} init={clip('jumpLoop')} />
            </Suspense>
          </GrapthState>
          <GrapthState name="jumpDown" transitionTo={{ jumpUp: { whenUpdate: isRising }, finally: 'move' }}>
            <Suspense fallback={null}>
              <CharacterAnimationAction
                {...CLIPS.jumpDown}
                loop={LoopOnce}
                fadeDuration={FADE_S}
                init={clip('jumpDown')}
                // ≤150 ms landing window, measured in timeline time (not setTimeout) — D-023
                update={(_s: RootState, _c: TimelineClock, actionTime: number) => actionTime < LAND_HOLD_S}
              />
            </Suspense>
          </GrapthState>
        </Graph>
      </RunTimeline>
      <primitive object={model.scene} />
    </CharacterModelProvider>
  )
}
