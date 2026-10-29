// Shared helpers for the G1 movement smoke TESTs (04, 05; ref/06 §Lapisan "smoke"): renderer log, boot to PLAYING
// through a real click on Play, a per-rAF sampler of window.__game, a capture-phase key log, and camera turns made
// with real relative mouse movement under pointer lock. Input only through vitexec's trusted mouse/keyboard.
import { keyboard, mouse } from 'vitexec'

export type Vec3 = [number, number, number]

type Snap = {
  state: string
  player: { pos: Vec3; vel: Vec3; groundedRaw: boolean; sprintActive: boolean }
  camera: { yaw: number; pitch: number }
  simTime: number
  frame: number
}
type GameApi = { state?: string; snapshot(): Snap }

export const game = (): GameApi => (window as unknown as { __game: GameApi }).__game
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
export const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r))
export const r3 = (v: number) => Math.round(v * 1000) / 1000

export const hspeed = (v: Vec3) => Math.hypot(v[0], v[2])
export const hdist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2])
/** Wraps an angle to (-π, π]. */
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Same as vitexec/probes/env.ts (ref/06 §Probe G0): renderer string via WEBGL_debug_renderer_info. */
export function logRenderer(): string {
  const gl = document.createElement('canvas').getContext('webgl2')
  if (!gl) throw new Error('no webgl2')
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
  console.log('env ' + JSON.stringify({ ua: navigator.userAgent, renderer, vendor, dpr: devicePixelRatio, ext: !!ext }))
  if (/swiftshader|llvmpipe/i.test(String(renderer))) console.warn('software renderer')
  return String(renderer)
}

/**
 * LOADING → MENU, optional setup right before the click (allowlisted seed only), real click on Play, then
 * pointer lock on the canvas + PLAYING within 120 frames, then 300 ms (first delta discarded, 150 ms rotation
 * settle, D-033).
 */
export async function bootToPlaying(beforePlay?: () => void): Promise<HTMLCanvasElement> {
  const t0 = performance.now()
  while (game()?.state !== 'MENU') {
    if (performance.now() - t0 > 90000) throw new Error('no MENU after 90 s, state=' + game()?.state)
    await sleep(100)
  }
  console.log('menu after ms ' + Math.round(performance.now() - t0))
  beforePlay?.()
  const button = document.querySelector('.panel button')
  if (!(button instanceof HTMLButtonElement)) throw new Error('no Play button (.panel button)')
  const r = button.getBoundingClientRect()
  await mouse.moveTo(r.x + r.width / 2, r.y + r.height / 2)
  await mouse.click()
  const canvas = document.querySelector('canvas')
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('no canvas')
  let frames = 0
  for (; frames < 120; frames++) {
    if (document.pointerLockElement === canvas && game().snapshot().state === 'PLAYING') break
    await nextFrame()
  }
  const locked = document.pointerLockElement === canvas
  const state = game().snapshot().state
  console.log('after Play click ' + JSON.stringify({ frames, locked, state, active: document.activeElement?.tagName }))
  if (!locked || state !== 'PLAYING') throw new Error('Play click did not reach locked PLAYING: ' + JSON.stringify({ locked, state }))
  await sleep(300)
  return canvas
}

export type Sample = {
  t: number
  pos: Vec3
  vel: Vec3
  grounded: boolean
  sprint: boolean
  glyph: boolean
  state: string
  yaw: number
  simTime: number
  frame: number
}
export type KeyEv = { t: number; type: string; code: string; repeat: boolean; locked: boolean; target: string }

/** Per-rAF samples of __game (one snapshot() per sample) and every key event seen in the capture phase. */
export class Recorder {
  readonly samples: Sample[] = []
  readonly keys: KeyEv[] = []
  private running = false
  private readonly abort = new AbortController()

  start(): void {
    const onKey = (e: KeyboardEvent) => {
      const canvas = document.querySelector('canvas')
      this.keys.push({
        t: e.timeStamp,
        type: e.type,
        code: e.code,
        repeat: e.repeat,
        locked: document.pointerLockElement != null && document.pointerLockElement === canvas,
        target: e.target instanceof Element ? e.target.tagName : String(e.target),
      })
    }
    window.addEventListener('keydown', onKey, { capture: true, signal: this.abort.signal })
    window.addEventListener('keyup', onKey, { capture: true, signal: this.abort.signal })
    this.running = true
    const tick = () => {
      if (!this.running) return
      const s = game().snapshot()
      this.samples.push({
        t: performance.now(),
        pos: s.player.pos,
        vel: s.player.vel,
        grounded: s.player.groundedRaw,
        sprint: s.player.sprintActive,
        glyph: document.querySelector('[data-testid=hud-sprint]') != null,
        state: s.state,
        yaw: s.camera.yaw,
        simTime: s.simTime,
        frame: s.frame,
      })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
    this.abort.abort()
  }

  /** Latest sample taken at or before t (the state it shows is at least that old: conservative). */
  lastAtOrBefore(t: number): Sample {
    let best: Sample | null = null
    for (const s of this.samples) {
      if (s.t <= t) best = s
      else break
    }
    if (best == null) throw new Error('no sample at or before t=' + r3(t))
    return best
  }

  /** Feet position at time t, linear between the two samples around t. */
  posAt(t: number): Vec3 {
    const s = this.samples
    for (let i = 1; i < s.length; i++) {
      if (s[i].t >= t) {
        const a = s[i - 1]
        const b = s[i]
        const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t)
        return [0, 1, 2].map((k) => a.pos[k] + f * (b.pos[k] - a.pos[k])) as Vec3
      }
    }
    throw new Error('no sample after t=' + r3(t))
  }

  between(t0: number, t1: number): Sample[] {
    return this.samples.filter((s) => s.t >= t0 && s.t <= t1)
  }

  /** Largest gap between consecutive samples inside [t0, t1] (ms). */
  maxGap(t0: number, t1: number): number {
    const w = this.between(t0, t1)
    let gap = 0
    for (let i = 1; i < w.length; i++) gap = Math.max(gap, w[i].t - w[i - 1].t)
    return gap
  }

  /** Real key hold of holdMs through vitexec; returns the captured (non-repeat) keydown and keyup events. */
  async hold(code: string, holdMs: number): Promise<{ down: KeyEv; up: KeyEv }> {
    const from = this.keys.length
    await keyboard.down(code, { releaseAfterMs: holdMs })
    const deadline = performance.now() + holdMs + 5000
    for (;;) {
      const evs = this.keys.slice(from).filter((k) => k.code === code && !k.repeat)
      const down = evs.find((k) => k.type === 'keydown')
      const up = evs.find((k) => k.type === 'keyup')
      if (down && up) return { down, up }
      if (performance.now() > deadline) throw new Error(`no keydown/keyup pair captured for ${code}`)
      await nextFrame()
    }
  }

  /** Real key tap (default 80 ms hold); returns the captured keydown. */
  async tap(code: string): Promise<KeyEv> {
    const from = this.keys.length
    await keyboard.press(code)
    const deadline = performance.now() + 3000
    for (;;) {
      const down = this.keys.slice(from).find((k) => k.code === code && k.type === 'keydown' && !k.repeat)
      const up = this.keys.slice(from).find((k) => k.code === code && k.type === 'keyup')
      if (down && up) return down
      if (performance.now() > deadline) throw new Error(`no keydown/keyup captured for tap ${code}`)
      await nextFrame()
    }
  }
}

/**
 * Turns the camera to targetYaw with real relative mouse movement (ref/04 camera: dYaw = -(movementX / canvas
 * height) * 4 rad), ≤1000 px per call, then returns the measured yaw.
 */
export async function turnToYaw(targetYaw: number): Promise<{ from: number; to: number; dxPx: number }> {
  const canvas = document.querySelector('canvas')
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('no canvas')
  if (document.pointerLockElement !== canvas) throw new Error('turnToYaw needs pointer lock')
  const h = canvas.getBoundingClientRect().height
  const from = game().snapshot().camera.yaw
  const dxPx = Math.round((-wrap(targetYaw - from) * h) / 4)
  let left = dxPx
  while (left !== 0) {
    const step = Math.max(-1000, Math.min(1000, left))
    await mouse.move(step, 0)
    left -= step
  }
  for (let i = 0; i < 5; i++) await nextFrame()
  return { from, to: game().snapshot().camera.yaw, dxPx }
}
