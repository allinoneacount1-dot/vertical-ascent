// The single path into PLAYING and the pause triggers (DIRECTIVE D-004, D-019; ref/02 §State table).
// PLAYING is entered only after pointerlockchange → canvas; Esc cannot be relied on, so PAUSED is driven by
// pointerlockchange → null, visibilitychange → hidden, window blur and the P key.
import { canEnter } from './state.ts'
import type { EnterIntent } from './state.ts'
import { useUi } from './store.ts'
import { game } from './game.ts'
import { resumeAudio } from '../audio/context.ts'
import { loadSettings } from './settings.ts'
import { t } from '../ui/strings.ts'

type LockOptions = { unadjustedMovement?: boolean }

/** Rotation input ignored right after lock acquisition (D-033). */
const LOCK_SETTLE_MS = 150
type LockingCanvas = HTMLCanvasElement & { requestPointerLock(options?: LockOptions): Promise<void> | void }

/** Click handler of Play, Continue, New climb, Resume, Restart, Replay, Free roam (D-004). */
export async function enterPlaying(intent: EnterIntent): Promise<void> {
  const canvas = game.canvas as LockingCanvas | null
  const { snapshot } = useUi.getState()
  if (canvas == null || !game.isWorldReady || !canEnter(snapshot, intent)) return
  resumeAudio()
  // stored settings apply at the moment of entering play (D-034, D-040): raw input decides the lock options
  game.rawInput = loadSettings().rawInput
  useUi.setState({ pendingIntent: intent, hint: null })
  if (document.pointerLockElement === canvas) {
    // already locked (e.g. P pause keeps no lock, but be safe): enter directly
    completeEnter()
    return
  }
  try {
    await canvas.requestPointerLock({ unadjustedMovement: game.rawInput })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotSupportedError') {
      try {
        await canvas.requestPointerLock()
        return
      } catch (err2) {
        rejectLock(err2)
        return
      }
    }
    rejectLock(err)
  }
}

function rejectLock(err: unknown): void {
  const name = err instanceof DOMException ? err.name : 'Error'
  useUi.setState({ pendingIntent: null, hint: t('clickAgain') })
  game.log('lockRejected', { name })
}

function completeEnter(): void {
  const intent = useUi.getState().pendingIntent
  if (intent == null) return
  useUi.setState({ pendingIntent: null, hint: null })
  game.dispatch({ type: 'enter', intent })
}

let installed = false

/** Installs document/window listeners once (the Canvas never unmounts). */
export function installPlayGuards(canvas: HTMLCanvasElement): void {
  if (installed) return
  installed = true

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      game.cameraRig?.suppressRotation(LOCK_SETTLE_MS)
      completeEnter()
    } else {
      game.dispatch({ type: 'lockLost' })
    }
  })
  document.addEventListener('pointerlockerror', () => {
    if (useUi.getState().pendingIntent != null) rejectLock(new DOMException('', 'NotAllowedError'))
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') game.dispatch({ type: 'hidden' })
    else resumeAudio()
  })
  window.addEventListener('blur', () => game.dispatch({ type: 'blur' }))
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    if (e.code === 'KeyP') {
      game.dispatch({ type: 'pauseKey' })
      return
    }
    if (e.code === 'KeyR' && game.snapshot.state === 'PLAYING') {
      game.cameraRig?.startRecentre(game.controller?.facingYaw ?? game.spawnYaw, game.reducedMotion)
      return
    }
    // Space on a focused <button> while playing must not click it (D-004)
    if (e.code === 'Space' && game.snapshot.state === 'PLAYING' && e.target instanceof HTMLButtonElement) e.preventDefault()
  })
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
}
