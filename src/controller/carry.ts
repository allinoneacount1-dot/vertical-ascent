// Platform carry probe (DIRECTIVE D-012, ref/04 §Carry 3–6). Controller-owned: groundBody is controller state.
import { Box3, Matrix4, Ray, Vector3 } from 'three'
import type { KinematicPlatform, PlatformMotion } from '../level/motion.ts'

/** Ray start above the feet and ray length (ref/04 §Carry 3). */
export const PROBE_LIFT = 0.05
export const PROBE_LENGTH = 0.15
/** The 4 outer rays sit at 0.7 r on ±X/±Z. */
export const PROBE_RING = 0.7

const OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

const colliderPrev = new Matrix4()
const curInv = new Matrix4()
const toLocal = new Matrix4()
const origin = new Vector3()
const end = new Vector3()
const localOrigin = new Vector3()
const localEnd = new Vector3()
const localDir = new Vector3()
const hit = new Vector3()
const ray = new Ray()
const localBox = new Box3()

/**
 * Returns the platform under the feet in its PREVIOUS pose (the character has not moved with it yet), or null.
 * Rays: 5 × PROBE_LENGTH downward from feet + PROBE_LIFT, tested against each collider's local box.
 */
export function probeGroundPlatform(motion: PlatformMotion, feet: Vector3, capsuleRadius: number): KinematicPlatform | null {
  for (const p of motion.platforms.values()) {
    const geometry = p.collider.geometry
    if (geometry.boundingBox == null) geometry.computeBoundingBox()
    localBox.copy(geometry.boundingBox!)
    // collider world matrix in the prev pose = prev · cur⁻¹ · collider.matrixWorld(cur)
    curInv.copy(p.cur).invert()
    colliderPrev.copy(p.prev).multiply(curInv).multiply(p.collider.matrixWorld)
    toLocal.copy(colliderPrev).invert()
    for (const [ox, oz] of OFFSETS) {
      origin.set(feet.x + ox * PROBE_RING * capsuleRadius, feet.y + PROBE_LIFT, feet.z + oz * PROBE_RING * capsuleRadius)
      end.copy(origin)
      end.y -= PROBE_LENGTH
      localOrigin.copy(origin).applyMatrix4(toLocal)
      localEnd.copy(end).applyMatrix4(toLocal)
      if (localBox.containsPoint(localOrigin)) return p
      localDir.copy(localEnd).sub(localOrigin)
      const localLength = localDir.length()
      if (localLength === 0) continue
      ray.set(localOrigin, localDir.divideScalar(localLength))
      if (ray.intersectBox(localBox, hit) != null && hit.distanceTo(localOrigin) <= localLength) return p
    }
  }
  return null
}

const delta = new Matrix4()
const prevInv = new Matrix4()

/** Δ = cur · prev⁻¹ (ref/04 §Carry 4). */
export function carryDelta(p: KinematicPlatform, target: Matrix4 = delta): Matrix4 {
  prevInv.copy(p.prev).invert()
  return target.copy(p.cur).multiply(prevInv)
}
