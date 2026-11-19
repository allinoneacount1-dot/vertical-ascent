// Altitude Zone Visibility Culling (Fase 2 — Engine Scaling for 500 m -> 1000 m):
// Toggles visual Group.visible based on vertical distance from the player WITHOUT ever touching BvhPhysicsBody
// colliders or major TEST-37 landmarks/beacons. Cuts spawn draw calls dramatically while keeping 60 FPS locked.
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { game } from '../game/game.ts'

export const DEFAULT_CULL_MARGIN_M = 135

type Props = {
  id: string
  minY: number
  maxY: number
  marginM?: number
  children: ReactNode
}

export function AltitudeCullGroup({ id, minY, maxY, marginM = DEFAULT_CULL_MARGIN_M, children }: Props) {
  const ref = useRef<Group>(null)
  const lastVis = useRef<boolean | null>(null)

  useEffect(() => {
    game.culling.registry.set(id, true)
    return () => {
      game.culling.registry.delete(id)
    }
  }, [id])

  useFrame(() => {
    const g = ref.current
    if (g == null) return
    const py = game.port?.position.y ?? game.run.heightM
    const visible = py >= minY - marginM && py <= maxY + marginM
    if (visible !== lastVis.current) {
      lastVis.current = visible
      g.visible = visible
      game.culling.registry.set(id, visible)
    }
  })

  return (
    <group ref={ref} name={`cull:${id}`}>
      {children}
    </group>
  )
}
