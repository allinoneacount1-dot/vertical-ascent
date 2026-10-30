// TEST-35a (G1 subset of ref/02 §State table): MENU → Play, PLAYING → PAUSED (4 triggers), PAUSED → Resume,
// kill plane, plus every other event on MENU, PLAYING and PAUSED → listed target or 'ignored'; 0 throws.
// TEST-35b (G3, the whole ref/02 §State table, DIRECTIVE §7 row 35b): every reachable snapshot (each "Dari" row incl.
// PAUSED + overlay, in each reachable mode) × every event type × every enter intent → the listed target and effect, or
// 'ignored'; 0 throws. Both expectation tables below are written from ref/02, independently of src/game/state.ts.
import { describe, expect, it } from 'vitest'
import { canEnter, ENTER_INTENTS, EVENT_TYPES, INITIAL_SNAPSHOT, STATES, transition } from './state.ts'
import type { Effect, EnterIntent, GameEvent, GameEventType, Mode, Snapshot, State, Transition } from './state.ts'

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

// ---------------------------------------------------------------------------------------------------------------------
// TEST-35b: the whole ref/02 §State table (G3).

/** The ref/02 trigger behind each event type. A Record, so a GameEventType added without a table reading fails tsc. */
const EVENT_SOURCE: Record<GameEventType, string> = {
  loaded: 'required assets ready (worldReady true or false)',
  loadFailed: 'required asset failed',
  contextCreationError: 'webglcontextcreationerror',
  enter: 'enterPlaying() after pointerlockchange → canvas, one event per intent',
  lockLost: 'pointerlockchange → null',
  hidden: 'visibilitychange → hidden',
  blur: 'blur',
  pauseKey: 'P',
  finish: 'inFinish && isGroundedRaw in the same step',
  killPlane: 'kill plane',
  contextLost: 'webglcontextlost',
  contextRestored: 'webglcontextrestored',
  saveAndQuit: 'Save & quit to menu',
  menu: 'VICTORY Menu',
}

/** The ref/02 button behind each enterPlaying() intent. */
const INTENT_SOURCE: Record<EnterIntent, string> = {
  play: 'MENU Play',
  continue: 'MENU Continue',
  newClimb: 'MENU New climb',
  resume: 'PAUSED Resume (also the Resume after webglcontextrestored)',
  restart: 'PAUSED Restart',
  replay: 'VICTORY Replay',
  freeRoam: 'VICTORY Free roam',
}

/** The url allEvents() sends with loadFailed; ERROR keeps it to show the failed URL (ref/02 LOADING row). */
const FAILED_URL: string = allEvents().flatMap((e) => (e.type === 'loadFailed' ? [e.url] : []))[0]

const MODES: readonly Mode[] = ['run', 'freeRoam']

/** "Dari" column of ref/02. PAUSED + overlay = PAUSED with contextLost (after webglcontextlost, until restored). */
type From = State | 'PAUSED + overlay'
const fromOf = (s: Snapshot): From => (s.state === 'PAUSED' && s.contextLost ? 'PAUSED + overlay' : s.state)

type Target = Readonly<{
  state: State
  effect: Effect
  /** Omitted: unchanged. 'unspecified': ref/02 gives no mode for this target (mode only matters in PLAYING/PAUSED). */
  mode?: Mode | 'unspecified'
  /** Omitted: unchanged. true = the PAUSED overlay is up. */
  contextLost?: boolean
  /** Omitted: unchanged. */
  failedUrl?: string | null
}>

/** One ref/02 row. `note` is the row ("Dari | Event | Ke"); `on` the allEvents() keys it covers. */
type Row = Readonly<{ note: string; from: From; on: readonly string[]; onlyMode?: Mode; to: Target }>

/** ref/02 §State table, row by row. Every (state, event) pair not matched here must be 'ignored'. */
const ROWS: readonly Row[] = [
  {
    note: 'LOADING | required assets ready and worldReady | MENU',
    from: 'LOADING',
    on: ['loaded:true'],
    to: { state: 'MENU', effect: 'showMenu' },
  },
  {
    note: 'LOADING | required asset failed | ERROR (show the failed URL; reload only)',
    from: 'LOADING',
    on: ['loadFailed'],
    to: { state: 'ERROR', effect: 'showError', failedUrl: FAILED_URL },
  },
  {
    note: 'LOADING | webglcontextcreationerror | ERROR (reload only)',
    from: 'LOADING',
    on: ['contextCreationError'],
    to: { state: 'ERROR', effect: 'showError', failedUrl: null },
  },
  {
    note: 'MENU | Play (no saved run) | PLAYING via enterPlaying() (new run)',
    from: 'MENU',
    on: ['enter:play'],
    to: { state: 'PLAYING', effect: 'newRun', mode: 'run' },
  },
  {
    note: 'MENU | Continue (va.run.v1 valid) | PLAYING via enterPlaying() (run continued)',
    from: 'MENU',
    on: ['enter:continue'],
    to: { state: 'PLAYING', effect: 'continueRun', mode: 'run' },
  },
  {
    note: 'MENU | New climb | PLAYING via enterPlaying() (new run, old save deleted)',
    from: 'MENU',
    on: ['enter:newClimb'],
    to: { state: 'PLAYING', effect: 'newClimb', mode: 'run' },
  },
  {
    note: 'PLAYING | pointerlockchange → null / visibilitychange → hidden / blur / P | PAUSED',
    from: 'PLAYING',
    on: ['lockLost', 'hidden', 'blur', 'pauseKey'],
    to: { state: 'PAUSED', effect: 'pause' },
  },
  {
    note: 'PLAYING | inFinish && isGroundedRaw in the same step, mode run | VICTORY',
    from: 'PLAYING',
    on: ['finish'],
    onlyMode: 'run',
    to: { state: 'VICTORY', effect: 'victory' },
  },
  {
    note: 'PLAYING | kill plane | PLAYING (respawn, same run)',
    from: 'PLAYING',
    on: ['killPlane'],
    to: { state: 'PLAYING', effect: 'respawn' },
  },
  {
    note: 'PLAYING | webglcontextlost | PAUSED + overlay',
    from: 'PLAYING',
    on: ['contextLost'],
    to: { state: 'PAUSED', effect: 'contextLost', contextLost: true },
  },
  {
    note: 'PAUSED | Resume | PLAYING via enterPlaying()',
    from: 'PAUSED',
    on: ['enter:resume'],
    to: { state: 'PLAYING', effect: 'resumeRun' },
  },
  {
    note: 'PAUSED | Restart | PLAYING via enterPlaying() (new run)',
    from: 'PAUSED',
    on: ['enter:restart'],
    to: { state: 'PLAYING', effect: 'restartRun', mode: 'run' },
  },
  {
    note: 'PAUSED | Save & quit to menu | MENU (run kept, timer frozen, written to va.run.v1)',
    from: 'PAUSED',
    on: ['saveAndQuit'],
    to: { state: 'MENU', effect: 'saveAndQuit', mode: 'unspecified' },
  },
  {
    note: 'PAUSED | webglcontextlost | PAUSED + overlay',
    from: 'PAUSED',
    on: ['contextLost'],
    to: { state: 'PAUSED', effect: 'contextLost', contextLost: true },
  },
  {
    // Same reading as TEST-35a: the PAUSED webglcontextlost row still holds while the overlay is up (idempotent).
    note: 'PAUSED | webglcontextlost | PAUSED + overlay (overlay already up)',
    from: 'PAUSED + overlay',
    on: ['contextLost'],
    to: { state: 'PAUSED', effect: 'contextLost', contextLost: true },
  },
  {
    // "webglcontextrestored, then click Resume": restored drops the overlay; Resume is then the PAUSED Resume row.
    note: 'PAUSED + overlay | webglcontextrestored, then Resume | PLAYING via enterPlaying()',
    from: 'PAUSED + overlay',
    on: ['contextRestored'],
    to: { state: 'PAUSED', effect: 'contextRestored', contextLost: false },
  },
  {
    note: 'VICTORY | Replay | PLAYING via enterPlaying() (new run)',
    from: 'VICTORY',
    on: ['enter:replay'],
    to: { state: 'PLAYING', effect: 'replayRun', mode: 'run' },
  },
  {
    note: 'VICTORY | Free roam | PLAYING via enterPlaying() (mode freeRoam)',
    from: 'VICTORY',
    on: ['enter:freeRoam'],
    to: { state: 'PLAYING', effect: 'freeRoam', mode: 'freeRoam' },
  },
  {
    note: 'VICTORY | Menu | MENU',
    from: 'VICTORY',
    on: ['menu'],
    to: { state: 'MENU', effect: 'toMenu', mode: 'unspecified' },
  },
  // ERROR | — | reload only: no row, so every event on ERROR is ignored.
]

/** Every snapshot the machine can reach; the breadth-first walk below proves none is missing. Frozen: no mutation. */
const SNAPSHOTS: ReadonlyArray<Readonly<{ name: string; s: Snapshot }>> = [
  { name: 'LOADING', s: snap('LOADING') },
  { name: 'ERROR (failed URL)', s: snap('ERROR', { failedUrl: FAILED_URL }) },
  { name: 'ERROR (context creation)', s: snap('ERROR') },
  { name: 'MENU', s: snap('MENU') },
  { name: 'MENU (after free-roam Save & quit)', s: snap('MENU', { mode: 'freeRoam' }) },
  { name: 'PLAYING (run)', s: snap('PLAYING') },
  { name: 'PLAYING (freeRoam)', s: snap('PLAYING', { mode: 'freeRoam' }) },
  { name: 'PAUSED (run)', s: snap('PAUSED') },
  { name: 'PAUSED (freeRoam)', s: snap('PAUSED', { mode: 'freeRoam' }) },
  { name: 'PAUSED + overlay (run)', s: snap('PAUSED', { contextLost: true }) },
  { name: 'PAUSED + overlay (freeRoam)', s: snap('PAUSED', { mode: 'freeRoam', contextLost: true }) },
  { name: 'VICTORY', s: snap('VICTORY') },
].map(({ name, s }) => Object.freeze({ name, s: Object.freeze(s) }))

function matchingRows(s: Snapshot, e: GameEvent): Row[] {
  const k = key(e)
  const from = fromOf(s)
  return ROWS.filter((r) => r.from === from && r.on.includes(k) && (r.onlyMode === undefined || r.onlyMode === s.mode))
}

function expectedFor(s: Snapshot, e: GameEvent): Target | 'ignored' {
  return matchingRows(s, e)[0]?.to ?? 'ignored'
}

/** null when `got` is exactly the expected target (state, effect, mode, overlay, failed URL) or 'ignored'. */
function compare(from: Snapshot, exp: Target | 'ignored', got: Transition | 'ignored'): string | null {
  if (exp === 'ignored') return got === 'ignored' ? null : `expected ignored, got ${got.next.state}/${got.effect}`
  if (got === 'ignored') return `expected ${exp.state}/${exp.effect}, got ignored`
  const want = {
    state: exp.state,
    effect: exp.effect,
    mode:
      exp.mode === 'unspecified' ? (MODES.includes(got.next.mode) ? got.next.mode : 'run | freeRoam') : (exp.mode ?? from.mode),
    contextLost: exp.contextLost ?? from.contextLost,
    failedUrl: exp.failedUrl === undefined ? from.failedUrl : exp.failedUrl,
  }
  const have = {
    state: got.next.state,
    effect: got.effect,
    mode: got.next.mode,
    contextLost: got.next.contextLost,
    failedUrl: got.next.failedUrl,
  }
  const [w, h] = [JSON.stringify(want), JSON.stringify(have)]
  return w === h ? null : `expected ${w}, got ${h}`
}

/** [event key, effect or 'ignored', state after, mode after?, overlay after?] */
type Step = readonly [event: string, effect: Effect | 'ignored', state: State, mode?: Mode, overlay?: boolean]

const EVENT_BY_KEY = new Map(allEvents().map((e) => [key(e), e]))

function walk(name: string, start: Snapshot, steps: readonly Step[]): void {
  let s = start
  steps.forEach(([k, effect, state, mode, overlay], i) => {
    const label = `${name}, step ${i}: ${k} on ${s.state}`
    const e = EVENT_BY_KEY.get(k)
    expect(e, `${label}: unknown event key`).toBeDefined()
    const t = transition(s, e as GameEvent)
    if (effect === 'ignored') expect(t, label).toBe('ignored')
    else {
      expect(t, label).not.toBe('ignored')
      if (t !== 'ignored') {
        expect(t.effect, label).toBe(effect)
        s = t.next
      }
    }
    expect(s.state, label).toBe(state)
    if (mode !== undefined) expect(s.mode, label).toBe(mode)
    if (overlay !== undefined) expect(s.contextLost, label).toBe(overlay)
  })
}

describe('TEST-35b state machine (whole ref/02 table)', () => {
  it('TEST-35b full table', () => {
    const events = allEvents()
    const pairs = new Set<string>()
    const mismatches: string[] = []
    let cases = 0
    let throws = 0
    for (const { name, s } of SNAPSHOTS) {
      for (const e of events) {
        cases++
        pairs.add(`${fromOf(s)} × ${e.type}`)
        let got: Transition | 'ignored'
        try {
          got = transition(s, e)
        } catch (err) {
          throws++
          mismatches.push(`${name} + ${key(e)}: threw ${String(err)}`)
          continue
        }
        const diff = compare(s, expectedFor(s, e), got)
        if (diff !== null) mismatches.push(`${name} + ${key(e)}: ${diff}`)
      }
    }
    // stdout, not console.log: under an agent env Vitest picks the minimal reporter, which hides passed tests' console.
    // Reached through globalThis because tsconfig.app.json has no node types.
    const stdout = (globalThis as unknown as { process?: { stdout?: { write(text: string): unknown } } }).process?.stdout
    const print = (text: string): unknown => (stdout ? stdout.write(text) : console.log(text.trimEnd()))
    print(
      `TEST-35b full table: ${pairs.size} (state, event) pairs checked = ${STATES.length} states + PAUSED + overlay` +
        ` × ${EVENT_TYPES.length} event types; ${cases} (snapshot, event) cases = ${SNAPSHOTS.length} snapshots` +
        ` × ${events.length} events (${ENTER_INTENTS.length} enter intents, loaded with worldReady true and false);` +
        ` throws ${throws}; mismatches ${mismatches.length}\n`,
    )
    expect(pairs.size).toBe((STATES.length + 1) * EVENT_TYPES.length)
    expect(throws).toBe(0)
    expect(mismatches).toEqual([])
  })

  it('table sanity: event types and intents match ref/02, no typo, no duplicate match, no dead row', () => {
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length)
    expect([...EVENT_TYPES].sort()).toEqual(Object.keys(EVENT_SOURCE).sort())
    expect(new Set(ENTER_INTENTS).size).toBe(ENTER_INTENTS.length)
    expect([...ENTER_INTENTS].sort()).toEqual(Object.keys(INTENT_SOURCE).sort())
    const keys = new Set(allEvents().map(key))
    for (const r of ROWS) for (const k of r.on) expect(keys.has(k), `${r.note}: ${k}`).toBe(true)
    for (const st of STATES) expect(SNAPSHOTS.some(({ s }) => s.state === st), st).toBe(true)
    expect(SNAPSHOTS.some(({ s }) => fromOf(s) === 'PAUSED + overlay')).toBe(true)
    for (const { name, s } of SNAPSHOTS)
      for (const e of allEvents()) expect(matchingRows(s, e).length, `${name} + ${key(e)}`).toBeLessThanOrEqual(1)
    for (const r of ROWS)
      expect(SNAPSHOTS.some(({ s }) => allEvents().some((e) => matchingRows(s, e)[0] === r)), r.note).toBe(true)
  })

  it('every snapshot reachable from INITIAL_SNAPSHOT is enumerated', () => {
    const sk = (s: Snapshot): string => `${s.state}|${s.mode}|${s.contextLost}|${s.failedUrl}`
    const listed = new Set(SNAPSHOTS.map(({ s }) => sk(s)))
    const seen = new Set([sk(INITIAL_SNAPSHOT)])
    const queue: Snapshot[] = [INITIAL_SNAPSHOT]
    for (let s = queue.shift(); s !== undefined; s = queue.shift()) {
      for (const e of allEvents()) {
        const t = transition(s, e)
        if (t !== 'ignored' && !seen.has(sk(t.next))) {
          seen.add(sk(t.next))
          queue.push(t.next)
        }
      }
    }
    expect([...seen].filter((k) => !listed.has(k))).toEqual([])
  })

  it('canEnter() agrees with the table for every snapshot and intent', () => {
    for (const { name, s } of SNAPSHOTS)
      for (const intent of ENTER_INTENTS)
        expect(canEnter(s, intent), `${name}: ${intent}`).toBe(expectedFor(s, { type: 'enter', intent }) !== 'ignored')
  })

  it('PAUSED + overlay: Resume only after webglcontextrestored, mode kept', () => {
    for (const mode of MODES)
      walk(`overlay (${mode})`, snap('PLAYING', { mode }), [
        ['contextLost', 'contextLost', 'PAUSED', mode, true],
        ['enter:resume', 'ignored', 'PAUSED', mode, true],
        ['enter:restart', 'ignored', 'PAUSED', mode, true],
        ['saveAndQuit', 'ignored', 'PAUSED', mode, true],
        ['contextRestored', 'contextRestored', 'PAUSED', mode, false],
        ['contextRestored', 'ignored', 'PAUSED', mode, false],
        ['enter:resume', 'resumeRun', 'PLAYING', mode, false],
      ])
  })

  it('ERROR: reached from both LOADING failures, then only reload (every event ignored)', () => {
    for (const failure of ['loadFailed', 'contextCreationError'])
      walk(`ERROR via ${failure}`, snap('LOADING'), [
        [failure, 'showError', 'ERROR'],
        ...allEvents().map((e): Step => [key(e), 'ignored', 'ERROR']),
      ])
  })

  it('one climb through MENU Play/Continue/New climb, PAUSED Save & quit, VICTORY Replay/Free roam/Menu', () => {
    walk('climb', INITIAL_SNAPSHOT, [
      ['loaded:false', 'ignored', 'LOADING'],
      ['loaded:true', 'showMenu', 'MENU'],
      ['enter:play', 'newRun', 'PLAYING', 'run'],
      ['lockLost', 'pause', 'PAUSED', 'run'],
      ['enter:resume', 'resumeRun', 'PLAYING', 'run'],
      ['killPlane', 'respawn', 'PLAYING', 'run'],
      ['contextLost', 'contextLost', 'PAUSED', 'run', true],
      ['contextRestored', 'contextRestored', 'PAUSED', 'run', false],
      ['saveAndQuit', 'saveAndQuit', 'MENU'],
      ['enter:continue', 'continueRun', 'PLAYING', 'run'],
      ['pauseKey', 'pause', 'PAUSED', 'run'],
      ['contextLost', 'contextLost', 'PAUSED', 'run', true],
      ['contextRestored', 'contextRestored', 'PAUSED', 'run', false],
      ['enter:restart', 'restartRun', 'PLAYING', 'run'],
      ['finish', 'victory', 'VICTORY'],
      ['enter:freeRoam', 'freeRoam', 'PLAYING', 'freeRoam'],
      ['finish', 'ignored', 'PLAYING', 'freeRoam'],
      ['hidden', 'pause', 'PAUSED', 'freeRoam'],
      ['enter:resume', 'resumeRun', 'PLAYING', 'freeRoam'],
      ['blur', 'pause', 'PAUSED', 'freeRoam'],
      ['enter:restart', 'restartRun', 'PLAYING', 'run'],
      ['finish', 'victory', 'VICTORY'],
      ['enter:replay', 'replayRun', 'PLAYING', 'run'],
      ['finish', 'victory', 'VICTORY'],
      ['menu', 'toMenu', 'MENU'],
      ['enter:newClimb', 'newClimb', 'PLAYING', 'run'],
    ])
  })
})
