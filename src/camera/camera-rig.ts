// Third-person camera (DIRECTIVE D-014, ref/04 §Kamera). The only writer of camera.position, camera.rotation,
// zoomDistance and the camera FOV (ref/02 Pemilik besaran). React-free; CameraRig.tsx calls update() at priority -1.
import { BvhPhysicsWorld, CharacterCameraBehavior, ZoomAction } from '@pmndrs/viverse'
import type { CharacterCameraBehaviorOptions } from '@pmndrs/viverse'
import { MathUtils, Ray, Vector3 } from 'three'
import type { Object3D, PerspectiveCamera } from 'three'

const DEG = Math.PI / 180

export const CAMERA = Object.freeze({
  minPitch: -75 * DEG,
  maxPitch: 50 * DEG,
  /** Spawn / Restart / recentre pitch. */
  defaultPitch: -20 * DEG,
  minZoom: 2.5,
  maxZoom: 6,
  defaultZoom: 4,
  /** camRaycast: whisker offset (m), ease-out time constant (s), minimum returned distance. */
  whisker: 0.25,
  easeOutTau: 0.15,
  minReturn: 0.55,
  /** Base pivot offset above the feet (library default) and the sideways shift below -50° pitch. */
  pivotHeight: 1.3,
  steepPitch: -50 * DEG,
  steepSideShift: 0.6,
  /** Recentre ease (s). */
  recentreS: 0.2,
  defaultFov: 75,
  maxFov: 110,
})

const pivotOffset = new Vector3()
const right = new Vector3()
const up = new Vector3()
const whiskerRay = new Ray()
const WHISKERS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export class CameraRig {
  readonly behavior = new CharacterCameraBehavior()
  /** Simplified blocker hulls only (no railings, cables, thin pipes). */
  readonly world: BvhPhysicsWorld
  /** Player-chosen distance (wheel), clamped to [minZoom, maxZoom]. */
  userZoom: number = CAMERA.defaultZoom
  /** +1 m while bigFall (D-014, G4). */
  bigFallExtra = 0
  fov: number = CAMERA.defaultFov
  private readonly zoomAbort = new AbortController()
  private readonly zoomReader = ZoomAction.createReader(this.zoomAbort.signal)
  private smoothed: number | null = null
  private frameDt = 0
  private side = 0
  private recentre: { from: number; to: number; fromPitch: number; t: number } | null = null
  private readonly options: CharacterCameraBehaviorOptions

  /** Last measured shortest hit distance (m) or null; for tests and __game. */
  lastHit: number | null = null

  constructor(world: BvhPhysicsWorld) {
    this.world = world
    this.options = {
      rotation: { minPitch: CAMERA.minPitch, maxPitch: CAMERA.maxPitch },
      // speed 0 = wheel never changes zoomDistance inside the library; the game owns zoom (one writer).
      zoom: { speed: 0, minDistance: 0, maxDistance: 100 },
      collision: { offset: 0.2 },
      characterBaseOffset: pivotOffset.set(0, CAMERA.pivotHeight, 0),
    }
  }

  get yaw(): number {
    return this.behavior.rotationYaw
  }

  get pitch(): number {
    return this.behavior.rotationPitch
  }

  /** Actual camera distance after collision (library internal, read for tests and __game). */
  get distance(): number {
    return (this.behavior as unknown as { collisionFreeZoomDistance: number }).collisionFreeZoomDistance
  }

  /** Spawn and Restart: explicit yaw/pitch (the library's first-update branch never runs). */
  setView(yaw: number, pitch: number = CAMERA.defaultPitch): void {
    this.behavior.rotationYaw = yaw
    this.behavior.rotationPitch = pitch
    this.recentre = null
    this.smoothed = null
  }

  /** Platform yaw carry (ref/04 §Carry 4). */
  addYaw(dYaw: number): void {
    this.behavior.rotationYaw += dYaw
  }

  /** Recentre behind the character, pitch -20°, eased ~0.2 s (instant with reduced motion). */
  startRecentre(facingYaw: number, reducedMotion: boolean): void {
    const from = this.behavior.rotationYaw
    let to = facingYaw
    to = from + Math.atan2(Math.sin(to - from), Math.cos(to - from))
    if (reducedMotion) {
      this.setView(to)
      return
    }
    this.recentre = { from, to, fromPitch: this.behavior.rotationPitch, t: 0 }
  }

  /** Drains zoom events while the game is paused so nothing piles up (library reader pitfall). */
  drainInput(): void {
    this.zoomReader.update()
  }

  /** Priority -1. target = the physics root (feet). */
  update(camera: PerspectiveCamera, target: Object3D, dt: number): void {
    this.frameDt = dt
    // zoom: the game reads ZoomAction itself (D-014); wheel down (+) zooms out
    this.zoomReader.update()
    const dz = this.zoomReader.get()
    if (dz !== 0) this.userZoom = MathUtils.clamp(this.userZoom * (1 + dz), CAMERA.minZoom, CAMERA.maxZoom)
    this.behavior.zoomDistance = MathUtils.clamp(this.userZoom + this.bigFallExtra, CAMERA.minZoom, CAMERA.maxZoom)

    if (this.recentre != null) {
      const r = this.recentre
      r.t = Math.min(1, r.t + dt / CAMERA.recentreS)
      const e = 1 - (1 - r.t) * (1 - r.t)
      this.behavior.rotationYaw = r.from + (r.to - r.from) * e
      this.behavior.rotationPitch = r.fromPitch + (CAMERA.defaultPitch - r.fromPitch) * e
      if (r.t >= 1) this.recentre = null
    }

    // below -50° pitch the pivot shifts 0.6 m sideways (eased so the view does not jump)
    const sideTarget = this.behavior.rotationPitch < CAMERA.steepPitch ? CAMERA.steepSideShift : 0
    this.side += (sideTarget - this.side) * (1 - Math.exp(-dt / 0.15))
    pivotOffset.set(this.side, CAMERA.pivotHeight, 0)

    this.behavior.update(camera, target, dt, this.camRaycast, this.options)

    const fov = Math.min(this.fov, CAMERA.maxFov)
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }

  /**
   * D-014: centre ray + 4 whiskers (±0.25 m) against the camera world, shortest hit; snap in, ease out
   * (τ = 0.15 s); returns max(s, 0.55) so the distance after the library's 0.2 offset stays ≥ 0.35.
   * Always returns a number so that easing also applies when nothing is hit.
   */
  readonly camRaycast = (ray: Ray, far: number): number => {
    // perpendicular axes of the ray (ray points from the pivot toward the camera)
    right.set(0, 1, 0).cross(ray.direction)
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
    right.normalize()
    up.copy(ray.direction).cross(right).normalize()
    let shortest = Number.POSITIVE_INFINITY
    for (const [rx, uy] of WHISKERS) {
      whiskerRay.origin.copy(ray.origin).addScaledVector(right, rx * CAMERA.whisker).addScaledVector(up, uy * CAMERA.whisker)
      whiskerRay.direction.copy(ray.direction)
      const hit = this.world.raycast(whiskerRay, far + 0.2)
      if (hit != null && hit.distance < shortest) shortest = hit.distance
    }
    this.lastHit = Number.isFinite(shortest) ? shortest : null
    // no hit: aim for the full distance (far + offset, so the library's "- 0.2" lands on far)
    const target = Number.isFinite(shortest) ? Math.min(shortest, far + 0.2) : far + 0.2
    if (this.smoothed == null || target < this.smoothed) {
      this.smoothed = target
    } else {
      this.smoothed += (target - this.smoothed) * (1 - Math.exp(-this.frameDt / CAMERA.easeOutTau))
    }
    return Math.max(this.smoothed, CAMERA.minReturn)
  }

  dispose(): void {
    this.zoomAbort.abort()
    this.behavior.dispose()
  }
}
