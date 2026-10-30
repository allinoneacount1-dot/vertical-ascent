// TEST-16 (DIRECTIVE §7 row 16; ref/02 §Storage and §Run semantics; D-008, D-009): corrupt JSON / wrong type / out of
// range / future version → default, no throw, exactly one console.warn (never console.error); bestTimeMs only at
// VICTORY in mode run; bestHeightM at a new grounded maximum; settings in a separate key. The expectations are written
// from ref/02, independently of src/game/persist.ts. SUMMIT_Y is a test parameter, not level data.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import {
  RECORDS_KEY,
  RUN_KEY,
  clearRunSave,
  defaultRecords,
  loadRecords,
  loadRunSave,
  recordsAfterHeight,
  recordsAfterVictory,
  saveRecords,
  saveRunSave,
  validateRecords,
  validateRunSave,
} from './persist.ts'
import type { Records, RunSave } from './persist.ts'
import { SETTINGS_KEY, defaultSettings, loadSettings } from './settings.ts'

const SUMMIT_Y = 500

/** In-memory Storage stand-in; `map` exposes what was written. */
function memStorage(init: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(init))
  return {
    map,
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      map.set(k, v)
    },
    removeItem: (k: string): void => {
      map.delete(k)
    },
  }
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('SecurityError')
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError')
  },
  removeItem: (): void => {
    throw new Error('SecurityError')
  },
}

const VALID_RECORDS: Records = {
  v: 1,
  bestTimeMs: 754321.5,
  bestHeightM: 312,
  completions: 3,
  restartCount: 7,
  lifetimeBigFalls: 41,
  reachedFakeSummit: true,
}

const VALID_RUN: RunSave = {
  v: 1,
  lastSafe: [12.5, 140.25, -33.75],
  yaw: -1.25,
  timerMs: 183456.7,
  killPlaneRespawns: 2,
  bigFalls: 5,
  metersLost: 88.5,
  highestM: 151,
  focusUsed: false,
  savedAt: '2026-10-30T12:00:00.000Z',
}

const recordsStore = (value: unknown) => memStorage({ [RECORDS_KEY]: typeof value === 'string' ? value : JSON.stringify(value) })
const runStore = (value: unknown) => memStorage({ [RUN_KEY]: typeof value === 'string' ? value : JSON.stringify(value) })

let warn: MockInstance<typeof console.warn>
let error: MockInstance<typeof console.error>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  expect(error).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('va.records.v1 load', () => {
  it('absent key, null storage, throwing storage and the default accessor give defaults without a warn', () => {
    expect(loadRecords(SUMMIT_Y, memStorage())).toEqual(defaultRecords())
    expect(loadRecords(SUMMIT_Y, null)).toEqual(defaultRecords())
    expect(() => loadRecords(SUMMIT_Y, throwing)).not.toThrow()
    expect(loadRecords(SUMMIT_Y, throwing)).toEqual(defaultRecords())
    expect(() => loadRecords(SUMMIT_Y)).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })

  it('defaults are bestTimeMs null, zero heights and counters, fake summit not reached', () => {
    expect(defaultRecords()).toEqual({ v: 1, bestTimeMs: null, bestHeightM: 0, completions: 0, restartCount: 0, lifetimeBigFalls: 0, reachedFakeSummit: false })
    expect(defaultRecords()).not.toBe(defaultRecords())
  })

  it('a valid save round-trips without a warn', () => {
    const s = memStorage()
    saveRecords(VALID_RECORDS, s)
    expect(s.map.has(RECORDS_KEY)).toBe(true)
    expect(loadRecords(SUMMIT_Y, s)).toEqual(VALID_RECORDS)
    expect(warn).not.toHaveBeenCalled()
  })

  it.each(['{', 'not json', '{"v":1,"bestTimeMs":', '', 'undefined', "{'v':1}"])('corrupt JSON %j → defaults, no throw, one warn', (text) => {
    let out: Records | undefined
    expect(() => {
      out = loadRecords(SUMMIT_Y, recordsStore(text))
    }).not.toThrow()
    expect(out).toEqual(defaultRecords())
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it.each(['null', '42', '"records"', 'true', '[]', '[1,2,3]'])('non-object JSON %s → defaults, one warn', (text) => {
    expect(loadRecords(SUMMIT_Y, recordsStore(text))).toEqual(defaultRecords())
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it.each([2, 0, '1', null, 1.5])('future or unknown version %j → defaults (valid fields ignored), one warn', (v) => {
    expect(loadRecords(SUMMIT_Y, recordsStore({ ...VALID_RECORDS, v }))).toEqual(defaultRecords())
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('a missing version → defaults, one warn', () => {
    const noVersion: Record<string, unknown> = { ...VALID_RECORDS }
    delete noVersion.v
    expect(loadRecords(SUMMIT_Y, recordsStore(noVersion))).toEqual(defaultRecords())
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it.each<[keyof Records, unknown]>([
    ['bestTimeMs', '60000'],
    ['bestTimeMs', false],
    ['bestTimeMs', {}],
    ['bestHeightM', '120'],
    ['bestHeightM', null],
    ['completions', '3'],
    ['completions', true],
    ['restartCount', [1]],
    ['lifetimeBigFalls', null],
    ['reachedFakeSummit', 'true'],
    ['reachedFakeSummit', 1],
  ])('wrong type %s = %j → default for that field only, other fields kept, one warn', (key, bad) => {
    const out = loadRecords(SUMMIT_Y, recordsStore({ ...VALID_RECORDS, [key]: bad }))
    expect(out).toEqual({ ...VALID_RECORDS, [key]: defaultRecords()[key] })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain(key)
  })

  it.each<[keyof Records, unknown]>([
    ['bestHeightM', -1],
    ['bestHeightM', -0.001],
    ['bestHeightM', SUMMIT_Y + 50.001],
    ['bestHeightM', 1e9],
    ['bestTimeMs', 1000],
    ['bestTimeMs', 999.9],
    ['bestTimeMs', 0],
    ['bestTimeMs', -5000],
    ['completions', -1],
    ['completions', 1.5],
    ['restartCount', -3],
    ['lifetimeBigFalls', 0.25],
  ])('out of range %s = %j → default for that field, one warn', (key, bad) => {
    const out = loadRecords(SUMMIT_Y, recordsStore({ ...VALID_RECORDS, [key]: bad }))
    expect(out).toEqual({ ...VALID_RECORDS, [key]: defaultRecords()[key] })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('range boundaries: bestHeightM 0 and summitY + 50, bestTimeMs just over 1000 and null are accepted', () => {
    const [atTop, p1] = validateRecords({ ...VALID_RECORDS, bestHeightM: SUMMIT_Y + 50 }, SUMMIT_Y)
    expect(atTop.bestHeightM).toBe(SUMMIT_Y + 50)
    const [atZero, p2] = validateRecords({ ...VALID_RECORDS, bestHeightM: 0, bestTimeMs: 1000.5 }, SUMMIT_Y)
    expect(atZero.bestHeightM).toBe(0)
    expect(atZero.bestTimeMs).toBe(1000.5)
    const [noBest, p3] = validateRecords({ ...VALID_RECORDS, bestTimeMs: null }, SUMMIT_Y)
    expect(noBest.bestTimeMs).toBeNull()
    expect([...p1, ...p2, ...p3]).toEqual([])
  })

  it('the height range follows the summitY argument', () => {
    expect(validateRecords({ ...VALID_RECORDS, bestHeightM: 312 }, 100)[0].bestHeightM).toBe(0)
    expect(validateRecords({ ...VALID_RECORDS, bestHeightM: 312 }, 300)[0].bestHeightM).toBe(312)
  })

  it('non-finite numbers are rejected by validateRecords', () => {
    const [r, problems] = validateRecords({ ...VALID_RECORDS, bestTimeMs: Infinity, bestHeightM: Number.NaN, completions: Infinity }, SUMMIT_Y)
    expect(r.bestTimeMs).toBeNull()
    expect(r.bestHeightM).toBe(0)
    expect(r.completions).toBe(0)
    expect(problems.sort()).toEqual(['bestHeightM', 'bestTimeMs', 'completions'])
  })

  it('several broken fields still produce exactly one warn naming each of them', () => {
    const out = loadRecords(SUMMIT_Y, recordsStore({ ...VALID_RECORDS, bestTimeMs: 'x', bestHeightM: -4, completions: 2.5, reachedFakeSummit: 'yes' }))
    expect(out).toEqual({ ...defaultRecords(), restartCount: 7, lifetimeBigFalls: 41 })
    expect(warn).toHaveBeenCalledTimes(1)
    const msg = String(warn.mock.calls[0][0])
    for (const k of ['bestTimeMs', 'bestHeightM', 'completions', 'reachedFakeSummit']) expect(msg).toContain(k)
  })

  it('missing fields take their defaults silently and unknown fields are dropped', () => {
    const out = loadRecords(SUMMIT_Y, recordsStore({ v: 1, completions: 4, junk: 'x' }))
    expect(out).toEqual({ ...defaultRecords(), completions: 4 })
    expect(Object.keys(out).sort()).toEqual(Object.keys(defaultRecords()).sort())
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('va.records.v1 save', () => {
  it('writes only its own key as v1 JSON and swallows storage errors', () => {
    const s = memStorage()
    saveRecords(VALID_RECORDS, s)
    expect([...s.map.keys()]).toEqual([RECORDS_KEY])
    expect(JSON.parse(s.map.get(RECORDS_KEY) as string)).toEqual(VALID_RECORDS)
    expect(() => saveRecords(VALID_RECORDS, throwing)).not.toThrow()
    expect(() => saveRecords(VALID_RECORDS, null)).not.toThrow()
    expect(() => saveRecords(VALID_RECORDS)).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('bestTimeMs only at VICTORY in mode run (D-008)', () => {
  it('first run completion: completions + 1, bestTimeMs = timer, newBest, no delta', () => {
    const before = defaultRecords()
    const { records, newBest, deltaMs } = recordsAfterVictory(before, 600000, 'run')
    expect(records.completions).toBe(1)
    expect(records.bestTimeMs).toBe(600000)
    expect(newBest).toBe(true)
    expect(deltaMs).toBeNull()
    expect(before).toEqual(defaultRecords())
  })

  it('a slower run: completions + 1, best unchanged, positive delta', () => {
    const { records, newBest, deltaMs } = recordsAfterVictory(VALID_RECORDS, 800000, 'run')
    expect(records.completions).toBe(VALID_RECORDS.completions + 1)
    expect(records.bestTimeMs).toBe(VALID_RECORDS.bestTimeMs)
    expect(newBest).toBe(false)
    expect(deltaMs).toBeCloseTo(800000 - 754321.5, 6)
  })

  it('a faster run: bestTimeMs = min, newBest, negative delta', () => {
    const { records, newBest, deltaMs } = recordsAfterVictory(VALID_RECORDS, 700000, 'run')
    expect(records.bestTimeMs).toBe(700000)
    expect(newBest).toBe(true)
    expect(deltaMs).toBeCloseTo(700000 - 754321.5, 6)
    expect(records.restartCount).toBe(VALID_RECORDS.restartCount)
  })

  it('an equal time is not a new best', () => {
    const { records, newBest, deltaMs } = recordsAfterVictory(VALID_RECORDS, 754321.5, 'run')
    expect(records.bestTimeMs).toBe(754321.5)
    expect(newBest).toBe(false)
    expect(deltaMs).toBe(0)
  })

  it('free roam changes nothing: same object, no completion, no best, no delta', () => {
    const out = recordsAfterVictory(VALID_RECORDS, 1, 'freeRoam')
    expect(out.records).toBe(VALID_RECORDS)
    expect(out.newBest).toBe(false)
    expect(out.deltaMs).toBeNull()
    expect(recordsAfterVictory(defaultRecords(), 600000, 'freeRoam').records.bestTimeMs).toBeNull()
  })

  it('a run with Focus used completes but never writes bestTimeMs (D-008 !run.focusUsed)', () => {
    const { records, newBest } = recordsAfterVictory(defaultRecords(), 600000, 'run', true)
    expect(records.completions).toBe(1)
    expect(records.bestTimeMs).toBeNull()
    expect(newBest).toBe(false)
  })

  it('a written best always passes validation on the next load', () => {
    const s = memStorage()
    const { records } = recordsAfterVictory(defaultRecords(), 1000, 'run')
    expect(records.bestTimeMs).toBeNull()
    saveRecords(recordsAfterVictory(records, 650000, 'run').records, s)
    expect(loadRecords(SUMMIT_Y, s)).toEqual({ ...defaultRecords(), completions: 2, bestTimeMs: 650000 })
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('bestHeightM at a new grounded maximum (D-008)', () => {
  it('a higher grounded height in mode run raises bestHeightM and nothing else', () => {
    const out = recordsAfterHeight(VALID_RECORDS, 313, 'run')
    expect(out).not.toBe(VALID_RECORDS)
    expect(out).toEqual({ ...VALID_RECORDS, bestHeightM: 313 })
  })

  it('an equal or lower height returns the same object', () => {
    expect(recordsAfterHeight(VALID_RECORDS, 312, 'run')).toBe(VALID_RECORDS)
    expect(recordsAfterHeight(VALID_RECORDS, 10, 'run')).toBe(VALID_RECORDS)
    expect(recordsAfterHeight(defaultRecords(), -2, 'run').bestHeightM).toBe(0)
  })

  it('free roam never raises bestHeightM; non-finite heights are ignored', () => {
    expect(recordsAfterHeight(VALID_RECORDS, 499, 'freeRoam')).toBe(VALID_RECORDS)
    expect(recordsAfterHeight(VALID_RECORDS, Number.NaN, 'run')).toBe(VALID_RECORDS)
    expect(recordsAfterHeight(VALID_RECORDS, Infinity, 'run')).toBe(VALID_RECORDS)
  })
})

describe('va.run.v1 (D-009)', () => {
  it('a valid save round-trips without a warn', () => {
    const s = memStorage()
    saveRunSave(VALID_RUN, s)
    expect([...s.map.keys()]).toEqual([RUN_KEY])
    expect(loadRunSave(s)).toEqual(VALID_RUN)
    expect(warn).not.toHaveBeenCalled()
  })

  it('absent key, null storage, throwing storage and the default accessor give null without a warn', () => {
    expect(loadRunSave(memStorage())).toBeNull()
    expect(loadRunSave(null)).toBeNull()
    expect(() => loadRunSave(throwing)).not.toThrow()
    expect(loadRunSave(throwing)).toBeNull()
    expect(() => loadRunSave()).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })

  it.each(['{', 'garbage', '{"v":1,"lastSafe":[1,2', ''])('corrupt JSON %j → null, no throw, one warn', (text) => {
    expect(loadRunSave(runStore(text))).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it.each(['null', '7', '"run"', '[]', 'false'])('non-object JSON %s → null, one warn', (text) => {
    expect(loadRunSave(runStore(text))).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it.each([2, '1', 0, null])('future or unknown version %j → null, one warn', (v) => {
    expect(loadRunSave(runStore({ ...VALID_RUN, v }))).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it.each<[keyof RunSave, unknown]>([
    ['lastSafe', [1, 2]],
    ['lastSafe', [1, 2, 3, 4]],
    ['lastSafe', [1, '2', 3]],
    ['lastSafe', [1, null, 3]],
    ['lastSafe', { 0: 1, 1: 2, 2: 3 }],
    ['yaw', '0.5'],
    ['yaw', null],
    ['timerMs', -1],
    ['timerMs', '1000'],
    ['killPlaneRespawns', -1],
    ['killPlaneRespawns', 1.5],
    ['bigFalls', '2'],
    ['metersLost', -0.5],
    ['metersLost', null],
    ['highestM', -1],
    ['highestM', 'high'],
    ['focusUsed', 0],
    ['focusUsed', 'false'],
    ['savedAt', 1730289600000],
    ['savedAt', null],
  ])('wrong type or range %s = %j → the whole save is null, one warn', (key, bad) => {
    expect(loadRunSave(runStore({ ...VALID_RUN, [key]: bad }))).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain(key)
  })

  it('a save missing any field is rejected (a partial run is useless)', () => {
    for (const key of Object.keys(VALID_RUN) as Array<keyof RunSave>) {
      if (key === 'v') continue
      const partial: Record<string, unknown> = { ...VALID_RUN }
      delete partial[key]
      const [save, problems] = validateRunSave(partial)
      expect(save, key).toBeNull()
      expect(problems, key).toEqual([key])
    }
  })

  it('non-finite numbers are rejected by validateRunSave', () => {
    expect(validateRunSave({ ...VALID_RUN, lastSafe: [0, Infinity, 0] })[0]).toBeNull()
    expect(validateRunSave({ ...VALID_RUN, yaw: Number.NaN })[0]).toBeNull()
    expect(validateRunSave({ ...VALID_RUN, timerMs: Infinity })[0]).toBeNull()
  })

  it('zero values are valid and unknown fields are stripped', () => {
    const zero = { ...VALID_RUN, lastSafe: [0, 0, 0], yaw: 0, timerMs: 0, killPlaneRespawns: 0, bigFalls: 0, metersLost: 0, highestM: 0 }
    const [save, problems] = validateRunSave({ ...zero, extra: 'x' })
    expect(problems).toEqual([])
    expect(save).toEqual(zero)
    expect(save && 'extra' in save).toBe(false)
  })

  it('save and clear swallow storage errors', () => {
    expect(() => saveRunSave(VALID_RUN, throwing)).not.toThrow()
    expect(() => saveRunSave(VALID_RUN, null)).not.toThrow()
    expect(() => clearRunSave(throwing)).not.toThrow()
    expect(() => clearRunSave(null)).not.toThrow()
    expect(() => clearRunSave()).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })

  it('clearRunSave removes only va.run.v1', () => {
    const s = memStorage({ [RUN_KEY]: JSON.stringify(VALID_RUN), [RECORDS_KEY]: JSON.stringify(VALID_RECORDS), [SETTINGS_KEY]: '{"v":1}' })
    clearRunSave(s)
    expect(loadRunSave(s)).toBeNull()
    expect([...s.map.keys()].sort()).toEqual([RECORDS_KEY, SETTINGS_KEY].sort())
    expect(loadRecords(SUMMIT_Y, s)).toEqual(VALID_RECORDS)
  })
})

describe('settings use a separate key', () => {
  it('the three keys are distinct and versioned', () => {
    expect(SETTINGS_KEY).not.toBe(RECORDS_KEY)
    expect(SETTINGS_KEY).not.toBe(RUN_KEY)
    expect(RECORDS_KEY).not.toBe(RUN_KEY)
    expect([RECORDS_KEY, RUN_KEY]).toEqual(['va.records.v1', 'va.run.v1'])
  })

  it('loadSettings ignores records and a run save stored in their own keys', () => {
    const s = memStorage({ [RECORDS_KEY]: JSON.stringify(VALID_RECORDS), [RUN_KEY]: JSON.stringify(VALID_RUN) })
    expect(loadSettings(s)).toEqual(defaultSettings())
    expect(warn).not.toHaveBeenCalled()
  })

  it('loadSettings ignores a records object even under the settings key', () => {
    const settings = loadSettings(memStorage({ [SETTINGS_KEY]: JSON.stringify(VALID_RECORDS) }))
    expect(settings).toEqual(defaultSettings())
    expect('bestTimeMs' in settings).toBe(false)
    expect('completions' in settings).toBe(false)
  })

  it('loadRecords ignores settings: a settings object under its key or under the records key changes no record', () => {
    const settingsJson = JSON.stringify({ ...defaultSettings(), fov: 90 })
    expect(loadRecords(SUMMIT_Y, memStorage({ [SETTINGS_KEY]: settingsJson }))).toEqual(defaultRecords())
    const out = loadRecords(SUMMIT_Y, memStorage({ [RECORDS_KEY]: settingsJson }))
    expect(out).toEqual(defaultRecords())
    expect('fov' in out).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('saving records or a run leaves the stored settings untouched', () => {
    const settingsJson = JSON.stringify({ ...defaultSettings(), fov: 90 })
    const s = memStorage({ [SETTINGS_KEY]: settingsJson })
    saveRecords(VALID_RECORDS, s)
    saveRunSave(VALID_RUN, s)
    clearRunSave(s)
    expect(s.map.get(SETTINGS_KEY)).toBe(settingsJson)
    expect(loadSettings(s).fov).toBe(90)
  })
})
