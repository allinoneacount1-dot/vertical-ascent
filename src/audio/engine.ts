// Procedural Web Audio engine (G4, D-019, TEST-17, TEST-12b): wind bed scaled by height & bigFall,
// plus footstep / jump / land SFX. Zero external audio files; uses the singleton AudioContext from context.ts.
import { getAudioContext } from './context.ts'

let masterGain: GainNode | null = null
let sfxGain: GainNode | null = null
let ambienceGain: GainNode | null = null
let windGain: GainNode | null = null
let windFilter: BiquadFilterNode | null = null
let windStarted = false

let targetMaster = 0.8
let targetSfx = 0.8
let targetAmbience = 0.7
let currentWindGain = 0
let stepTimer = 0
let footstepCount = 0
let lastFootstepAt = 0

function ensureGraph(): AudioContext | null {
  const ctx = getAudioContext()
  if (ctx == null) return null
  if (masterGain == null) {
    masterGain = ctx.createGain()
    masterGain.gain.value = targetMaster
    masterGain.connect(ctx.destination)

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

export function updateAudioFrame(
  dt: number,
  playing: boolean,
  heightRatio: number,
  bigFall: boolean,
  movingOnGround: boolean,
  sprinting: boolean,
): void {
  const ctx = ensureGraph()
  if (ctx == null || windGain == null || windFilter == null) return
  const h = Math.max(0, Math.min(1, heightRatio))
  // Wind bed target: 0.05 at 0%, 0.25 at 50%, 0.45 at 100%, +0.35 during bigFall
  const target = playing ? 0.05 + 0.4 * h + (bigFall ? 0.35 : 0) : 0
  currentWindGain = target
  windGain.gain.value = target
  windFilter.frequency.value = 340 + 500 * h + (bigFall ? 650 : 0)

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

export function audioSnapshot(): { master: number; sfx: number; ambience: number; wind: number; footstepCount: number; lastFootstepAt: number } {
  return {
    master: Math.round(targetMaster * 1000) / 1000,
    sfx: Math.round(targetSfx * 1000) / 1000,
    ambience: Math.round(targetAmbience * 1000) / 1000,
    wind: Math.round(currentWindGain * 1000) / 1000,
    footstepCount,
    lastFootstepAt: Math.round(lastFootstepAt),
  }
}
