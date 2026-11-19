// Derived from pmndrs/viverse packages/viverse/src/physics/index.ts @ b88c0e7 (npm 0.2.29). Copyright 2024 Bela Bohlender, MIT; licence text verbatim in licenses/pmndrs-viverse.LICENSE.txt (THIRD_PARTY_NOTICES.md). Modifications (c) 2026 Vertical Ascent project owner: TS rules (no parameter properties, import type); defaults updatesPerSecond 240, maxGroundSlope 1.0, coyoteTime 0.12; isGroundedRaw, canJump, velocity getter, jump(speed) sets vy, impulse with per-axis cap, resetVelocity, teleport, applyCarry, setGravity, nudge; forceWriteBack for carried steps and near kinematic bodies; throws when the model has no parent; marks shapecast/sensor triangles dirty (stale-plane fix, D-032); drops sub-nanosecond substep remainders and reports isGroundedRaw over the whole step (D-036); writes back the landing substep (D-037); CharacterPhysicsPort facade (DIRECTIVE D-002, ref/04 Checklist vendoring).
//
// The only module that writes character position and velocity (ref/02 Pemilik besaran).
import { Box3, Line3, Matrix4, Object3D, Vector3 } from 'three'
import type { BvhPhysicsWorld } from '@pmndrs/viverse'

export type CharacterPhysicsOptions = {
  /** Substeps per second; the library default is 60, the game uses 240 (D-011). */
  updatesPerSecond: number
  capsuleRadius: number
  capsuleHeight: number
  /** m/s² */
  gravity: number
  /** air resistance coefficient */
  linearDamping: number
  /** tan of the steepest walkable slope; 1.0 = 45° (D-013) */
  maxGroundSlope: number
  /** seconds after leaving ground during which a jump is still accepted (D-002) */
  coyoteTime: number
}

export const DEFAULT_PHYSICS_OPTIONS: Readonly<CharacterPhysicsOptions> = Object.freeze({
  updatesPerSecond: 240,
  capsuleRadius: 0.4,
  capsuleHeight: 1.7,
  gravity: -20,
  linearDamping: 0.1,
  maxGroundSlope: 1.0,
  coyoteTime: 0.12,
})

/** Margin around the capsule AABB for the near-kinematic test (ref/04 Checklist vendoring 5). */
const KINEMATIC_MARGIN = 0.1
/** Remaining step time below this is dropped (floating-point remainder of dt / substep), D-036. */
const SUBSTEP_EPSILON = 1e-9

/** Returns true when the given world-space box overlaps any registered kinematic body's world AABB. */
export type KinematicProximityTest = (worldBox: Box3) => boolean

// Module-level temporaries, as in the library (single-threaded, no re-entrancy).
const triPoint = new Vector3()
const capsulePoint = new Vector3()
const centerHelper = new Vector3()
const collisionFreePosition = new Vector3()
const position = new Vector3()
const invertedParentMatrix = new Matrix4()
const velocity = new Vector3()
const nearBox = new Box3()
const carried = new Vector3()
const YAxis = new Vector3(0, 1, 0)

/**
 * Kinematic capsule character controller (depenetration shapecast).
 * Assumes the model origin is at its feet.
 */
export class CharacterPhysics {
  private readonly world: BvhPhysicsWorld
  private readonly options: CharacterPhysicsOptions
  private readonly nearKinematic: KinematicProximityTest
  private readonly stateVelocity = new Vector3()
  /** Written only by src/controller/ (ref/02 Pemilik besaran). */
  readonly inputVelocity = new Vector3()
  private notGroundedSeconds = 0
  private groundedRaw = false
  private carryPending = false
  /** Ground contact of the most recent substep (landing detection for the write-back, D-037). */
  private prevSubstepGrounded = false

  private readonly segment = new Line3()
  private readonly aabbox = new Box3()
  private radius = 0

  constructor(world: BvhPhysicsWorld, options: Partial<CharacterPhysicsOptions> = {}, nearKinematic?: KinematicProximityTest) {
    this.world = world
    this.options = { ...DEFAULT_PHYSICS_OPTIONS, ...options }
    this.nearKinematic = nearKinematic ?? (() => false)
  }

  get settings(): Readonly<CharacterPhysicsOptions> {
    return this.options
  }

  /** Dynamic gravity override (e.g. Moon Gravity modifier). */
  setGravity(gravity: number): void {
    this.options.gravity = gravity
  }

  /** Library semantics (0.2 s grace); kept for reference, the game uses isGroundedRaw / canJump. */
  get isGrounded(): boolean {
    return this.notGroundedSeconds < 0.2
  }

  /** Ground contact (with downward state velocity) in any substep of the last update() (D-036). */
  get isGroundedRaw(): boolean {
    return this.groundedRaw
  }

  /** notGroundedSeconds < coyoteTime. */
  get canJump(): boolean {
    return this.notGroundedSeconds < this.options.coyoteTime
  }

  get secondsSinceGrounded(): number {
    return this.notGroundedSeconds
  }

  /** input + state velocity, written into target. */
  getVelocity(target: Vector3): Vector3 {
    return target.copy(this.inputVelocity).add(this.stateVelocity)
  }

  /** Sets vy = speed, keeps horizontal state velocity; consumes the coyote window. */
  jump(speed: number): void {
    this.stateVelocity.y = speed
    this.notGroundedSeconds = Math.max(this.notGroundedSeconds, this.options.coyoteTime)
    this.groundedRaw = false
    this.prevSubstepGrounded = false
  }

  /** Adds an inherited platform velocity, each axis capped to ±capPerAxis (ref/04 Carry 5). */
  impulse(v: Vector3, capPerAxis = 8): void {
    this.stateVelocity.x += Math.max(-capPerAxis, Math.min(capPerAxis, v.x))
    this.stateVelocity.y += Math.max(-capPerAxis, Math.min(capPerAxis, v.y))
    this.stateVelocity.z += Math.max(-capPerAxis, Math.min(capPerAxis, v.z))
  }

  resetVelocity(): void {
    this.stateVelocity.set(0, 0, 0)
    this.inputVelocity.set(0, 0, 0)
  }

  /** Places the feet at world position p, resets velocity, notGroundedSeconds = 0. */
  teleport(model: Object3D, p: Vector3): void {
    const parent = requireParent(model)
    parent.updateWorldMatrix(true, false)
    invertedParentMatrix.copy(parent.matrixWorld).invert()
    model.position.copy(p).applyMatrix4(invertedParentMatrix)
    model.updateMatrix()
    this.resetVelocity()
    this.notGroundedSeconds = 0
    this.groundedRaw = false
    this.prevSubstepGrounded = false
  }

  /** Small world-space offset for smooth ledge mantling without resetting horizontal momentum. */
  nudge(model: Object3D, dx: number, dy: number, dz: number): void {
    const parent = requireParent(model)
    parent.updateWorldMatrix(true, false)
    carried.copy(model.position).applyMatrix4(parent.matrixWorld)
    carried.x += dx
    carried.y += dy
    carried.z += dz
    invertedParentMatrix.copy(parent.matrixWorld).invert()
    model.position.copy(carried).applyMatrix4(invertedParentMatrix)
    this.carryPending = true
  }

  /** Moves the feet by a world-space rigid transform delta (platform carry); forces write-back on the next update(). */
  applyCarry(model: Object3D, delta: Matrix4): void {
    const parent = requireParent(model)
    parent.updateWorldMatrix(true, false)
    carried.copy(model.position).applyMatrix4(parent.matrixWorld).applyMatrix4(delta)
    invertedParentMatrix.copy(parent.matrixWorld).invert()
    model.position.copy(carried).applyMatrix4(invertedParentMatrix)
    this.carryPending = true
  }

  /**
   * @param fullDelta seconds; not clamped here beyond the library's 1 s (the app clamps, D-011)
   */
  update(model: Object3D, fullDelta: number): void {
    const parent = requireParent(model)
    const options = this.options
    //at max catch up to 1 second of physics in one update call (running at less then 1fps is unplayable anyways)
    fullDelta = Math.min(1, fullDelta)

    const maxPhysicsDelta = 1 / options.updatesPerSecond
    const capsuleRadius = options.capsuleRadius
    const forceWriteBack = this.carryPending
    this.carryPending = false
    let anyGrounded = false

    // Vendored: stop at a sub-nanosecond remainder (1/60 - 4·(1/240) leaves ~1e-18 s in floating point); such a
    // substep moves nothing, cannot touch the ground and used to report "not grounded" for the whole step (D-036).
    while (fullDelta > SUBSTEP_EPSILON) {
      const speed = velocity.copy(this.inputVelocity).add(this.stateVelocity).length()
      const maxCollisionDelta = speed === 0 ? maxPhysicsDelta : capsuleRadius / speed
      const partialDelta = Math.min(fullDelta, maxPhysicsDelta, maxCollisionDelta)
      fullDelta -= partialDelta
      //compute global position and inverted parent matrix so that we can compute the position in global space and re-assign it to the local chracter space
      parent.updateWorldMatrix(true, false)
      position.copy(model.position).applyMatrix4(parent.matrixWorld)
      invertedParentMatrix.copy(parent.matrixWorld).invert()

      //compute new position based on the state velocity, the input velocity, and the delta
      position.addScaledVector(this.inputVelocity, partialDelta)
      position.addScaledVector(this.stateVelocity, partialDelta)
      const isGrounded =
        this.shapecastCapsule(collisionFreePosition.copy(position), options.maxGroundSlope) && this.stateVelocity.y < 0
      this.notGroundedSeconds += partialDelta
      if (isGrounded) {
        this.notGroundedSeconds = 0
        anyGrounded = true
      }
      if (
        !isGrounded ||
        !this.prevSubstepGrounded ||
        this.inputVelocity.lengthSq() > 0 ||
        forceWriteBack ||
        this.nearKinematic(capsuleBox(collisionFreePosition, options, nearBox))
      ) {
        model.position.copy(collisionFreePosition).applyMatrix4(invertedParentMatrix)
      }
      this.prevSubstepGrounded = isGrounded
      //compute new velocity
      //  apply gravity
      this.stateVelocity.y += options.gravity * partialDelta
      //  apply linear damping (air resistance)
      const dampingFactor = 1.0 / (1.0 + partialDelta * options.linearDamping)
      this.stateVelocity.multiplyScalar(dampingFactor)
      //  apply collision to velocity
      if (isGrounded) {
        this.stateVelocity.set(0, options.gravity * 0.01, 0)
      }
    }
    // ground contact in any substep of this step (ref/04 Checklist vendoring 4: "kontak pada step terakhir")
    this.groundedRaw = anyGrounded
    // Sensors must stay: without this call BvhPhysicsSensor never fires (D-002).
    this.updateBoundingShapes()
    centerHelper.addVectors(this.segment.start, this.segment.end).multiplyScalar(0.5)
    this.world.updateSensors(
      centerHelper,
      (bounds) => bounds.intersectsBox(this.aabbox),
      (triangle) => {
        markDirty(triangle)
        return triangle.closestPointToSegment(this.segment) < this.radius
      },
    )
  }

  private updateBoundingShapes() {
    //compute the bounding capsule and bounding box
    this.radius = this.options.capsuleRadius
    const height = this.options.capsuleHeight
    this.segment.start.copy(position)
    this.segment.start.y += this.radius
    this.segment.end.copy(position)
    this.segment.end.y += height - this.radius
    this.aabbox.makeEmpty()
    this.aabbox.expandByPoint(this.segment.start)
    this.aabbox.expandByPoint(this.segment.end)
    this.aabbox.min.addScalar(-this.radius)
    this.aabbox.max.addScalar(this.radius)
  }

  /** Depenetrates the capsule standing at target (feet) and writes the collision-free feet position back into target. */
  private shapecastCapsule(target: Vector3, maxGroundSlope: number): boolean {
    this.updateBoundingShapes()
    let grounded = false

    this.world.shapecast(
      (bounds) => bounds.intersectsBox(this.aabbox),
      (tri) => {
        markDirty(tri)
        const distance = tri.closestPointToSegment(this.segment, triPoint, capsulePoint)
        if (distance === 0) {
          const isCloserToSegmentStart =
            capsulePoint.distanceTo(this.segment.start) < capsulePoint.distanceTo(this.segment.end)
          if (isCloserToSegmentStart) {
            grounded = true
          }
          const scaledDirection = capsulePoint.sub(isCloserToSegmentStart ? this.segment.start : this.segment.end)
          scaledDirection.y += this.radius
          this.segment.start.add(scaledDirection)
          this.segment.end.add(scaledDirection)
        } else if (distance < this.radius) {
          const depthInsideCapsule = this.radius - distance
          const direction = capsulePoint.sub(triPoint).divideScalar(distance)
          const slope = Math.tan(Math.acos(direction.dot(YAxis)))
          if (direction.y > 0 && slope <= maxGroundSlope) {
            grounded = true
          }
          this.segment.start.addScaledVector(direction, depthInsideCapsule)
          this.segment.end.addScaledVector(direction, depthInsideCapsule)
        }
      },
    )
    target.copy(this.segment.start)
    target.y -= this.radius
    return grounded
  }
}

function markDirty(triangle: unknown): void {
  ;(triangle as { needsUpdate: boolean }).needsUpdate = true
}

function requireParent(model: Object3D): Object3D {
  if (model.parent == null) {
    throw new Error('character must have a parent')
  }
  return model.parent
}

function capsuleBox(feet: Vector3, options: CharacterPhysicsOptions, target: Box3): Box3 {
  const r = options.capsuleRadius + KINEMATIC_MARGIN
  target.min.set(feet.x - r, feet.y - KINEMATIC_MARGIN, feet.z - r)
  target.max.set(feet.x + r, feet.y + options.capsuleHeight + KINEMATIC_MARGIN, feet.z + r)
  return target
}

export interface CharacterPhysicsPort {
  step(dt: number): void
  jump(speed: number): void
  impulse(v: Vector3, capPerAxis?: number): void
  teleport(p: Vector3): void
  nudge(dx: number, dy: number, dz: number): void
  setGravity(gravity: number): void
  resetVelocity(): void
  applyCarry(delta: Matrix4): void
  readonly inputVelocity: Vector3
  readonly position: Vector3
  readonly velocity: Vector3
  readonly isGroundedRaw: boolean
  readonly canJump: boolean
  readonly secondsSinceGrounded: number
  readonly settings: Readonly<CharacterPhysicsOptions>
}

export function createCharacterPhysicsPort(
  world: BvhPhysicsWorld,
  model: Object3D,
  options: Partial<CharacterPhysicsOptions> = {},
  nearKinematic?: KinematicProximityTest,
): CharacterPhysicsPort {
  const physics = new CharacterPhysics(world, options, nearKinematic)
  return {
    step: (dt) => physics.update(model, dt),
    jump: (speed) => physics.jump(speed),
    impulse: (v, cap) => physics.impulse(v, cap),
    teleport: (p) => physics.teleport(model, p),
    nudge: (dx, dy, dz) => physics.nudge(model, dx, dy, dz),
    setGravity: (g) => physics.setGravity(g),
    resetVelocity: () => physics.resetVelocity(),
    applyCarry: (delta) => physics.applyCarry(model, delta),
    inputVelocity: physics.inputVelocity,
    get position() {
      return model.getWorldPosition(new Vector3())
    },
    get velocity() {
      return physics.getVelocity(new Vector3())
    },
    get isGroundedRaw() {
      return physics.isGroundedRaw
    },
    get canJump() {
      return physics.canJump
    },
    get secondsSinceGrounded() {
      return physics.secondsSinceGrounded
    },
    get settings() {
      return physics.settings
    },
  }
}
