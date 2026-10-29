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
  /** Increments on every HUD sample (TEST-01 observes store changes while the model stays mounted). */
  tick: number
}

export type Toast = { id: number; text: string }

/** Overlay sub-screens of MENU and PAUSED. */
export type Panel = 'main' | 'settings' | 'controls' | 'credits' | 'confirmRestart'

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
}

export const useUi = create<UiStore>(() => ({
  snapshot: INITIAL_SNAPSHOT,
  worldReady: false,
  pendingIntent: null,
  hint: null,
  hud: { heightM: 0, targetM: 0, timerMs: 0, showTimer: true, sprintGlyph: false, tick: 0 },
  toasts: [],
  fadeAt: 0,
  panel: 'main',
}))
