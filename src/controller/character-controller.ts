// Hybrid controller core (DIRECTIVE D-001, D-010, D-011, D-012; ref/02 §Frame order). React-free so the
// headless harness drives exactly the code the game runs. Owns inputVelocity, sprintActive, the jump buffer,
// groundBody and the visual facing yaw (ref/02 Pemilik besaran).
import { Euler, Vector3 } from 'three'
import type { Object3D } from 'three'
import type { CharacterPhysicsPort } from '../physics/character-physics.ts'
import type { PlatformMotion, KinematicPlatform } from '../level/motion.ts'
import { carryDelta, probeGroundPlatform } from './carry.ts'
import { JumpBuffer, LOCOMOTION, Sprint } from './locomotion.ts'
import type { SprintMode } from './locomotion.ts'

/** Movement keys as read from the action system (0..1) plus the run key. */
export type ControlInput = { forward: number; backward: number; left: number; right: number; run: boolean }

export const NO_INPUT: Readonly<ControlInput> = Object.freeze({ forward: 0, backward: 0, left: 0, right: 0, run: false })

/** bigFall: vy < -12 m/s for more than 0.6 s (D-023). */
export const BIG_FALL_VY = -12
export const BIG_FALL_S = 0.6
/** Visual turn rate toward the movement direction (update-rotation.ts:50 default). */
export const MAX_YAW_RATE = 10
/** Inherited platform velocity cap per axis on takeoff (ref/04 §Carry 5). */
export const IMPULSE_CAP = 8

export type ControllerEvents = {
  /** Platform yaw carried this slice (rad); the camera adds it to its yaw (ref/04 §Carry 4). */
  onCarryYaw?: (dYaw: number) => void
  /** kind 'air' = the double jump (D-038). */
  onTakeoff?: (simTime: number, kind: 'ground' | 'air') => void
  /** Landed after being airborne; fallMeters = highest airborne feet y minus landing feet y. */
  onLand?: (info: { simTime: number; fallMeters: number; bigFall: boolean; impactVy: number }) => void
  /** After every physics slice (sensors, victory and lastSafe hook in here from G2). */
  afterSlice?: (sliceDt: number) => void
  /** bigFall became true: vy < -12 m/s for more than 0.6 s (D-023, TEST-12a). */
  onBigFall?: (simTime: number) => void
}

const euler = new Euler(0, 0, 0, 'YXZ')
const move = new Vector3()
const vel = new Vector3()

/** Copy of update-input-velocity.ts (pmndrs viverse 0.2.29) reading sprintActive and a camera yaw (D-010). */
export function computeInputVelocity(target: Vector3, input: ControlInput, cameraYaw: number, sprintActive: boolean): Vector3 {
  const speed = sprintActive ? LOCOMOTION.runSpeed : LOCOMOTION.walkSpeed
  euler.set(0, cameraYaw, 0, 'YXZ')
  return target
    .set(-input.left + input.right, 0, -input.forward + input.backward)
    .normalize()
    .applyEuler(euler)
    .multiplyScalar(speed)
}

export class CharacterController {
  readonly port: CharacterPhysicsPort
  readonly motion: PlatformMotion
  readonly sprint = new Sprint()
  readonly jumps = new JumpBuffer()
  events: ControllerEvents
  /** Simulation time (s); advances only with physics (D-011). */
  simTime = 0
  /** Id of the kinematic platform under the feet (carry probe), or null. */
  groundBody: string | null = null
  airborne = false
  bigFall = false
  /** Yaw of the visual model (rad), turned toward the movement direction. */
  facingYaw = 0
  /** Seconds since the last landing (animation landing window). */
  sinceLanding = Number.POSITIVE_INFINITY
  private fallingFor = 0
  private belowBigFallVy = false
  private lastTakeoffAt = Number.NEGATIVE_INFINITY
  /** Air jumps left in this airborne phase (granted by a ground takeoff, cleared on landing). */
  private airJumpsLeft = 0
  /** Total air jumps performed (animation replays jumpUp when it changes). */
  airJumpCount = 0
  private airborneTopY = 0
  private lastVy = 0

  constructor(port: CharacterPhysicsPort, motion: PlatformMotion, events: ControllerEvents = {}) {
    this.port = port
    this.motion = motion
    this.events = events
  }

  get sprintActive(): boolean {
    return this.sprint.active
  }

  /** JumpAction subscriber, already gated on PLAYING + pointer lock by the caller (D-004). */
  pressJump(): void {
    this.jumps.press(this.simTime)
  }

  /** Every transition into PLAYING: empty jump buffer, prev = cur for platforms (D-004, ref/04 §Carry 2). */
  onEnterPlaying(): void {
    this.jumps.clear()
    this.motion.syncPrev()
  }

  /** New run (Play, Restart, Replay): spawn, zero velocity, walk, facing. */
  resetRun(spawn: Vector3, facingYaw: number, runHeld: boolean): void {
    this.port.teleport(spawn)
    this.jumps.reset()
    this.sprint.reset(runHeld)
    this.groundBody = null
    this.airborne = false
    this.bigFall = false
    this.fallingFor = 0
    this.belowBigFallVy = false
    this.lastTakeoffAt = Number.NEGATIVE_INFINITY
    this.airJumpsLeft = 0
    this.facingYaw = facingYaw
    this.sinceLanding = Number.POSITIVE_INFINITY
  }

  /**
   * Priority -2 (ref/02 §Frame order). dt is the frame delta after the app clamp (0 = no physics this frame);
   * slices = motion.slices from priority -3. Platforms advance per slice only when slices > 1.
   */
  stepFrame(dt: number, input: ControlInput, cameraYaw: number, sprintMode: SprintMode): void {
    if (dt <= 0) return
    const sprinting = this.sprint.update(sprintMode, input.run)
    computeInputVelocity(this.port.inputVelocity, input, cameraYaw, sprinting)
    const slices = this.motion.slices
    const sliceDt = dt / slices
    for (let i = 0; i < slices; i++) {
      if (slices > 1) this.motion.advance(sliceDt)
      const ground = this.carry()
      if (this.jumps.tryTakeoff(this.simTime, this.port.canJump)) {
        this.port.jump(LOCOMOTION.jumpSpeed)
        if (ground != null) this.port.impulse(ground.linearVelocity, IMPULSE_CAP)
        this.groundBody = null
        this.lastTakeoffAt = this.simTime
        this.airJumpsLeft = LOCOMOTION.airJumps
        this.events.onTakeoff?.(this.simTime, 'ground')
      } else if (
        this.airJumpsLeft > 0 &&
        !this.port.canJump &&
        this.jumps.tryAirJump(this.simTime, this.lastTakeoffAt + LOCOMOTION.airJumpMinS)
      ) {
        // double jump (D-038): same fixed arc, only after a ground takeoff, once per airborne phase
        this.port.jump(LOCOMOTION.jumpSpeed)
        this.airJumpsLeft--
        this.airJumpCount++
        this.events.onTakeoff?.(this.simTime, 'air')
      }
      this.port.step(sliceDt)
      this.simTime += sliceDt
      this.trackAir(sliceDt)
      this.events.afterSlice?.(sliceDt)
    }
    this.turn(dt)
  }

  /** Probe (prev pose) → Δ = cur · prev⁻¹ → applyCarry; stops immediately when the probe misses (ref/04 §Carry 3–6). */
  private carry(): KinematicPlatform | null {
    const feet = this.port.position
    const ground = probeGroundPlatform(this.motion, feet, this.port.settings.capsuleRadius)
    // Just jumped off it (takeoff within the re-jump window and rising clearly faster than the platform): not
    // carried. Without the takeoff condition an idle player on a descending platform (vy -0.2 vs -2) was never carried.
    const justJumped = this.simTime - this.lastTakeoffAt < LOCOMOTION.rejumpS
    if (ground == null || (justJumped && this.port.velocity.y > ground.linearVelocity.y + 1)) {
      this.groundBody = null
      return null
    }
    this.port.applyCarry(carryDelta(ground))
    if (ground.yawDelta !== 0) {
      this.facingYaw += ground.yawDelta
      this.events.onCarryYaw?.(ground.yawDelta)
    }
    this.groundBody = ground.id
    return ground
  }

  private trackAir(sliceDt: number): void {
    const grounded = this.port.isGroundedRaw
    const v = this.port.velocity
    const y = this.port.position.y
    this.sinceLanding += sliceDt
    if (!grounded) {
      if (!this.airborne) {
        this.airborne = true
        this.airborneTopY = y
        this.fallingFor = 0
        this.belowBigFallVy = false
      }
      if (y > this.airborneTopY) this.airborneTopY = y
      // count time only after the slice in which vy first dropped below -12 (that slice crossed it part-way),
      // so bigFall fires strictly more than 0.6 s after the crossing (TEST-12a attempt 1)
      if (v.y < BIG_FALL_VY) {
        if (this.belowBigFallVy) this.fallingFor += sliceDt
        this.belowBigFallVy = true
      } else {
        this.belowBigFallVy = false
        this.fallingFor = 0
      }
      if (this.fallingFor > BIG_FALL_S && !this.bigFall) {
        this.bigFall = true
        this.events.onBigFall?.(this.simTime)
      }
      this.lastVy = v.y
      return
    }
    if (this.airborne) {
      this.airborne = false
      this.airJumpsLeft = 0
      const info = { simTime: this.simTime, fallMeters: Math.max(0, this.airborneTopY - y), bigFall: this.bigFall, impactVy: this.lastVy }
      this.bigFall = false
      this.fallingFor = 0
      this.belowBigFallVy = false
      this.sinceLanding = 0
      this.events.onLand?.(info)
    }
  }

  /** Kill-plane respawn: forget the airborne phase (no landing event, no bigFall count for the void fall). */
  resetAir(): void {
    this.airborne = false
    this.bigFall = false
    this.fallingFor = 0
    this.belowBigFallVy = false
    this.airJumpsLeft = 0
    this.groundBody = null
  }

  /** Visual facing toward the input direction at ≤ MAX_YAW_RATE (update-rotation.ts logic). */
  private turn(dt: number): void {
    vel.copy(this.port.inputVelocity)
    vel.y = 0
    if (vel.lengthSq() === 0) return
    const goal = Math.atan2(-vel.x, -vel.z)
    let delta = (goal - this.facingYaw) % (Math.PI * 2)
    if (delta > Math.PI) delta -= Math.PI * 2
    if (delta < -Math.PI) delta += Math.PI * 2
    if (Math.abs(delta) < 0.001) return
    this.facingYaw += Math.sign(delta) * Math.min(MAX_YAW_RATE * dt, Math.abs(delta))
  }

  /** Applies facingYaw to the visual wrapper (never the physics root, ref/04 §Animasi). */
  applyFacing(visual: Object3D): void {
    visual.rotation.y = this.facingYaw
  }

  /** Horizontal ground speed of the input (m/s), for animation choice. */
  get moveSpeed(): number {
    move.copy(this.port.inputVelocity)
    move.y = 0
    return move.length()
  }
}
