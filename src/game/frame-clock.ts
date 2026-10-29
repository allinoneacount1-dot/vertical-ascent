// App-side frame delta policy (DIRECTIVE D-011): clamp ≤0.1 s, nothing while not PLAYING,
// and the first delta after (re)entering PLAYING is discarded.
export const FRAME_DT_CLAMP = 0.1

export class FrameClock {
  /** Clamped delta of the current frame; 0 = physics, world clock and run timer do not advance. */
  dt = 0
  private discardNext = true

  /** Called on every transition into PLAYING (Play, Resume, Restart, …). */
  armDiscard(): void {
    this.discardNext = true
  }

  begin(rawDt: number, playing: boolean): number {
    if (!playing) {
      this.dt = 0
      return 0
    }
    if (this.discardNext) {
      this.discardNext = false
      this.dt = 0
      return 0
    }
    this.dt = Math.min(Math.max(rawDt, 0), FRAME_DT_CLAMP)
    return this.dt
  }
}
