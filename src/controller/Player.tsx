// Player root: the physics-driven group (feet pivot) and an inner visual wrapper that carries the facing yaw
// (never the physics root, ref/04 §Animasi). Receives no props that change during play (D-005).
import { Suspense, useLayoutEffect, useRef } from 'react'
import type { Group } from 'three'
import { useBvhPhysicsWorld } from '@react-three/viverse'
import { CharacterVisual } from '../character/CharacterVisual.tsx'
import { game } from '../game/game.ts'

export function Player() {
  const world = useBvhPhysicsWorld()
  const root = useRef<Group>(null)
  const visual = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!root.current || !visual.current) return
    game.attachPlayer(world, root.current, visual.current)
    return () => game.detachPlayer()
  }, [world])
  return (
    <group ref={root} name="player-root">
      <group ref={visual} name="player-visual">
        <Suspense fallback={null}>
          <CharacterVisual />
        </Suspense>
      </group>
    </group>
  )
}
