// Module-singleton AudioContext (DIRECTIVE D-019): created lazily, resumed from the Click-to-Play click and on
// visibilitychange → visible. Sounds arrive in G4.
let context: AudioContext | null = null

export function getAudioContext(): AudioContext | null {
  if (context == null && typeof AudioContext !== 'undefined') context = new AudioContext()
  return context
}

export function resumeAudio(): void {
  const ctx = getAudioContext()
  if (ctx != null && ctx.state !== 'running') ctx.resume().catch(() => undefined)
}

export function audioState(): string {
  return context?.state ?? 'none'
}
