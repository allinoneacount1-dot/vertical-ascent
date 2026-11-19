// UI-facing store (DIRECTIVE D-005). The overlay DOM reads it; the 3D subtree never subscribes to it.
// HUD values are written by the HUD sampler (useFrame priority 0) on a 10 Hz grid.
import { create } from 'zustand'
import { INITIAL_SNAPSHOT } from './state.ts'
import type { EnterIntent, Snapshot } from './state.ts'
import type { ZoneSplits } from './run.ts'
import { DEFAULT_MODIFIERS } from '../level/challenges.ts'
import type { ChallengeMode, ChallengeModifiers } from '../level/challenges.ts'
import type { HeroId } from '../character/heroes.ts'

export type Hud = {
  heightM: number
  targetM: number
  timerMs: number
  showTimer: boolean
  sprintGlyph: boolean
  lostM: number | null
  /** Wind Focus stamina 0..1 and active state (Tahap 1). */
  focusRatio: number
  focusActive: boolean
  /** Crosswind phase & shelter status (Tahap 2). */
  windPhase: 'calm' | 'telegraph' | 'gust'
  windSheltered: boolean
  /** Speedrun zone splits Z1–Z4 (Tahap 3). */
  splits: ZoneSplits
  /** Highest unlocked relaxed checkpoint label (e.g. '125 m'), or null. */
  checkpointLabel: string | null
  tick: number
}

export type Toast = { id: number; text: string }

export type Panel = 'main' | 'settings' | 'controls' | 'credits' | 'best' | 'confirmRestart' | 'confirmNewClimb'

export type SavedRunInfo = { heightM: number; timerMs: number }

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
  pendingIntent: EnterIntent | null
  hint: string | null
  hud: Hud
  toasts: Toast[]
  fadeAt: number
  panel: Panel
  savedRun: SavedRunInfo | null
  victory: VictoryInfo | null
  victoryLockedUntil: number
  uiScale: number
  lang: 'id' | 'en'
  usedActions: string[]
  summitRevealed: boolean
  challengeMode: ChallengeMode
  modifiers: ChallengeModifiers
  relicCount: number
  odysseyMode: boolean
  aetherLowG: boolean
  heroId: HeroId
}

export const useUi = create<UiStore>(() => ({
  snapshot: INITIAL_SNAPSHOT,
  worldReady: false,
  pendingIntent: null,
  hint: null,
  hud: {
    heightM: 0,
    targetM: 0,
    timerMs: 0,
    showTimer: true,
    sprintGlyph: false,
    lostM: null,
    focusRatio: 1,
    focusActive: false,
    windPhase: 'calm',
    windSheltered: false,
    splits: { z1: null, z2: null, z3: null, z4: null },
    checkpointLabel: null,
    bestHeightM: 0,
    tick: 0,
  },
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
  challengeMode: 'hardcore',
  modifiers: { ...DEFAULT_MODIFIERS },
  relicCount: 0,
  odysseyMode: false,
  aetherLowG: false,
  heroId: 'sora',
}))
