// Personal Best Ghost Racer recorder & playback (Fase 1):
// Records compact [tMs, x, y, z, yaw] samples every 120 ms during an active run and persists the best run
// (either fastest full victory or highest altitude >= 15 m) to localStorage under va.ghost.v1.
export const GHOST_KEY = 'va.ghost.v1'

const SAMPLE_INTERVAL_MS = 120
const MAX_SAMPLES = 9000

export type GhostSample = [number, number, number, number, number]

export type GhostRecording = {
  v: 1
  summitM: number
  bestHeightM: number
  victory: boolean
  durationMs: number
  samples: GhostSample[]
}

export type GhostPose = {
  x: number
  y: number
  z: number
  yaw: number
  active: boolean
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadGhostRecording(storage: Pick<Storage, 'getItem'> | null = safeStorage()): GhostRecording | null {
  try {
    const raw = storage?.getItem(GHOST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GhostRecording>
    if (
      parsed.v !== 1 ||
      !Array.isArray(parsed.samples) ||
      parsed.samples.length < 2 ||
      typeof parsed.durationMs !== 'number'
    ) {
      return null
    }
    return parsed as GhostRecording
  } catch {
    return null
  }
}

export function saveGhostRecording(rec: GhostRecording, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(GHOST_KEY, JSON.stringify(rec))
  } catch {
    // quota or private mode: keep in-memory ghost only
  }
}

export class GhostSystem {
  best: GhostRecording | null = loadGhostRecording()
  private current: GhostSample[] = []
  private lastSampleMs = -SAMPLE_INTERVAL_MS
  private peakHeightM = 0
  enabled = true

  resetRun(): void {
    this.current = []
    this.lastSampleMs = -SAMPLE_INTERVAL_MS
    this.peakHeightM = 0
  }

  record(timerMs: number, x: number, y: number, z: number, yaw: number, heightM: number): void {
    if (heightM > this.peakHeightM) this.peakHeightM = heightM
    if (timerMs - this.lastSampleMs < SAMPLE_INTERVAL_MS) return
    if (this.current.length >= MAX_SAMPLES) return
    this.lastSampleMs = timerMs
    this.current.push([
      Math.round(timerMs),
      Math.round(x * 100) / 100,
      Math.round(y * 100) / 100,
      Math.round(z * 100) / 100,
      Math.round(yaw * 1000) / 1000,
    ])
  }

  commitIfBetter(summitM: number, victory: boolean, durationMs: number): boolean {
    if (this.current.length < 2) return false
    const prev = this.best
    const isBetter =
      prev == null
        ? victory || this.peakHeightM >= 15
        : victory
          ? !prev.victory || durationMs < prev.durationMs
          : !prev.victory && this.peakHeightM > prev.bestHeightM + 3
    if (!isBetter) return false
    const next: GhostRecording = {
      v: 1,
      summitM,
      bestHeightM: Math.round(this.peakHeightM * 10) / 10,
      victory,
      durationMs: Math.round(durationMs),
      samples: this.current.slice(),
    }
    this.best = next
    saveGhostRecording(next)
    return true
  }

  seed(samples: GhostSample[], bestHeightM = 50, victory = false): void {
    if (samples.length < 2) return
    const durationMs = samples[samples.length - 1][0]
    this.best = { v: 1, summitM: 500, bestHeightM, victory, durationMs, samples }
    saveGhostRecording(this.best)
  }

  sampleAt(timerMs: number, out: GhostPose): GhostPose {
    const rec = this.best
    if (!this.enabled || rec == null || rec.samples.length < 2) {
      out.active = false
      return out
    }
    const samples = rec.samples
    if (timerMs <= samples[0][0]) {
      const s = samples[0]
      out.x = s[1]
      out.y = s[2]
      out.z = s[3]
      out.yaw = s[4]
      out.active = true
      return out
    }
    const last = samples[samples.length - 1]
    if (timerMs >= last[0]) {
      out.x = last[1]
      out.y = last[2]
      out.z = last[3]
      out.yaw = last[4]
      out.active = true
      return out
    }
    let lo = 0
    let hi = samples.length - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (samples[mid][0] <= timerMs) lo = mid
      else hi = mid
    }
    const a = samples[lo]
    const b = samples[hi]
    const span = Math.max(1, b[0] - a[0])
    const t = Math.max(0, Math.min(1, (timerMs - a[0]) / span))
    out.x = a[1] + (b[1] - a[1]) * t
    out.y = a[2] + (b[2] - a[2]) * t
    out.z = a[3] + (b[3] - a[3]) * t
    let dyaw = b[4] - a[4]
    while (dyaw > Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    out.yaw = a[4] + dyaw * t
    out.active = true
    return out
  }

  get sampleCount(): number {
    return this.current.length
  }
}
