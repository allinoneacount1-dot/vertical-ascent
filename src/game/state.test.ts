// TEST-35a (G1 subset of ref/02 §State table): MENU → Play, PLAYING → PAUSED (4 triggers), PAUSED → Resume,
// kill plane, plus every other event on MENU, PLAYING and PAUSED → listed target or 'ignored'; 0 throws.
// The expectation table below is written from ref/02, independently of src/game/state.ts.
import { describe, expect, it } from 'vitest'
import { ENTER_INTENTS, EVENT_TYPES, INITIAL_SNAPSHOT, transition } from './state.ts'
import type { GameEvent, Snapshot, State } from './state.ts'

type Expect = 'ignored' | { state: State; effect: string; mode?: 'run' | 'freeRoam'; contextLost?: boolean }

/** Expands every event type into concrete events (each enter intent, loaded with and without worldReady). */
function allEvents(): GameEvent[] {
  const out: GameEvent[] = []
  for (const type of EVENT_TYPES) {
    if (type === 'enter') for (const intent of ENTER_INTENTS) out.push({ type, intent })
    else if (type === 'loaded') out.push({ type, worldReady: true }, { type, worldReady: false })
    else if (type === 'loadFailed') out.push({ type, url: 'assets/missing.glb' })
    else out.push({ type } as GameEvent)
  }
  return out
}

function key(e: GameEvent): string {
  if (e.type === 'enter') return `enter:${e.intent}`
  if (e.type === 'loaded') return `loaded:${e.worldReady}`
  return e.type
}

const snap = (state: State, extra: Partial<Snapshot> = {}): Snapshot => ({ ...INITIAL_SNAPSHOT, state, ...extra })

const CASES: Array<{ name: string; from: Snapshot; listed: Record<string, Expect> }> = [
  {
    name: 'MENU',
    from: snap('MENU'),
    listed: {
      'enter:play': { state: 'PLAYING', effect: 'newRun', mode: 'run' },
      'enter:continue': { state: 'PLAYING', effect: 'continueRun', mode: 'run' },
      'enter:newClimb': { state: 'PLAYING', effect: 'newClimb', mode: 'run' },
    },
  },
  {
    name: 'PLAYING (run)',
    from: snap('PLAYING'),
    listed: {
      lockLost: { state: 'PAUSED', effect: 'pause' },
      hidden: { state: 'PAUSED', effect: 'pause' },
      blur: { state: 'PAUSED', effect: 'pause' },
      pauseKey: { state: 'PAUSED', effect: 'pause' },
      finish: { state: 'VICTORY', effect: 'victory' },
      killPlane: { state: 'PLAYING', effect: 'respawn' },
      contextLost: { state: 'PAUSED', effect: 'contextLost', contextLost: true },
    },
  },
  {
    name: 'PLAYING (freeRoam)',
    from: snap('PLAYING', { mode: 'freeRoam' }),
    listed: {
      lockLost: { state: 'PAUSED', effect: 'pause', mode: 'freeRoam' },
      hidden: { state: 'PAUSED', effect: 'pause', mode: 'freeRoam' },
      blur: { state: 'PAUSED', effect: 'pause', mode: 'freeRoam' },
      pauseKey: { state: 'PAUSED', effect: 'pause', mode: 'freeRoam' },
      killPlane: { state: 'PLAYING', effect: 'respawn', mode: 'freeRoam' },
      contextLost: { state: 'PAUSED', effect: 'contextLost', contextLost: true, mode: 'freeRoam' },
    },
  },
  {
    name: 'PAUSED',
    from: snap('PAUSED'),
    listed: {
      'enter:resume': { state: 'PLAYING', effect: 'resumeRun' },
      'enter:restart': { state: 'PLAYING', effect: 'restartRun', mode: 'run' },
      saveAndQuit: { state: 'MENU', effect: 'saveAndQuit' },
      contextLost: { state: 'PAUSED', effect: 'contextLost', contextLost: true },
    },
  },
  {
    name: 'PAUSED + overlay',
    from: snap('PAUSED', { contextLost: true }),
    listed: {
      contextLost: { state: 'PAUSED', effect: 'contextLost', contextLost: true },
      contextRestored: { state: 'PAUSED', effect: 'contextRestored', contextLost: false },
    },
  },
]

describe('TEST-35a state machine (G1 subset)', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      for (const e of allEvents()) {
        const k = key(e)
        const expected: Expect = c.listed[k] ?? 'ignored'
        it(`${k} → ${expected === 'ignored' ? 'ignored' : expected.state}`, () => {
          let result: ReturnType<typeof transition> | undefined
          expect(() => {
            result = transition(c.from, e)
          }).not.toThrow()
          if (expected === 'ignored') {
            expect(result).toBe('ignored')
            return
          }
          expect(result).not.toBe('ignored')
          const t = result as Exclude<typeof result, 'ignored' | undefined>
          expect(t.next.state).toBe(expected.state)
          expect(t.effect).toBe(expected.effect)
          expect(t.next.mode).toBe(expected.mode ?? c.from.mode)
          expect(t.next.contextLost).toBe(expected.contextLost ?? c.from.contextLost)
        })
      }
    })
  }

  it('every listed key is a real event (no typo in the table)', () => {
    const keys = new Set(allEvents().map(key))
    for (const c of CASES) for (const k of Object.keys(c.listed)) expect(keys.has(k), `${c.name}: ${k}`).toBe(true)
  })

  it('MENU → Play → PAUSED (each trigger) → Resume round trip', () => {
    for (const trigger of ['lockLost', 'hidden', 'blur', 'pauseKey'] as const) {
      let s: Snapshot = snap('MENU')
      for (const e of [{ type: 'enter', intent: 'play' }, { type: trigger }, { type: 'enter', intent: 'resume' }] as GameEvent[]) {
        const t = transition(s, e)
        expect(t, `${trigger}: ${key(e)}`).not.toBe('ignored')
        if (t !== 'ignored') s = t.next
      }
      expect(s.state).toBe('PLAYING')
    }
  })
})
