// va.records.v1 and va.run.v1 (ref/02 §Storage and §Run semantics, DIRECTIVE D-008, D-009). Read with try/catch +
// type and range validation, like settings.ts: corrupt JSON, an unknown version or a broken value falls back to the
// default with exactly one console.warn (never console.error, which the test runner fails on). Records are written at
// VICTORY and at a new grounded maximum; the run save on pagehide, visibilitychange to hidden and Save & quit, and it
// is removed by Restart, New climb and VICTORY (run). Settings live in their own key (settings.ts); TEST-16.

export const RECORDS_KEY = 'va.records.v1'
export const RUN_KEY = 'va.run.v1'

/** ref/02 §Storage: 0 <= bestHeightM <= summitY + 50. */
const HEIGHT_SLACK_M = 50
/** ref/02 §Storage: bestTimeMs === null || bestTimeMs > 1000. */
const MIN_BEST_TIME_MS = 1000

export type Records = {
  v: 1
  bestTimeMs: number | null
  bestHeightM: number
  completions: number
  restartCount: number
  lifetimeBigFalls: number
  reachedFakeSummit: boolean
}

export type RunSave = {
  v: 1
  lastSafe: [number, number, number]
  yaw: number
  timerMs: number
  killPlaneRespawns: number
  bigFalls: number
  metersLost: number
  highestM: number
  focusUsed: boolean
  savedAt: string
}

export function defaultRecords(): Records {
  return { v: 1, bestTimeMs: null, bestHeightM: 0, completions: 0, restartCount: 0, lifetimeBigFalls: 0, reachedFakeSummit: false }
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isNum = (v: unknown, min: number, max: number): v is number => isFiniteNum(v) && v >= min && v <= max
const isNonNeg = (v: unknown): v is number => isFiniteNum(v) && v >= 0
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isBestTime = (v: unknown): v is number | null => v === null || (isFiniteNum(v) && v > MIN_BEST_TIME_MS)

/** Validates a parsed value field by field (like validateSettings); returns [records, problems]. */
export function validateRecords(raw: unknown, summitY: number): [Records, string[]] {
  const d = defaultRecords()
  const problems: string[] = []
  if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) return [d, ['not an object']]
  const r = raw as Record<string, unknown>
  if (r.v !== 1) return [d, [`unknown version ${JSON.stringify(r.v)}`]]
  const take = <K extends keyof Records>(key: K, ok: (v: unknown) => boolean) => {
    if (!(key in r)) return
    if (ok(r[key])) (d as Record<string, unknown>)[key] = r[key]
    else problems.push(String(key))
  }
  take('bestTimeMs', isBestTime)
  take('bestHeightM', (v) => isNum(v, 0, summitY + HEIGHT_SLACK_M))
  take('completions', isCount)
  take('restartCount', isCount)
  take('lifetimeBigFalls', isCount)
  take('reachedFakeSummit', isBool)
  return [d, problems]
}

/** Reads and validates va.records.v1; never throws. */
export function loadRecords(summitY: number, storage: Pick<Storage, 'getItem'> | null = safeStorage()): Records {
  const read = readJson(RECORDS_KEY, storage, 'using defaults')
  if (read == null) return defaultRecords()
  const [records, problems] = validateRecords(read.value, summitY)
  if (problems.length > 0) console.warn(`${RECORDS_KEY}: invalid ${problems.join(', ')}; defaults used for those`)
  return records
}

/** Writes va.records.v1 (at VICTORY and at a new grounded maximum, ref/02 §Storage); storage errors are swallowed. */
export function saveRecords(records: Records, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(RECORDS_KEY, JSON.stringify({ ...records, v: 1 }))
  } catch {
    // storage unavailable (private mode, quota): the records still apply to this session
  }
}

/** Validates a parsed run save; any missing or broken field rejects the whole save (a partial run is useless). */
export function validateRunSave(raw: unknown): [RunSave | null, string[]] {
  if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) return [null, ['not an object']]
  const r = raw as Record<string, unknown>
  if (r.v !== 1) return [null, [`unknown version ${JSON.stringify(r.v)}`]]
  const problems: string[] = []
  const check = (key: keyof RunSave, ok: (v: unknown) => boolean) => {
    if (!ok(r[key])) problems.push(key)
  }
  check('lastSafe', (v) => Array.isArray(v) && v.length === 3 && v.every(isFiniteNum))
  check('yaw', isFiniteNum)
  check('timerMs', isNonNeg)
  check('killPlaneRespawns', isCount)
  check('bigFalls', isCount)
  check('metersLost', isNonNeg)
  check('highestM', isNonNeg)
  check('focusUsed', isBool)
  check('savedAt', (v) => typeof v === 'string')
  if (problems.length > 0) return [null, problems]
  const p = r.lastSafe as number[]
  return [
    {
      v: 1,
      lastSafe: [p[0], p[1], p[2]],
      yaw: r.yaw as number,
      timerMs: r.timerMs as number,
      killPlaneRespawns: r.killPlaneRespawns as number,
      bigFalls: r.bigFalls as number,
      metersLost: r.metersLost as number,
      highestM: r.highestM as number,
      focusUsed: r.focusUsed as boolean,
      savedAt: r.savedAt as string,
    },
    [],
  ]
}

/** Reads and validates va.run.v1 (D-009); null when absent or invalid; never throws. */
export function loadRunSave(storage: Pick<Storage, 'getItem'> | null = safeStorage()): RunSave | null {
  const read = readJson(RUN_KEY, storage, 'saved run ignored')
  if (read == null) return null
  const [save, problems] = validateRunSave(read.value)
  if (save == null) console.warn(`${RUN_KEY}: invalid ${problems.join(', ')}; saved run ignored`)
  return save
}

/** Writes va.run.v1 (pagehide, visibilitychange to hidden, Save & quit; D-009); storage errors are swallowed. */
export function saveRunSave(save: RunSave, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(RUN_KEY, JSON.stringify({ ...save, v: 1 }))
  } catch {
    // storage unavailable: Continue is simply not offered next time
  }
}

/** Removes va.run.v1 (Restart, New climb, VICTORY in mode run; ref/02 §Run semantics); never throws. */
export function clearRunSave(storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try {
    storage?.removeItem(RUN_KEY)
  } catch {
    // storage unavailable: nothing to remove
  }
}

/**
 * VICTORY (D-008): only mode 'run' changes anything: completions + 1 and bestTimeMs = min(previous, timerMs).
 * bestTimeMs is written only when !focusUsed (D-008) and when the time passes the stored range (> 1000 ms), so a
 * written best always survives validateRecords. deltaMs = timerMs - previous best, null without a previous best.
 */
export function recordsAfterVictory(
  r: Records,
  timerMs: number,
  mode: 'run' | 'freeRoam',
  focusUsed = false,
): { records: Records; newBest: boolean; deltaMs: number | null } {
  if (mode !== 'run') return { records: r, newBest: false, deltaMs: null }
  const prev = r.bestTimeMs
  const deltaMs = prev == null || !Number.isFinite(timerMs) ? null : timerMs - prev
  const eligible = !focusUsed && isFiniteNum(timerMs) && timerMs > MIN_BEST_TIME_MS
  const newBest = eligible && (prev == null || timerMs < prev)
  return { records: { ...r, completions: r.completions + 1, bestTimeMs: newBest ? timerMs : prev }, newBest, deltaMs }
}

/** New grounded maximum (D-008): bestHeightM = max only in mode 'run'; returns the same object when unchanged. */
export function recordsAfterHeight(r: Records, heightM: number, mode: 'run' | 'freeRoam'): Records {
  if (mode !== 'run' || !Number.isFinite(heightM) || heightM <= r.bestHeightM) return r
  return { ...r, bestHeightM: heightM }
}

/** Reads and parses one key; null when absent, unreadable or corrupt (corrupt JSON warns once, here). */
function readJson(key: string, storage: Pick<Storage, 'getItem'> | null, fallback: string): { value: unknown } | null {
  let text: string | null = null
  try {
    text = storage?.getItem(key) ?? null
  } catch {
    return null
  }
  if (text == null) return null
  try {
    return { value: JSON.parse(text) as unknown }
  } catch {
    console.warn(`${key}: corrupt JSON, ${fallback}`)
    return null
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
