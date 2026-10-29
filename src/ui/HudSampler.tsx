// Priority 0: run timer, height, and the HUD store on a fixed 10 Hz grid (D-005, D-008); blob shadow (D-014).
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Ray, Vector3 } from 'three'
import type { Mesh } from 'three'
import { game } from '../game/game.ts'
import { useUi } from '../game/store.ts'

/** HUD store writes happen once per 100 ms slot of the page clock: ≤10 Hz, and every slot gets one write. */
export class HudSampler {
  private lastSlot = -1

  sample(now: number): void {
    const ui = useUi.getState()
    const playing = ui.snapshot.state === 'PLAYING'
    game.run.tick(game.frameClock.dt, playing, ui.snapshot.mode === 'freeRoam')
    const port = game.port
    if (port) game.run.updateHeight(port.position.y, port.isGroundedRaw)
    const slot = Math.floor(now / 100)
    if (slot === this.lastSlot) return
    this.lastSlot = slot
    const sprintGlyph = game.sprintMode !== 'hold' && (game.controller?.sprintActive ?? false)
    useUi.setState({
      hud: { ...ui.hud, heightM: game.run.heightM, timerMs: game.run.timerMs, sprintGlyph, tick: ui.hud.tick + 1 },
    })
  }
}

const sampler = new HudSampler()
const down = new Vector3(0, -1, 0)
const ray = new Ray()
const BLOB_MAX = 60

export function HudAndShadow() {
  const blob = useRef<Mesh>(null)
  useFrame(() => {
    sampler.sample(performance.now())
    const mesh = blob.current
    const port = game.port
    const world = game.physicsWorld
    if (mesh == null) return
    if (port == null || world == null) {
      mesh.visible = false
      return
    }
    ray.origin.copy(port.position)
    ray.origin.y += 0.1
    ray.direction.copy(down)
    const hit = world.raycast(ray, BLOB_MAX)
    if (hit == null) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    mesh.position.set(ray.origin.x, ray.origin.y - hit.distance + 0.02, ray.origin.z)
    const fade = 1 - Math.min(1, hit.distance / BLOB_MAX)
    mesh.scale.setScalar(0.5 + 0.5 * fade)
  })
  return (
    <mesh ref={blob} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <circleGeometry args={[0.45, 24]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
    </mesh>
  )
}
