// Hybrid controller core (DIRECTIVE D-001, D-010, D-011, D-012; ref/02 §Frame order) + Tahap 1–2 Challenge Feel:
// Bounce normal launch, slippery surface low-friction glide & slope slide, Ledge Mantle (< 0.45 m below lip),
// and external lateral wind/steam forces. React-free so headless harnesses drive the exact same code.
import { Euler, Vector3 } from 'three'
import type { Object3D } from 'three'
import type { CharacterPhysicsPort } from '../physics/character-physics.ts'
import type { PlatformMotion, KinematicPlatform } from '../level/motion.ts'
import { carryDelta, probeGroundPlatform } from './carry.ts'
import { JumpBuffer, LOCOMOTION, Sprint } from './locomotion.ts'
import type { SprintMode } from './locomotion.ts'

export type ControlInput = { forward: number; backward: number; left: number; right: number; run: boolean }

export const NO_INPUT: Readonly<ControlInput> = Object.freeze({ forward: 0, backward: 0, left: 0, right: 0, run: false })

export const BIG_FALL_VY = -12
export const BIG_FALL_S = 0.6
export const MAX_YAW_RATE = 10
export const IMPULSE_CAP = 8
export const EDGE_PROBE_M = 0.3
export const EDGE_DROP_M = 0.5
/** Ledge mantle max vertical deficit below platform lip (Tahap 1). */
export const MANTLE_MAX_M = 0.45

export type ControllerEvents = {
  onCarryYaw?: (dYaw: number) => void
  onTakeoff?: (simTime: number, kind: 'ground' | 'air') => void
  onLand?: (info: { simTime: number; fallMeters: number; bigFall: boolean; impactVy: number }) => void
  afterSlice?: (sliceDt: number) => void
  onBigFall?: (simTime: number) => void
  onMantle?: (simTime: number) => void
}

const euler = new Euler(0, 0, 0, 'YXZ')
const probe = new Vector3()
const move = new Vector3()
const vel = new Vector3()
const desiredVel = new Vector3()
const bounceImp = new Vector3()

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
  simTime = 0
  groundBody: string | null = null
  airborne = false
  bigFall = false
  facingYaw = 0
  sinceLanding = Number.POSITIVE_INFINITY
  private fallingFor = 0
  private belowBigFallVy = false
  private lastTakeoffAt = Number.NEGATIVE_INFINITY
  private airJumpsLeft = 0
  airJumpCount = 0
  private airborneTopY = 0
  private lastVy = 0
  edgeGuard = false
  groundRay: ((origin: Vector3, maxDist: number) => number | null) | null = null
  /** Horizontal forward probe (origin, dir, maxDist) → hit distance or null, used for Ledge Mantle. */
  forwardRay: ((origin: Vector3, dir: Vector3, maxDist: number) => number | null) | null = null

  /** Slippery surface state set per frame by game challenge probe. */
  onSlippery = false
  readonly slipperySlide = new Vector3()
  private readonly glideVel = new Vector3()
  private lastMantleAt = Number.NEGATIVE_INFINITY
  private lastBounceAt = Number.NEGATIVE_INFINITY

  constructor(port: CharacterPhysicsPort, motion: PlatformMotion, events: ControllerEvents = {}) {
    this.port = port
    this.motion = motion
    this.events = events
  }

  get sprintActive(): boolean {
    return this.sprint.active
  }

  pressJump(): void {
    this.jumps.press(this.simTime)
  }

  onEnterPlaying(): void {
    this.jumps.clear()
    this.motion.syncPrev()
  }

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
    this.lastMantleAt = Number.NEGATIVE_INFINITY
    this.lastBounceAt = Number.NEGATIVE_INFINITY
    this.airJumpsLeft = 0
    this.facingYaw = facingYaw
    this.sinceLanding = Number.POSITIVE_INFINITY
    this.onSlippery = false
    this.slipperySlide.set(0, 0, 0)
    this.glideVel.set(0, 0, 0)
  }

  /** Elastic bounce launch along surface normal (canopies & mushrooms); respects cooldown to avoid double-trigger. */
  triggerBounce(normal: Vector3, speed: number): boolean {
    if (this.simTime - this.lastBounceAt < 0.25) return false
    this.lastBounceAt = this.simTime
    this.port.jump(Math.max(12, normal.y * speed))
    bounceImp.set(normal.x * speed * 0.9, 0, normal.z * speed * 0.9)
    if (bounceImp.lengthSq() > 0.01) this.port.impulse(bounceImp, 16)
    this.groundBody = null
    this.lastTakeoffAt = this.simTime
    this.airJumpsLeft = LOCOMOTION.airJumps
    return true
  }

  stepFrame(dt: number, input: ControlInput, cameraYaw: number, sprintMode: SprintMode): void {
    if (dt <= 0) return
    const sprinting = this.sprint.update(sprintMode, input.run)
    computeInputVelocity(desiredVel, input, cameraYaw, sprinting)

    // Slippery surface feel (~35% lower friction + downhill slide on slopes > 18°, preserves run momentum for long jumps)
    if (this.onSlippery && this.port.isGroundedRaw) {
      const blend = 1 - Math.exp(-3.4 * dt) // low traction inertia
      this.glideVel.lerp(desiredVel, blend)
      this.glideVel.addScaledVector(this.slipperySlide, dt * 4.2)
      const maxSlipSpeed = LOCOMOTION.runSpeed * 1.25
      if (this.glideVel.length() > maxSlipSpeed) this.glideVel.setLength(maxSlipSpeed)
      this.port.inputVelocity.copy(this.glideVel)
    } else {
      this.glideVel.copy(desiredVel)
      this.port.inputVelocity.copy(desiredVel)
    }

    if (this.edgeGuard && !sprinting && this.port.isGroundedRaw && !this.onSlippery) this.applyEdgeGuard()
    const slices = this.motion.slices
    const sliceDt = dt / slices
    for (let i = 0; i < slices; i++) {
      if (slices > 1) this.motion.advance(sliceDt)
      const ground = this.carry()
      if (this.jumps.tryTakeoff(this.simTime, this.port.canJump)) {
        this.port.jump(LOCOMOTION.jumpSpeed)
        if (ground != null) this.port.impulse(ground.linearVelocity, IMPULSE_CAP)
        // Carry extra horizontal glide momentum when jumping off a slippery surface
        if (this.onSlippery && this.glideVel.lengthSq() > 1) {
          this.port.impulse(bounceImp.copy(this.glideVel).multiplyScalar(0.32), 6)
        }
        this.groundBody = null
        this.lastTakeoffAt = this.simTime
        this.airJumpsLeft = LOCOMOTION.airJumps
        this.events.onTakeoff?.(this.simTime, 'ground')
      } else if (
        this.airJumpsLeft > 0 &&
        !this.port.canJump &&
        this.jumps.tryAirJump(this.simTime, this.lastTakeoffAt + LOCOMOTION.airJumpMinS)
      ) {
        this.port.jump(LOCOMOTION.jumpSpeed)
        this.airJumpsLeft--
        this.airJumpCount++
        this.events.onTakeoff?.(this.simTime, 'air')
      }
      this.port.step(sliceDt)
      this.simTime += sliceDt
      this.tryLedgeMantle()
      this.trackAir(sliceDt)
      this.events.afterSlice?.(sliceDt)
    }
    this.turn(dt)
  }

  /**
   * Smooth Ledge Mantle (Tahap 1): if airborne, moving forward, and the feet missed the platform lip by < 0.45 m,
   * gently pull the character up and onto the ledge.
   */
  private tryLedgeMantle(): void {
    if (this.port.isGroundedRaw || this.groundRay == null || this.forwardRay == null) return
    if (this.simTime - this.lastMantleAt < 0.35) return
    const vy = this.port.velocity.y
    if (vy > 4.5 || vy < -14) return
    const v = this.port.inputVelocity
    const speed = Math.hypot(v.x, v.z)
    if (speed < 0.5) return
    const dirX = v.x / speed
    const dirZ = v.z / speed
    const feet = this.port.position
    // 1. Check there is a ledge wall right in front of the lower body
    probe.set(feet.x, feet.y + 0.18, feet.z)
    move.set(dirX, 0, dirZ)
    const wallHit = this.forwardRay(probe, move, 0.72)
    if (wallHit == null) return
    // 2. Check there is a clear walkable top within MANTLE_MAX_M (0.45 m) above feet
    probe.set(feet.x + dirX * (wallHit + 0.25), feet.y + MANTLE_MAX_M + 0.15, feet.z + dirZ * (wallHit + 0.25))
    const topDist = this.groundRay(probe, MANTLE_MAX_M + 0.25)
    if (topDist == null || topDist < 0.08) return
    const liftY = MANTLE_MAX_M + 0.15 - topDist + 0.06
    if (liftY <= 0.02 || liftY > MANTLE_MAX_M + 0.08) return
    // Smoothly vault onto the lip
    this.port.nudge(dirX * 0.34, liftY, dirZ * 0.34)
    this.port.jump(2.2)
    this.lastMantleAt = this.simTime
    this.events.onMantle?.(this.simTime)
  }

  private applyEdgeGuard(): void {
    const v = this.port.inputVelocity
    const speed = Math.hypot(v.x, v.z)
    if (speed === 0 || this.groundRay == null) return
    const feet = this.port.position
    probe.set(feet.x + (v.x / speed) * EDGE_PROBE_M, feet.y + 0.1, feet.z + (v.z / speed) * EDGE_PROBE_M)
    const hit = this.groundRay(probe, EDGE_DROP_M + 0.1)
    if (hit == null) v.set(0, v.y, 0)
  }

  private carry(): KinematicPlatform | null {
    const feet = this.port.position
    const ground = probeGroundPlatform(this.motion, feet, this.port.settings.capsuleRadius)
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

  resetAir(): void {
    this.airborne = false
    this.bigFall = false
    this.fallingFor = 0
    this.belowBigFallVy = false
    this.airJumpsLeft = 0
    this.groundBody = null
  }

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

  applyFacing(visual: Object3D): void {
    visual.rotation.y = this.facingYaw
  }

  get moveSpeed(): number {
    move.copy(this.port.inputVelocity)
    move.y = 0
    return move.length()
  }
}
