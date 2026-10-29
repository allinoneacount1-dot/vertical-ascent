// Game state machine (DIRECTIVE D-006, ref/02 §State table). Pure: no DOM, no React, no three.
// The only writer of the game state (ref/02 Pemilik besaran); src/game/store.ts holds the snapshot.

export const STATES = ['LOADING', 'ERROR', 'MENU', 'PLAYING', 'PAUSED', 'VICTORY'] as const
export type State = (typeof STATES)[number]
export type Mode = 'run' | 'freeRoam'

/**
 * Why enterPlaying() was called. PLAYING is entered only after pointerlockchange → canvas (D-004);
 * enterPlaying() then dispatches { type: 'enter', intent }.
 */
export const ENTER_INTENTS = ['play', 'continue', 'newClimb', 'resume', 'restart', 'replay', 'freeRoam'] as const
export type EnterIntent = (typeof ENTER_INTENTS)[number]

export type GameEvent =
  | { type: 'loaded'; worldReady: boolean }
  | { type: 'loadFailed'; url: string }
  | { type: 'contextCreationError' }
  | { type: 'enter'; intent: EnterIntent }
  | { type: 'lockLost' }
  | { type: 'hidden' }
  | { type: 'blur' }
  | { type: 'pauseKey' }
  | { type: 'finish' }
  | { type: 'killPlane' }
  | { type: 'contextLost' }
  | { type: 'contextRestored' }
  | { type: 'saveAndQuit' }
  | { type: 'menu' }

export type GameEventType = GameEvent['type']

/** Every event type, for exhaustive enumeration in tests (TEST-35a/35b). */
export const EVENT_TYPES: readonly GameEventType[] = [
  'loaded',
  'loadFailed',
  'contextCreationError',
  'enter',
  'lockLost',
  'hidden',
  'blur',
  'pauseKey',
  'finish',
  'killPlane',
  'contextLost',
  'contextRestored',
  'saveAndQuit',
  'menu',
]

export type Snapshot = Readonly<{
  state: State
  mode: Mode
  /** PAUSED + overlay after webglcontextlost, until webglcontextrestored. */
  contextLost: boolean
  /** URL that failed to load (ERROR only). */
  failedUrl: string | null
}>

/** Side effect the caller performs after a transition. */
export type Effect =
  | 'showMenu'
  | 'showError'
  | 'newRun'
  | 'continueRun'
  | 'newClimb'
  | 'resumeRun'
  | 'restartRun'
  | 'replayRun'
  | 'freeRoam'
  | 'pause'
  | 'victory'
  | 'respawn'
  | 'contextLost'
  | 'contextRestored'
  | 'saveAndQuit'
  | 'toMenu'

export type Transition = Readonly<{ next: Snapshot; effect: Effect }>

export const INITIAL_SNAPSHOT: Snapshot = Object.freeze({ state: 'LOADING', mode: 'run', contextLost: false, failedUrl: null })

const PAUSE_TRIGGERS: ReadonlySet<GameEventType> = new Set(['lockLost', 'hidden', 'blur', 'pauseKey'])

function to(s: Snapshot, patch: Partial<Snapshot>, effect: Effect): Transition {
  return { next: Object.freeze({ ...s, ...patch }), effect }
}

/**
 * Applies one event. Returns 'ignored' for every (state, event) pair not listed in ref/02 §State table.
 * Never throws.
 */
export function transition(s: Snapshot, e: GameEvent): Transition | 'ignored' {
  switch (s.state) {
    case 'LOADING':
      if (e.type === 'loaded') return e.worldReady ? to(s, { state: 'MENU' }, 'showMenu') : 'ignored'
      if (e.type === 'loadFailed') return to(s, { state: 'ERROR', failedUrl: e.url }, 'showError')
      if (e.type === 'contextCreationError') return to(s, { state: 'ERROR', failedUrl: null }, 'showError')
      return 'ignored'

    case 'MENU':
      if (e.type === 'enter') {
        if (e.intent === 'play') return to(s, { state: 'PLAYING', mode: 'run' }, 'newRun')
        if (e.intent === 'continue') return to(s, { state: 'PLAYING', mode: 'run' }, 'continueRun')
        if (e.intent === 'newClimb') return to(s, { state: 'PLAYING', mode: 'run' }, 'newClimb')
      }
      return 'ignored'

    case 'PLAYING':
      if (PAUSE_TRIGGERS.has(e.type)) return to(s, { state: 'PAUSED' }, 'pause')
      if (e.type === 'finish') return s.mode === 'run' ? to(s, { state: 'VICTORY' }, 'victory') : 'ignored'
      if (e.type === 'killPlane') return to(s, {}, 'respawn')
      if (e.type === 'contextLost') return to(s, { state: 'PAUSED', contextLost: true }, 'contextLost')
      return 'ignored'

    case 'PAUSED':
      if (e.type === 'contextLost') return to(s, { contextLost: true }, 'contextLost')
      if (e.type === 'contextRestored') return s.contextLost ? to(s, { contextLost: false }, 'contextRestored') : 'ignored'
      if (s.contextLost) return 'ignored'
      if (e.type === 'enter') {
        if (e.intent === 'resume') return to(s, { state: 'PLAYING' }, 'resumeRun')
        if (e.intent === 'restart') return to(s, { state: 'PLAYING', mode: 'run' }, 'restartRun')
      }
      if (e.type === 'saveAndQuit') return to(s, { state: 'MENU' }, 'saveAndQuit')
      return 'ignored'

    case 'VICTORY':
      if (e.type === 'enter') {
        if (e.intent === 'replay') return to(s, { state: 'PLAYING', mode: 'run' }, 'replayRun')
        if (e.intent === 'freeRoam') return to(s, { state: 'PLAYING', mode: 'freeRoam' }, 'freeRoam')
      }
      if (e.type === 'menu') return to(s, { state: 'MENU', mode: 'run' }, 'toMenu')
      return 'ignored'

    case 'ERROR':
      return 'ignored'
  }
}

/** Which intents enterPlaying() may request from a given snapshot (UI uses this to decide whether to lock). */
export function canEnter(s: Snapshot, intent: EnterIntent): boolean {
  return transition(s, { type: 'enter', intent }) !== 'ignored'
}
