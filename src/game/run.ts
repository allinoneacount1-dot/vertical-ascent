// Run timer, height and counters (DIRECTIVE D-007, D-008; ref/02 §Run semantics). Pure; the only writer of these values.

/** Frame delta clamp for the run timer (D-008), same as the physics clamp (D-011). */
export const MAX_FRAME_DT = 0.1

export class Run {
  timerMs = 0
  /** Timer starts on the first movement input after spawn (D-008). */
  started = false
  /** Frozen at VICTORY. */
  frozen = false
  heightM = 0
  /** Highest grounded height of this run (m). */
  highestM = 0
  killPlaneRespawns = 0
  bigFalls = 0
  metersLost = 0
  focusUsed = false
  spawnY = 0

  /** Restart / New climb / Play: timer 0, height 0, counters 0. */
  newRun(spawnY: number): void {
    this.timerMs = 0
    this.started = false
    this.frozen = false
    this.heightM = 0
    this.highestM = 0
    this.killPlaneRespawns = 0
    this.bigFalls = 0
    this.metersLost = 0
    this.focusUsed = false
    this.spawnY = spawnY
  }

  /** Any movement or jump input while PLAYING. */
  noteMovementInput(): void {
    this.started = true
  }

  /**
   * Called once per rendered frame with the unscaled frame delta (seconds).
   * Runs only while PLAYING in mode 'run', after the first movement input, and not frozen.
   */
  tick(frameDt: number, playing: boolean, freeRoam: boolean): void {
    if (!playing || freeRoam || !this.started || this.frozen) return
    this.timerMs += Math.min(Math.max(frameDt, 0), MAX_FRAME_DT) * 1000
  }

  /** HUD height = floor(feet.y - spawn.y), never negative (D-008). */
  updateHeight(feetY: number, groundedRaw: boolean): void {
    this.heightM = Math.max(0, Math.floor(feetY - this.spawnY))
    if (groundedRaw && this.heightM > this.highestM) this.highestM = this.heightM
  }

  /** Kill plane: same run, timer continues (D-007). */
  noteKillPlaneRespawn(): void {
    this.killPlaneRespawns++
  }

  freeze(): void {
    this.frozen = true
  }
}

/** mm:ss for the HUD (D-008). */
export function formatHud(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
