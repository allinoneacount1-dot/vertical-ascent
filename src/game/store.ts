// UI-facing store (DIRECTIVE D-005). The overlay DOM reads it; the 3D subtree never subscribes to it.
// HUD values are written by the HUD sampler (useFrame priority 0) on a 10 Hz grid.
import { create } from 'zustand'
import { INITIAL_SNAPSHOT } from './state.ts'
import type { EnterIntent, Snapshot } from './state.ts'

export type Hud = {
  heightM: number
  targetM: number
  timerMs: number
  showTimer: boolean
  /** Sprint glyph shown while sprint is active in Toggle/Always mode (D-010). */
  sprintGlyph: boolean
  /** Lost meters shown briefly on HUD after a big fall (TEST-12b). */
  lostM: number | null
  /** Increments on every HUD sample (TEST-01 observes store changes while the model stays mounted). */
  tick: number
}

export type Toast = { id: number; text: string }

/** Overlay sub-screens of MENU and PAUSED. */
export type Panel = 'main' | 'settings' | 'controls' | 'credits' | 'best' | 'confirmRestart' | 'confirmNewClimb'

/** Summary of a saved climb for the MENU Continue button (D-009). */
export type SavedRunInfo = { heightM: number; timerMs: number }

/** VICTORY summary (D-023); mirrors game.ts VictorySummary. */
export type VictoryInfo = {
  timerMs: number
  newBest: boolean
  deltaMs: number | null
  bigFalls: number
  metersLost: number
  killPlaneRespawns: number
  restarts: number
}

export type UiStore = {
  snapshot: Snapshot
  worldReady: boolean
  /** enterPlaying() asked for pointer lock and waits for pointerlockchange → canvas. */
  pendingIntent: EnterIntent | null
  /** "Click again" hint after a rejected pointer lock request (D-004). */
  hint: string | null
  hud: Hud
  toasts: Toast[]
  /** performance.now() of the last kill-plane respawn (300 ms fade, D-007), or 0 */
  fadeAt: number
  panel: Panel
  savedRun: SavedRunInfo | null
  victory: VictoryInfo | null
  /** performance.now() until which the victory buttons stay disabled (D-023). */
  victoryLockedUntil: number
  /** UI scale 1–2 (D-021) and the UI language (overlay re-renders on change). */
  uiScale: number
  lang: 'id' | 'en'
  /** Actions used at least once this page session (the first-run controls strip fades them out, D-021). */
  usedActions: string[]
  /** Real summit revealed: its beacon is lit and the fake one is out (ref/03 §Puncak palsu). */
  summitRevealed: boolean
}

export const useUi = create<UiStore>(() => ({
  snapshot: INITIAL_SNAPSHOT,
  worldReady: false,
  pendingIntent: null,
  hint: null,
  hud: { heightM: 0, targetM: 0, timerMs: 0, showTimer: true, sprintGlyph: false, lostM: null, tick: 0 },
  toasts: [],
  fadeAt: 0,
  panel: 'main',
  savedRun: null,
  victory: null,
  victoryLockedUntil: 0,
  uiScale: 1,
  lang: 'en',
  usedActions: [],
  summitRevealed: false,
}))
