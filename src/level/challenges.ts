// Only Up! × Ghibli Challenge Mechanics registry & runtime state (Tahap 1–3):
// - Bounce canopies (z1) & spring mushrooms (z2–z3) cutting 12–25 m with surface-normal launch
// - Crumbling Laputa ruins (z3) with 1.2 s telegraph & 5.0 s auto-respawn
// - Slippery tilted wet roofs (z1) & ice/marble pillars (z4) with 35% reduced friction & slide > 18°
// - Wind Focus (0.45x slow-mo, 2.5 s max stamina)
// - Cable gondolas (z2–z3), rotating wooden windmill blades (z2), copper steam pipes (z2)
// - Crosswind Gusts (z4, or everywhere with Badai Konstan): 1.0 s telegraph + 2.2 s lateral push
// - Partial Catch Decks at zone transitions (125 m, 250 m, 375 m) & Sky Balloon mega-skip (z3→z4)
import { Euler, Quaternion, Vector3 } from 'three'
import type { Motion, Vec3 } from './motion.ts'

export type ChallengeKind =
  | 'bounce'
  | 'crumbling'
  | 'slippery'
  | 'gondola'
  | 'windmill'
  | 'steamPipe'
  | 'catchDeck'
  | 'skyBalloon'

export type ChallengeSpec = {
  id: string
  zone: 'z1' | 'z2' | 'z3' | 'z4'
  kind: ChallengeKind
  /** Visual variant for Ghibli styling */
  style: 'canopy' | 'mushroom' | 'ruin' | 'roof' | 'ice' | 'gondola' | 'windmill' | 'steamPipe' | 'catchDeck' | 'balloon'
  pos: Vec3
  size: Vec3
  rotY?: number
  /** Tilt around local X (rad). Positive tilts surface forward. */
  rotX?: number
  /** Bounce launch speed (m/s) along surface normal (22–32 m/s → 12–25 m apex). */
  bounceSpeed?: number
  /** Kinematic motion for gondolas, windmills, and sky balloons. */
  motion?: Motion
  /** Steam pipe periodic jet config (seconds). */
  steamCycleS?: number
  steamPhaseS?: number
  steamDir?: Vec3
}

const DEG = Math.PI / 180

/** All Only Up! × Ghibli challenge specs placed alongside the 500 m course without occluding TEST-37 sightlines. */
export const CHALLENGE_SPECS: readonly ChallengeSpec[] = [
  // ---- Tahap 1: Bounce Canopies (z1) & Spring Mushrooms (z2–z3) ----
  {
    id: 'z1-bounce-canopy-plaza',
    zone: 'z1',
    kind: 'bounce',
    style: 'canopy',
    pos: [-5.0, 0.45, 4.5],
    size: [3.6, 0.7, 3.6],
    rotY: 0.25,
    rotX: 0.14,
    bounceSpeed: 23.5, // ~13.8 m jump
  },
  {
    id: 'z1-bounce-canopy-mid',
    zone: 'z1',
    kind: 'bounce',
    style: 'canopy',
    pos: [-19.5, 10.2, 5.5],
    size: [3.6, 0.7, 3.6],
    rotY: -0.4,
    rotX: 0.16,
    bounceSpeed: 26.5, // ~17.5 m shortcut
  },
  {
    id: 'z1-bounce-canopy-high',
    zone: 'z1',
    kind: 'bounce',
    style: 'canopy',
    pos: [-6.5, 30.8, -45.2],
    size: [3.6, 0.7, 3.6],
    rotY: 0.6,
    rotX: 0.12,
    bounceSpeed: 29.0, // ~21 m shortcut toward z1 top
  },
  {
    id: 'z2-bounce-mushroom-1',
    zone: 'z2',
    kind: 'bounce',
    style: 'mushroom',
    pos: [-27.5, 100.2, 2.2],
    size: [3.8, 0.8, 3.8],
    rotY: 0,
    rotX: 0.1,
    bounceSpeed: 28.5, // ~20.3 m shortcut
  },
  {
    id: 'z3-bounce-mushroom-2',
    zone: 'z3',
    kind: 'bounce',
    style: 'mushroom',
    pos: [9.5, 213.6, 29.2],
    size: [3.8, 0.8, 3.8],
    rotY: 0.3,
    rotX: 0.12,
    bounceSpeed: 31.0, // ~24 m Laputa shortcut
  },

  // ---- Tahap 1: Crumbling Laputa Ruins (z3) ----
  {
    id: 'z3-crumble-1',
    zone: 'z3',
    kind: 'crumbling',
    style: 'ruin',
    pos: [14.0, 218.0, 24.0],
    size: [3.2, 0.8, 3.2],
  },
  {
    id: 'z3-crumble-2',
    zone: 'z3',
    kind: 'crumbling',
    style: 'ruin',
    pos: [19.0, 221.0, 19.0],
    size: [3.2, 0.8, 3.2],
  },
  {
    id: 'z3-crumble-3',
    zone: 'z3',
    kind: 'crumbling',
    style: 'ruin',
    pos: [-45.5, 256.0, -14.3],
    size: [3.2, 0.8, 3.2],
  },
  {
    id: 'z3-crumble-4',
    zone: 'z3',
    kind: 'crumbling',
    style: 'ruin',
    pos: [29.0, 301.0, -72.5],
    size: [3.2, 0.8, 3.2],
  },

  // ---- Tahap 1: Slippery & Tilted Surfaces (z1 wet clay roofs, z4 wet marble/ice pillars) ----
  {
    id: 'z1-slip-roof-1',
    zone: 'z1',
    kind: 'slippery',
    style: 'roof',
    pos: [-8.5, 1.4, -7.5],
    size: [4.2, 0.7, 6.0],
    rotY: 0,
    rotX: 20 * DEG, // > 18° slope
  },
  {
    id: 'z1-slip-roof-2',
    zone: 'z1',
    kind: 'slippery',
    style: 'roof',
    pos: [16.5, 56.2, -7.2],
    size: [4.0, 0.7, 5.5],
    rotY: 0.4,
    rotX: 21 * DEG,
  },
  {
    id: 'z4-slip-ice-1',
    zone: 'z4',
    kind: 'slippery',
    style: 'ice',
    pos: [-68.0, 421.0, -47.2],
    size: [3.8, 0.8, 5.8],
    rotY: 0.2,
    rotX: 21 * DEG,
  },
  {
    id: 'z4-slip-ice-2',
    zone: 'z4',
    kind: 'slippery',
    style: 'ice',
    pos: [71.5, 466.0, -96.5],
    size: [3.8, 0.8, 5.8],
    rotY: -0.35,
    rotX: 22 * DEG,
  },

  // ---- Tahap 2: Cable Gondolas (z2–z3) ----
  {
    id: 'z2-gondola-1',
    zone: 'z2',
    kind: 'gondola',
    style: 'gondola',
    pos: [25.0, 64.0, 12.0],
    size: [3.6, 0.6, 3.6],
    motion: {
      type: 'linear',
      points: [
        [0, 0, 0],
        [10, 12, -16],
        [20, 26, -28],
      ],
      periodS: 16,
      phaseS: 0,
      dwellS: 2.0,
    },
  },
  {
    id: 'z3-gondola-1',
    zone: 'z3',
    kind: 'gondola',
    style: 'gondola',
    pos: [-42.0, 255.0, -20.0],
    size: [3.6, 0.6, 3.6],
    motion: {
      type: 'linear',
      points: [
        [0, 0, 0],
        [18, 16, -22],
        [34, 34, -44],
      ],
      periodS: 20,
      phaseS: 3,
      dwellS: 2.2,
    },
  },

  // ---- Tahap 2: Rotating Wooden Windmill Blades (z2) ----
  {
    id: 'z2-windmill-blade-1',
    zone: 'z2',
    kind: 'windmill',
    style: 'windmill',
    pos: [41.7, 161.2, -47.0],
    size: [11.0, 0.6, 2.4],
    motion: {
      type: 'rotate',
      points: [],
      axis: [0, 1, 0],
      periodS: 10,
      phaseS: 0,
      dwellS: 0,
    },
  },
  {
    id: 'z2-windmill-blade-2',
    zone: 'z2',
    kind: 'windmill',
    style: 'windmill',
    pos: [41.7, 161.2, -47.0],
    size: [11.0, 0.6, 2.4],
    rotY: Math.PI / 2,
    motion: {
      type: 'rotate',
      points: [],
      axis: [0, 1, 0],
      periodS: 10,
      phaseS: 0,
      dwellS: 0,
    },
  },

  // ---- Tahap 2: Narrow Copper Steam Pipes (z2, ~0.45 m visual / 0.5 m collider) ----
  {
    id: 'z2-steam-pipe-1',
    zone: 'z2',
    kind: 'steamPipe',
    style: 'steamPipe',
    pos: [-32.0, 127.0, -61.0],
    size: [0.5, 0.5, 9.0],
    rotY: 0.15,
    steamCycleS: 5.2,
    steamPhaseS: 0,
    steamDir: [1, 0.35, 0],
  },
  {
    id: 'z2-steam-pipe-2',
    zone: 'z2',
    kind: 'steamPipe',
    style: 'steamPipe',
    pos: [-27.0, 128.5, -54.0],
    size: [0.5, 0.5, 9.0],
    rotY: -0.25,
    steamCycleS: 5.2,
    steamPhaseS: 2.6,
    steamDir: [-1, 0.35, 0],
  },

  // ---- Tahap 3: Partial Catch Decks at Zone Transitions (125 m, 250 m, 375 m) ----
  {
    id: 'catch-deck-125',
    zone: 'z2',
    kind: 'catchDeck',
    style: 'catchDeck',
    pos: [-46.0, 124.8, -66.8],
    size: [14.0, 1.0, 14.0],
  },
  {
    id: 'catch-deck-250',
    zone: 'z3',
    kind: 'catchDeck',
    style: 'catchDeck',
    pos: [-51.2, 249.8, -14.3],
    size: [14.0, 1.0, 14.0],
  },
  {
    id: 'catch-deck-375',
    zone: 'z4',
    kind: 'catchDeck',
    style: 'catchDeck',
    pos: [-13.5, 374.8, 55.8],
    size: [14.0, 1.0, 14.0],
  },

  // ---- Tahap 3: Sky Balloon / Kite Mega-Skip (z3 → z4 toward 500 m summit) ----
  {
    id: 'z3-z4-sky-balloon',
    zone: 'z3',
    kind: 'skyBalloon',
    style: 'balloon',
    pos: [64.0, 340.5, 14.0],
    size: [4.2, 0.7, 4.2],
    motion: {
      type: 'linear',
      points: [
        [0, 0, 0],
        [4, 72, -14],
        [8, 147, -30], // rises from 340.5 m to 487.5 m near the 500 m summit!
      ],
      periodS: 44,
      phaseS: 0,
      dwellS: 4.5,
    },
  },
]

export const CRUMBLE_TELEGRAPH_S = 1.2
export const CRUMBLE_RESPAWN_S = 5.0
export const FOCUS_MAX_S = 2.5
export const FOCUS_TIME_SCALE = 0.45
export const FOCUS_RECHARGE_RATE = 0.55
export const CROSSWIND_CALM_S = 4.5
export const CROSSWIND_TELEGRAPH_S = 1.0
export const CROSSWIND_ACTIVE_S = 2.2
export const CROSSWIND_ACCEL = 10.5
export const SLIPPERY_SLOPE_MIN_RAD = 18 * DEG

export type CrumbleState = {
  phase: 'solid' | 'shaking' | 'collapsed'
  timer: number
  crackedPlayed: boolean
}

export type SteamState = {
  phase: 'idle' | 'hiss' | 'blast'
  intensity: number
  lastPhase: 'idle' | 'hiss' | 'blast'
}

export type CrosswindSnapshot = {
  phase: 'calm' | 'telegraph' | 'gust'
  intensity: number
  dirX: number
  dirZ: number
  sheltered: boolean
}

export type ChallengeMode = 'hardcore' | 'relaxed'

export type ChallengeModifiers = {
  constantStorm: boolean
  moonGravity: boolean
  firstPerson: boolean
  noWindFocus: boolean
}

export const DEFAULT_MODIFIERS: Readonly<ChallengeModifiers> = Object.freeze({
  constantStorm: false,
  moonGravity: false,
  firstPerson: false,
  noWindFocus: false,
})

/** Zone gate checkpoints for Relaxed (Santai) mode. */
export const RELAXED_CHECKPOINTS: ReadonlyArray<{ heightM: number; pos: Vec3; label: string }> = [
  { heightM: 125, pos: [-46.0, 125.4, -66.8], label: '125 m' },
  { heightM: 250, pos: [-51.2, 250.4, -14.3], label: '250 m' },
  { heightM: 375, pos: [-13.5, 375.4, 55.8], label: '375 m' },
]

const tmpEuler = new Euler(0, 0, 0, 'YXZ')
const tmpQuat = new Quaternion()
const tmpLocal = new Vector3()

/** World surface normal of a challenge pad (accounting for rotX & rotY). */
export function challengeSurfaceNormal(spec: ChallengeSpec, out = new Vector3()): Vector3 {
  tmpEuler.set(spec.rotX ?? 0, spec.rotY ?? 0, 0, 'YXZ')
  tmpQuat.setFromEuler(tmpEuler)
  return out.set(0, 1, 0).applyQuaternion(tmpQuat).normalize()
}

/** Downhill horizontal tangent vector for a tilted slippery pad. */
export function challengeDownhillDir(spec: ChallengeSpec, out = new Vector3()): Vector3 {
  const n = challengeSurfaceNormal(spec, tmpLocal)
  out.set(n.x, 0, n.z)
  if (out.lengthSq() > 1e-6) out.normalize()
  return out
}

/** Checks if feet position `p` is standing on (or just above) a static challenge box. */
export function isFeetOnChallenge(spec: ChallengeSpec, p: Vector3, padMargin = 0.35): boolean {
  const dx = p.x - spec.pos[0]
  const dy = p.y - spec.pos[1]
  const dz = p.z - spec.pos[2]
  tmpEuler.set(spec.rotX ?? 0, spec.rotY ?? 0, 0, 'YXZ')
  tmpQuat.setFromEuler(tmpEuler).invert()
  tmpLocal.set(dx, dy, dz).applyQuaternion(tmpQuat)
  const hx = spec.size[0] / 2 + padMargin
  const hy = spec.size[1] / 2
  const hz = spec.size[2] / 2 + padMargin
  return Math.abs(tmpLocal.x) <= hx && Math.abs(tmpLocal.z) <= hz && tmpLocal.y >= hy - 0.35 && tmpLocal.y <= hy + 0.45
}

/** Runtime manager for bounce squash timers, crumbling states, steam jets, Wind Focus, and Crosswind Gusts. */
export class ChallengeRuntime {
  readonly crumbles = new Map<string, CrumbleState>()
  readonly bounceSquash = new Map<string, number>()
  readonly steamStates = new Map<string, SteamState>()
  readonly gondolaBellAt = new Map<string, number>()

  // Wind Focus state
  focusEnergy = 1 // 0..1 (1 = 2.5 s)
  focusHeld = false
  focusActive = false
  focusUsedCount = 0

  // Crosswind Gust state
  windTimer = 0
  windPhase: 'calm' | 'telegraph' | 'gust' = 'calm'
  windIntensity = 0
  windAngle = 0.45
  windSheltered = false

  // Counters for smoke tests
  bounceCount = 0
  crumbleTriggers = 0
  mantleCount = 0
  slipperyTicks = 0
  steamPushes = 0

  constructor() {
    this.reset()
  }

  reset(): void {
    this.crumbles.clear()
    this.bounceSquash.clear()
    this.steamStates.clear()
    this.gondolaBellAt.clear()
    for (const s of CHALLENGE_SPECS) {
      if (s.kind === 'crumbling') {
        this.crumbles.set(s.id, { phase: 'solid', timer: 0, crackedPlayed: false })
      } else if (s.kind === 'bounce') {
        this.bounceSquash.set(s.id, 0)
      } else if (s.kind === 'steamPipe') {
        this.steamStates.set(s.id, { phase: 'idle', intensity: 0, lastPhase: 'idle' })
      }
    }
    this.focusEnergy = 1
    this.focusHeld = false
    this.focusActive = false
    this.focusUsedCount = 0
    this.windTimer = 0
    this.windPhase = 'calm'
    this.windIntensity = 0
    this.windSheltered = false
    this.bounceCount = 0
    this.crumbleTriggers = 0
    this.mantleCount = 0
    this.slipperyTicks = 0
    this.steamPushes = 0
  }

  /** Updates Wind Focus using UNSCALED real frame delta; returns simulation timeScale (0.45 or 1.0). */
  updateFocus(rawDt: number, playing: boolean, grounded: boolean, noWindFocus: boolean): number {
    if (!playing || noWindFocus) {
      this.focusActive = false
      return 1
    }
    if (this.focusHeld && this.focusEnergy > 0.02) {
      if (!this.focusActive) this.focusUsedCount++
      this.focusActive = true
      this.focusEnergy = Math.max(0, this.focusEnergy - rawDt / FOCUS_MAX_S)
      if (this.focusEnergy <= 0) this.focusActive = false
    } else {
      this.focusActive = false
      if (grounded) {
        this.focusEnergy = Math.min(1, this.focusEnergy + rawDt * FOCUS_RECHARGE_RATE)
      }
    }
    return this.focusActive ? FOCUS_TIME_SCALE : 1
  }

  /** Updates crumbling timers, bounce squash decay, steam cycles, and crosswind gusts. */
  step(dt: number, playerY: number, constantStorm: boolean, worldClock: number): {
    crumbleCracks: string[]
    steamHisses: Array<{ id: string; strong: boolean }>
    gondolaBells: string[]
  } {
    const crumbleCracks: string[] = []
    const steamHisses: Array<{ id: string; strong: boolean }> = []
    const gondolaBells: string[] = []

    // 1. Decay bounce squash animations
    for (const [id, v] of this.bounceSquash) {
      if (v > 0) this.bounceSquash.set(id, Math.max(0, v - dt * 2.8))
    }

    // 2. Crumbling Laputa ruins state machine
    for (const [id, c] of this.crumbles) {
      if (c.phase === 'shaking') {
        if (!c.crackedPlayed) {
          c.crackedPlayed = true
          crumbleCracks.push(id)
        }
        c.timer += dt
        if (c.timer >= CRUMBLE_TELEGRAPH_S) {
          c.phase = 'collapsed'
          c.timer = 0
        }
      } else if (c.phase === 'collapsed') {
        c.timer += dt
        if (c.timer >= CRUMBLE_RESPAWN_S) {
          c.phase = 'solid'
          c.timer = 0
          c.crackedPlayed = false
        }
      }
    }

    // 3. Steam pipe cycles (idle → 1.0 s hiss telegraph → 1.4 s blast)
    for (const spec of CHALLENGE_SPECS) {
      if (spec.kind !== 'steamPipe') continue
      const st = this.steamStates.get(spec.id)
      if (!st) continue
      const cycle = spec.steamCycleS ?? 5.2
      const local = (((worldClock + (spec.steamPhaseS ?? 0)) % cycle) + cycle) % cycle
      const blastStart = cycle - 1.4
      const hissStart = blastStart - 1.0
      if (local >= blastStart) {
        st.phase = 'blast'
        st.intensity = 1
      } else if (local >= hissStart) {
        st.phase = 'hiss'
        st.intensity = (local - hissStart) / 1.0
      } else {
        st.phase = 'idle'
        st.intensity = 0
      }
      if (st.phase !== st.lastPhase) {
        if (st.phase === 'hiss') steamHisses.push({ id: spec.id, strong: false })
        else if (st.phase === 'blast') steamHisses.push({ id: spec.id, strong: true })
        st.lastPhase = st.phase
      }
    }

    // 4. Gondola departure bell telegraph (0.4 s before leaving dwell)
    for (const spec of CHALLENGE_SPECS) {
      if (spec.kind !== 'gondola' || !spec.motion) continue
      const m = spec.motion
      const local = (((worldClock + m.phaseS) % m.periodS) + m.periodS) % m.periodS
      const half = m.periodS / 2
      const bellWindow1 = Math.abs(local - (half - 0.35)) < 0.08
      const bellWindow2 = Math.abs(local - (m.periodS - 0.35)) < 0.08
      const last = this.gondolaBellAt.get(spec.id) ?? -10
      if ((bellWindow1 || bellWindow2) && worldClock - last > 2.0) {
        this.gondolaBellAt.set(spec.id, worldClock)
        gondolaBells.push(spec.id)
      }
    }

    // 5. Crosswind Gust (active in z4 >= 355 m or when constantStorm modifier is enabled)
    const windEnabled = constantStorm || playerY >= 355
    if (!windEnabled) {
      this.windPhase = 'calm'
      this.windIntensity = 0
      this.windTimer = 0
    } else {
      const calmDur = constantStorm ? 1.4 : CROSSWIND_CALM_S
      const total = calmDur + CROSSWIND_TELEGRAPH_S + CROSSWIND_ACTIVE_S
      this.windTimer += dt
      if (this.windTimer >= total) {
        this.windTimer -= total
        this.windAngle = (this.windAngle + 1.15) % (Math.PI * 2)
      }
      if (this.windTimer < calmDur) {
        this.windPhase = 'calm'
        this.windIntensity = 0
      } else if (this.windTimer < calmDur + CROSSWIND_TELEGRAPH_S) {
        this.windPhase = 'telegraph'
        this.windIntensity = ((this.windTimer - calmDur) / CROSSWIND_TELEGRAPH_S) * 0.45
      } else {
        this.windPhase = 'gust'
        const t = (this.windTimer - calmDur - CROSSWIND_TELEGRAPH_S) / CROSSWIND_ACTIVE_S
        this.windIntensity = 0.65 + 0.35 * Math.sin(t * Math.PI)
      }
    }

    return { crumbleCracks, steamHisses, gondolaBells }
  }

  triggerBounce(id: string): void {
    this.bounceSquash.set(id, 1)
    this.bounceCount++
  }

  triggerCrumble(id: string): boolean {
    const c = this.crumbles.get(id)
    if (!c || c.phase !== 'solid') return false
    c.phase = 'shaking'
    c.timer = 0
    c.crackedPlayed = false
    this.crumbleTriggers++
    return true
  }

  windSnapshot(): CrosswindSnapshot {
    return {
      phase: this.windPhase,
      intensity: Math.round(this.windIntensity * 1000) / 1000,
      dirX: Math.round(Math.cos(this.windAngle) * 1000) / 1000,
      dirZ: Math.round(Math.sin(this.windAngle) * 1000) / 1000,
      sheltered: this.windSheltered,
    }
  }
}
