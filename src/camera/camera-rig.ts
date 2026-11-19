// Third-person camera (DIRECTIVE D-014, ref/04 §Kamera) + optional First-Person Challenge Modifier (Tahap 3).
// The only writer of camera.position, camera.rotation, zoomDistance and the camera FOV (ref/02 Pemilik besaran).
import { BvhPhysicsWorld, CharacterCameraBehavior, ZoomAction } from '@pmndrs/viverse'
import type { CharacterCameraBehaviorOptions } from '@pmndrs/viverse'
import { Euler, MathUtils, Ray, Vector3 } from 'three'
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
  /** Sprint FOV kick (D-014). */
  sprintKick: 10,
})

const pivotOffset = new Vector3()
const sideRay = new Ray()
const SIDE_MARGIN = 0.35
const right = new Vector3()
const up = new Vector3()
const whiskerRay = new Ray()
const fpPos = new Vector3()
const fpEuler = new Euler(0, 0, 0, 'YXZ')
const WHISKERS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export class CameraRig {
  readonly behavior = new CharacterCameraBehavior()
  readonly world: BvhPhysicsWorld
  userZoom: number = CAMERA.defaultZoom
  bigFallExtra = 0
  fov: number = CAMERA.defaultFov
  sensitivity = 1
  invertY = false
  sprintKick = true
  sprinting = false
  reducedMotion = false
  /** First-person challenge modifier (Tahap 3). */
  firstPerson = false
  private kick = 0
  private readonly zoomAbort = new AbortController()
  private readonly zoomReader = ZoomAction.createReader(this.zoomAbort.signal)
  private smoothed: number | null = null
  private frameDt = 0
  private side = 0
  private recentre: { from: number; to: number; fromPitch: number; t: number } | null = null
  private vista: {
    origYaw: number
    origPitch: number
    targetYaw: number
    targetPitch: number
    elapsed: number
    inS: number
    holdS: number
    outS: number
  } | null = null
  private readonly options: CharacterCameraBehaviorOptions

  lastHit: number | null = null
  camera: PerspectiveCamera | null = null

  constructor(world: BvhPhysicsWorld) {
    this.world = world
    this.options = {
      rotation: { minPitch: CAMERA.minPitch, maxPitch: CAMERA.maxPitch },
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

  get distance(): number {
    return this.firstPerson ? 0 : (this.behavior as unknown as { collisionFreeZoomDistance: number }).collisionFreeZoomDistance
  }

  setView(yaw: number, pitch: number = CAMERA.defaultPitch): void {
    this.behavior.rotationYaw = yaw
    this.behavior.rotationPitch = pitch
    this.recentre = null
    this.vista = null
    this.smoothed = null
  }

  addYaw(dYaw: number): void {
    this.behavior.rotationYaw += dYaw
  }

  startRecentre(facingYaw: number, reducedMotion: boolean): void {
    this.vista = null
    const from = this.behavior.rotationYaw
    let to = facingYaw
    to = from + Math.atan2(Math.sin(to - from), Math.cos(to - from))
    if (reducedMotion) {
      this.setView(to)
      return
    }
    this.recentre = { from, to, fromPitch: this.behavior.rotationPitch, t: 0 }
  }

  /** Brief optional Vista Look (V key): smoothly pans toward a landmark/summit then returns cleanly. */
  startVistaLook(targetYaw: number, targetPitch: number, reducedMotion: boolean): void {
    const origYaw = this.behavior.rotationYaw
    const origPitch = this.behavior.rotationPitch
    const shortestTargetYaw = origYaw + Math.atan2(Math.sin(targetYaw - origYaw), Math.cos(targetYaw - origYaw))
    const clampedPitch = MathUtils.clamp(targetPitch, CAMERA.minPitch, CAMERA.maxPitch)
    this.recentre = null
    this.vista = {
      origYaw,
      origPitch,
      targetYaw: shortestTargetYaw,
      targetPitch: clampedPitch,
      elapsed: 0,
      inS: reducedMotion ? 0.05 : 0.45,
      holdS: 1.35,
      outS: reducedMotion ? 0.05 : 0.45,
    }
  }

  cancelVistaLook(): void {
    this.vista = null
  }

  get vistaActive(): boolean {
    return this.vista != null
  }

  drainInput(): void {
    this.zoomReader.update()
  }

  private suppressUntil = 0

  suppressRotation(ms: number): void {
    this.suppressUntil = performance.now() + ms
  }

  private dropRotationInput(): void {
    const b = this.behavior as unknown as { yawReader: { update(): void }; pitchReader: { update(): void } }
    b.yawReader.update()
    b.pitchReader.update()
  }

  private applyRotationInput(): void {
    const b = this.behavior as unknown as { yawReader: { update(): void; get(): number }; pitchReader: { update(): void; get(): number } }
    b.yawReader.update()
    b.pitchReader.update()
    const dYaw = b.yawReader.get()
    const dPitch = b.pitchReader.get()
    if (dYaw === 0 && dPitch === 0) return
    this.vista = null
    this.behavior.rotationYaw += dYaw * this.sensitivity
    const pitch = this.behavior.rotationPitch + dPitch * this.sensitivity * (this.invertY ? -1 : 1)
    this.behavior.rotationPitch = MathUtils.clamp(pitch, CAMERA.minPitch, CAMERA.maxPitch)
  }

  update(camera: PerspectiveCamera, target: Object3D, dt: number): void {
    this.camera = camera
    this.frameDt = dt
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
    } else if (this.vista != null) {
      const v = this.vista
      v.elapsed += dt
      const total = v.inS + v.holdS + v.outS
      if (v.elapsed < v.inS) {
        const u = Math.min(1, v.elapsed / Math.max(0.01, v.inS))
        const e = u * u * (3 - 2 * u)
        this.behavior.rotationYaw = v.origYaw + (v.targetYaw - v.origYaw) * e
        this.behavior.rotationPitch = v.origPitch + (v.targetPitch - v.origPitch) * e
      } else if (v.elapsed < v.inS + v.holdS) {
        this.behavior.rotationYaw = v.targetYaw
        this.behavior.rotationPitch = v.targetPitch
      } else if (v.elapsed < total) {
        const u = Math.min(1, (v.elapsed - v.inS - v.holdS) / Math.max(0.01, v.outS))
        const e = u * u * (3 - 2 * u)
        this.behavior.rotationYaw = v.targetYaw + (v.origYaw - v.targetYaw) * e
        this.behavior.rotationPitch = v.targetPitch + (v.origPitch - v.targetPitch) * e
      } else {
        this.behavior.rotationYaw = v.origYaw
        this.behavior.rotationPitch = v.origPitch
        this.vista = null
      }
    }

    if (performance.now() < this.suppressUntil) this.dropRotationInput()
    else this.applyRotationInput()

    if (this.firstPerson) {
      target.getWorldPosition(fpPos)
      camera.position.set(fpPos.x, fpPos.y + 1.55, fpPos.z)
      fpEuler.set(this.behavior.rotationPitch, this.behavior.rotationYaw, 0, 'YXZ')
      camera.quaternion.setFromEuler(fpEuler)
    } else {
      const sideWanted = this.behavior.rotationPitch < CAMERA.steepPitch ? CAMERA.steepSideShift : 0
      const sideAllowed = Math.max(0, Math.min(sideWanted, this.sideClearance(target) - SIDE_MARGIN))
      if (sideAllowed < this.side) this.side = sideAllowed
      else this.side += (sideAllowed - this.side) * (1 - Math.exp(-dt / 0.15))
      pivotOffset.set(this.side, CAMERA.pivotHeight, 0)
      this.behavior.update(camera, target, dt, this.camRaycast, this.options)
    }

    const kickTarget = this.sprintKick && this.sprinting && !this.reducedMotion ? CAMERA.sprintKick : 0
    this.kick += (kickTarget - this.kick) * (1 - Math.exp(-10 * dt))
    const fov = Math.min(this.fov + this.kick, CAMERA.maxFov)
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }

  readonly camRaycast = (ray: Ray, far: number): number => {
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
    const target = Number.isFinite(shortest) ? Math.min(shortest, far + 0.2) : far + 0.2
    if (this.smoothed == null || target < this.smoothed) {
      this.smoothed = target
    } else {
      this.smoothed += (target - this.smoothed) * (1 - Math.exp(-this.frameDt / CAMERA.easeOutTau))
    }
    return Math.max(this.smoothed, CAMERA.minReturn)
  }

  private sideClearance(target: Object3D): number {
    target.getWorldPosition(sideRay.origin)
    sideRay.origin.y += CAMERA.pivotHeight
    const reach = CAMERA.steepSideShift + SIDE_MARGIN + 0.05
    let shortest = reach
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      sideRay.direction.set(Math.cos(a), 0, Math.sin(a))
      const hit = this.world.raycast(sideRay, reach)
      if (hit != null && hit.distance < shortest) shortest = hit.distance
    }
    return shortest
  }

  get sideShift(): number {
    return this.side
  }

  dispose(): void {
    this.zoomAbort.abort()
    this.behavior.dispose()
  }
}
