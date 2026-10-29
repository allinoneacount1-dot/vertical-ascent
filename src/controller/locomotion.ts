// Game-owned sprint and jump timing (DIRECTIVE D-010, D-011; ref/03 §Movement). Pure logic, simulation time only.

export type SprintMode = 'hold' | 'toggle' | 'always'

/** Seeds from ref/03 §Movement; measured values live in level/movement.json. */
export const LOCOMOTION = Object.freeze({
  /** m/s (update-input-velocity.ts:22,28 defaults) */
  walkSpeed: 3,
  runSpeed: 6,
  /** jump(8) sets vy = 8 */
  jumpSpeed: 8,
  /** seconds a jump press stays buffered */
  jumpBufferS: 0.1,
  /** minimum seconds between two ground takeoffs */
  rejumpS: 0.3,
  /** double jump (owner request, D-038): earliest air jump after the ground takeoff, seconds */
  airJumpMinS: 0.1,
  /** air jumps allowed per airborne phase that started with a ground takeoff */
  airJumps: 1,
})

/**
 * sprintActive (D-010): Hold = run key held; Toggle (default) flips only on the run key's rising edge,
 * with no idle timeout; Always = true.
 */
export class Sprint {
  active = false
  private wasPressed = false

  update(mode: SprintMode, pressed: boolean): boolean {
    if (mode === 'hold') this.active = pressed
    else if (mode === 'always') this.active = true
    else if (pressed && !this.wasPressed) this.active = !this.active
    this.wasPressed = pressed
    return this.active
  }

  /** New run: walk again, and a key still held does not count as a new edge. */
  reset(pressedNow: boolean): void {
    this.active = false
    this.wasPressed = pressedNow
  }
}

/**
 * Jump buffer stamped with simulation time (never performance.now(), D-011).
 * press() records a request; tryTakeoff() consumes it at the start of a physics slice when allowed.
 */
export class JumpBuffer {
  private pressedAt: number | null = null
  private lastTakeoff = Number.NEGATIVE_INFINITY

  press(simTime: number): void {
    this.pressedAt = simTime
  }

  /** Cleared on every transition into PLAYING (D-004) and on teleports. */
  clear(): void {
    this.pressedAt = null
  }

  get pending(): boolean {
    return this.pressedAt != null
  }

  tryTakeoff(simTime: number, canJump: boolean): boolean {
    if (this.pressedAt == null) return false
    if (simTime - this.pressedAt > LOCOMOTION.jumpBufferS) {
      this.pressedAt = null
      return false
    }
    if (!canJump || simTime - this.lastTakeoff < LOCOMOTION.rejumpS) return false
    this.pressedAt = null
    this.lastTakeoff = simTime
    return true
  }

  /**
   * Air jump (D-038): consumes a buffered press that is still fresh once simTime ≥ earliest. Does not touch the
   * ground re-jump timer.
   */
  tryAirJump(simTime: number, earliest: number): boolean {
    if (this.pressedAt == null) return false
    if (simTime - this.pressedAt > LOCOMOTION.jumpBufferS) {
      this.pressedAt = null
      return false
    }
    if (simTime < earliest) return false
    this.pressedAt = null
    return true
  }

  /** New run. */
  reset(): void {
    this.pressedAt = null
    this.lastTakeoff = Number.NEGATIVE_INFINITY
  }
}
