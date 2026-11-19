// Procedural Web Audio engine (G4, D-019, TEST-17, TEST-12b): wind bed scaled by height, bigFall & crosswind gust,
// Wind Focus low-pass muffle, plus footstep / jump / land / bounce / crumble / bell / steam / mantle SFX.
// Zero external audio files; uses the singleton AudioContext from context.ts.
import { getAudioContext } from './context.ts'

let masterGain: GainNode | null = null
let focusFilter: BiquadFilterNode | null = null
let sfxGain: GainNode | null = null
let ambienceGain: GainNode | null = null
let windGain: GainNode | null = null
let windFilter: BiquadFilterNode | null = null
let millHumGain: GainNode | null = null
let skyAirGain: GainNode | null = null
let windStarted = false

let targetMaster = 0.8
let targetSfx = 0.8
let targetAmbience = 0.7
let currentWindGain = 0
let stepTimer = 0
let footstepCount = 0
let lastFootstepAt = 0
let focusMuffled = false

function ensureGraph(): AudioContext | null {
  const ctx = getAudioContext()
  if (ctx == null) return null
  if (masterGain == null) {
    masterGain = ctx.createGain()
    masterGain.gain.value = targetMaster

    focusFilter = ctx.createBiquadFilter()
    focusFilter.type = 'lowpass'
    focusFilter.frequency.value = focusMuffled ? 650 : 20000
    focusFilter.Q.value = 0.8
    masterGain.connect(focusFilter)
    focusFilter.connect(ctx.destination)

    sfxGain = ctx.createGain()
    sfxGain.gain.value = targetSfx
    sfxGain.connect(masterGain)

    ambienceGain = ctx.createGain()
    ambienceGain.gain.value = targetAmbience
    ambienceGain.connect(masterGain)

    windGain = ctx.createGain()
    windGain.gain.value = 0
    windFilter = ctx.createBiquadFilter()
    windFilter.type = 'lowpass'
    windFilter.frequency.value = 380
    windFilter.Q.value = 1.2
    windFilter.connect(windGain)
    windGain.connect(ambienceGain)

    // Subtle zone-blended ambient beds: z2 warm mill/steam hum + z3 open-sky harmonic air
    millHumGain = ctx.createGain()
    millHumGain.gain.value = 0
    millHumGain.connect(ambienceGain)
    const humOsc = ctx.createOscillator()
    humOsc.type = 'triangle'
    humOsc.frequency.value = 68
    const humFilter = ctx.createBiquadFilter()
    humFilter.type = 'lowpass'
    humFilter.frequency.value = 140
    humOsc.connect(humFilter)
    humFilter.connect(millHumGain)
    humOsc.start()

    skyAirGain = ctx.createGain()
    skyAirGain.gain.value = 0
    skyAirGain.connect(ambienceGain)
    const airOsc = ctx.createOscillator()
    airOsc.type = 'sine'
    airOsc.frequency.value = 293.66 // D4 open airy resonance
    airOsc.connect(skyAirGain)
    airOsc.start()
  }
  if (!windStarted && windFilter != null) {
    windStarted = true
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let lastOut = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      lastOut = (lastOut + 0.02 * white) / 1.02
      data[i] = lastOut * 3.5
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.connect(windFilter)
    src.start()
  }
  return ctx
}

export function syncAudioSettings(masterPct: number, sfxPct: number, ambiencePct: number): void {
  targetMaster = Math.max(0, Math.min(1, masterPct / 100))
  targetSfx = Math.max(0, Math.min(1, sfxPct / 100))
  targetAmbience = Math.max(0, Math.min(1, ambiencePct / 100))
  if (masterGain) masterGain.gain.value = targetMaster
  if (sfxGain) sfxGain.gain.value = targetSfx
  if (ambienceGain) ambienceGain.gain.value = targetAmbience
}

/** Muffle audio softly during Wind Focus slow-motion. */
export function setFocusAudio(active: boolean): void {
  if (focusMuffled === active) return
  focusMuffled = active
  const ctx = getAudioContext()
  if (ctx && focusFilter) {
    focusFilter.frequency.setTargetAtTime(active ? 650 : 20000, ctx.currentTime, 0.08)
  }
}

export function playFootstep(): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  const dur = 0.055
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 260 + Math.random() * 80
  filter.Q.value = 1.5
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.22, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + dur)
  src.connect(filter)
  filter.connect(g)
  g.connect(sfxGain)
  src.start(now)
  src.stop(now + dur)
  footstepCount++
  lastFootstepAt = performance.now()
}

export function playJump(isDouble: boolean): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'triangle'
  const f0 = isDouble ? 240 : 170
  osc.frequency.setValueAtTime(f0, now)
  osc.frequency.exponentialRampToValueAtTime(f0 * 1.8, now + 0.11)
  g.gain.setValueAtTime(0.14, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
  osc.connect(g)
  g.connect(sfxGain)
  osc.start(now)
  osc.stop(now + 0.12)
}

export function playLand(impactVy: number): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  const strength = Math.min(1, Math.abs(impactVy) / 18)
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(110, now)
  osc.frequency.exponentialRampToValueAtTime(42, now + 0.14)
  g.gain.setValueAtTime(0.12 + 0.22 * strength, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
  osc.connect(g)
  g.connect(sfxGain)
  osc.start(now)
  osc.stop(now + 0.15)
}

/** Elastic spring twang for fabric canopies & bounce mushrooms. */
export function playBounceTwang(): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  const g = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(135, now)
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.18)
  osc.frequency.exponentialRampToValueAtTime(290, now + 0.34)
  lfo.frequency.value = 26
  lfoGain.gain.value = 18
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  g.gain.setValueAtTime(0.28, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.36)
  osc.connect(g)
  g.connect(sfxGain)
  osc.start(now)
  lfo.start(now)
  osc.stop(now + 0.36)
  lfo.stop(now + 0.36)
}

/** Rocky crackle telegraph ("krek") for crumbling Laputa stones. */
export function playCrumbleCrack(): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  const dur = 0.22
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < ch.length; i++) {
    const env = Math.pow(1 - i / ch.length, 1.4)
    const burst = i % 190 < 45 ? 1 : 0.25
    ch[i] = (Math.random() * 2 - 1) * env * burst
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 620
  filter.Q.value = 2.0
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.28, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + dur)
  src.connect(filter)
  filter.connect(g)
  g.connect(sfxGain)
  src.start(now)
  src.stop(now + dur)
}

/** Warm brass bell chime before a cable gondola departs. */
export function playGondolaBell(): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  for (const [freq, amp] of [
    [660, 0.14],
    [1320, 0.06],
  ]) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)
    g.gain.setValueAtTime(amp, now)
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.55)
    osc.connect(g)
    g.connect(sfxGain)
    osc.start(now)
    osc.stop(now + 0.56)
  }
}

/** Pressurized steam hiss telegraph / burst for copper steam pipes. */
export function playSteamHiss(strong = false): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  const dur = strong ? 0.45 : 0.28
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.sin((i / ch.length) * Math.PI)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = strong ? 1400 : 2200
  const g = ctx.createGain()
  g.gain.setValueAtTime(strong ? 0.18 : 0.1, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + dur)
  src.connect(filter)
  filter.connect(g)
  g.connect(sfxGain)
  src.start(now)
  src.stop(now + dur)
}

/** Soft vault / hand-grab cue for ledge mantle. */
export function playMantle(): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(140, now)
  osc.frequency.exponentialRampToValueAtTime(240, now + 0.08)
  g.gain.setValueAtTime(0.14, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
  osc.connect(g)
  g.connect(sfxGain)
  osc.start(now)
  osc.stop(now + 0.09)
}

/** Warm wooden rope-bridge creak when stepping onto swaying planks. */
export function playWoodCreak(): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const g = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(92, now)
  osc.frequency.exponentialRampToValueAtTime(64, now + 0.16)
  filter.type = 'bandpass'
  filter.frequency.value = 340
  filter.Q.value = 3.2
  g.gain.setValueAtTime(0.12, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
  osc.connect(filter)
  filter.connect(g)
  g.connect(sfxGain)
  osc.start(now)
  osc.stop(now + 0.19)
}

/** Gentle Ghibli temple-lantern chime when landing on a pendulum lantern. */
export function playLanternChime(): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  for (const [freq, amp] of [
    [784, 0.11],
    [1175, 0.05],
  ]) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)
    g.gain.setValueAtTime(amp, now)
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.48)
    osc.connect(g)
    g.connect(sfxGain)
    osc.start(now)
    osc.stop(now + 0.5)
  }
}

/** Soft wooden-copper gear tick when stepping onto a vertical gear wheel. */
export function playGearTick(): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(210, now)
  osc.frequency.exponentialRampToValueAtTime(95, now + 0.07)
  g.gain.setValueAtTime(0.14, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
  osc.connect(g)
  g.connect(sfxGain)
  osc.start(now)
  osc.stop(now + 0.09)
}

/** Gentle Ghibli sanctuary wind-chime arpeggio when first arriving at a Catch Deck (125/250/375 m). */
export function playWindChime(): void {
  const ctx = ensureGraph()
  if (ctx == null || sfxGain == null || ctx.state !== 'running') return
  const now = ctx.currentTime
  const notes = [880, 1174.66, 1318.51, 1760]
  notes.forEach((freq, idx) => {
    const start = now + idx * 0.085
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, start)
    g.gain.setValueAtTime(0.08, start)
    g.gain.exponentialRampToValueAtTime(0.0006, start + 0.72)
    osc.connect(g)
    g.connect(sfxGain!)
    osc.start(start)
    osc.stop(start + 0.75)
  })
}

// Procedural Ghibli Ambient Piano / Harp Arpeggio (Fase 4):
// Gentle altitude-shifted scales routed through ambienceGain (respects mute, volume & Wind Focus muffle).
const GHIBLI_SCALES = [
  [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25], // z1: C major pentatonic (warm morning)
  [349.23, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25],        // z2: F lydian (adventurous valley)
  [293.66, 329.63, 349.23, 440.0, 493.88, 523.25, 587.33],       // z3: D dorian (nostalgic Laputa)
  [440.0, 523.25, 659.25, 783.99, 880.0, 987.77],                // z4-z8: Celestial A-minor chimes
] as const
let musicTimer = 0.8
let musicStep = 0
let musicNotesPlayed = 0

function playGhibliAmbientNote(hRatio: number): void {
  const ctx = ensureGraph()
  if (ctx == null || ambienceGain == null || ctx.state !== 'running') return
  const scaleIdx = hRatio < 0.25 ? 0 : hRatio < 0.55 ? 1 : hRatio < 0.8 ? 2 : 3
  const scale = GHIBLI_SCALES[scaleIdx]
  const freq = scale[(musicStep * 3 + scaleIdx) % scale.length]
  musicStep++
  musicNotesPlayed++
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const over = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'triangle'
  over.type = 'sine'
  osc.frequency.setValueAtTime(freq, now)
  over.frequency.setValueAtTime(freq * 2, now)
  const overGain = ctx.createGain()
  overGain.gain.setValueAtTime(0.18, now)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.linearRampToValueAtTime(0.045, now + 0.08)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 2.3)
  osc.connect(g)
  over.connect(overGain)
  overGain.connect(g)
  g.connect(ambienceGain)
  osc.start(now)
  over.start(now)
  osc.stop(now + 2.4)
  over.stop(now + 2.4)
}

export function updateAudioFrame(
  dt: number,
  playing: boolean,
  heightRatio: number,
  bigFall: boolean,
  movingOnGround: boolean,
  sprinting: boolean,
  gustIntensity = 0,
): void {
  const ctx = ensureGraph()
  if (ctx == null || windGain == null || windFilter == null) return
  const h = Math.max(0, Math.min(1, heightRatio))
  const g = Math.max(0, Math.min(1, gustIntensity))
  // Wind bed target: valley breeze (z1) -> mid climb -> summit wind howl (z4), + bigFall & crosswind gust
  const target = playing ? Math.min(1, 0.05 + 0.42 * h + (bigFall ? 0.35 : 0) + g * 0.32) : 0
  currentWindGain = target
  windGain.gain.value = target
  windFilter.frequency.value = 320 + 560 * h + (bigFall ? 650 : 0) + g * 720

  // Smooth altitude crossfades for z2 mill hum (peaks ~0.32) & z3/z4 open-sky resonance (peaks ~0.68)
  if (millHumGain) {
    const millBell = Math.exp(-Math.pow((h - 0.32) / 0.16, 2))
    millHumGain.gain.value = playing ? millBell * 0.055 : 0
  }
  if (skyAirGain) {
    const skyBell = Math.exp(-Math.pow((h - 0.68) / 0.22, 2))
    skyAirGain.gain.value = playing ? skyBell * 0.032 : 0
  }

  if (playing) {
    musicTimer -= dt
    if (musicTimer <= 0) {
      playGhibliAmbientNote(h)
      musicTimer = 1.9 + (musicStep % 3) * 0.45
    }
  }

  if (playing && movingOnGround) {
    stepTimer -= dt
    if (stepTimer <= 0) {
      playFootstep()
      stepTimer = sprinting ? 0.26 : 0.38
    }
  } else {
    stepTimer = 0.05
  }
}

export function audioSnapshot(): {
  master: number
  sfx: number
  ambience: number
  wind: number
  footstepCount: number
  lastFootstepAt: number
  focusMuffled: boolean
  musicNotesPlayed: number
} {
  return {
    master: Math.round(targetMaster * 1000) / 1000,
    sfx: Math.round(targetSfx * 1000) / 1000,
    ambience: Math.round(targetAmbience * 1000) / 1000,
    wind: Math.round(currentWindGain * 1000) / 1000,
    footstepCount,
    lastFootstepAt: Math.round(lastFootstepAt),
    focusMuffled,
    musicNotesPlayed,
  }
}
