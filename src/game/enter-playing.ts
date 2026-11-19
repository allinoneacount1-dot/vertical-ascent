// The single path into PLAYING and the pause/focus/quick-restart triggers (DIRECTIVE D-004, D-019; Tahap 1–3).
import { canEnter } from './state.ts'
import type { EnterIntent } from './state.ts'
import { useUi } from './store.ts'
import { game } from './game.ts'
import { resumeAudio } from '../audio/context.ts'
import { loadSettings } from './settings.ts'
import { t } from '../ui/strings.ts'

type LockOptions = { unadjustedMovement?: boolean }

const LOCK_SETTLE_MS = 150
const QUICK_RESTART_HOLD_MS = 550
type LockingCanvas = HTMLCanvasElement & { requestPointerLock(options?: LockOptions): Promise<void> | void }

export async function enterPlaying(intent: EnterIntent): Promise<void> {
  const canvas = game.canvas as LockingCanvas | null
  const { snapshot } = useUi.getState()
  if (canvas == null || !game.isWorldReady || !canEnter(snapshot, intent)) return
  resumeAudio()
  game.rawInput = loadSettings().rawInput
  useUi.setState({ pendingIntent: intent, hint: null })
  if (document.pointerLockElement === canvas) {
    completeEnter()
    return
  }
  try {
    game.lastLockOptions = { unadjustedMovement: game.rawInput }
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

export function installPlayGuards(canvas: HTMLCanvasElement): void {
  if (installed) return
  installed = true

  let rHoldTimer: ReturnType<typeof setTimeout> | null = null
  const clearRHold = () => {
    if (rHoldTimer != null) {
      clearTimeout(rHoldTimer)
      rHoldTimer = null
    }
  }

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      game.cameraRig?.suppressRotation(LOCK_SETTLE_MS)
      completeEnter()
    } else {
      game.challenges.focusHeld = false
      clearRHold()
      game.dispatch({ type: 'lockLost' })
    }
  })
  document.addEventListener('pointerlockerror', () => {
    if (useUi.getState().pendingIntent != null) rejectLock(new DOMException('', 'NotAllowedError'))
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      game.challenges.focusHeld = false
      clearRHold()
      game.dispatch({ type: 'hidden' })
      game.saveRunIfActive()
    } else resumeAudio()
  })
  window.addEventListener('pagehide', () => game.saveRunIfActive())
  window.addEventListener('blur', () => {
    game.challenges.focusHeld = false
    clearRHold()
    game.dispatch({ type: 'blur' })
  })

  // Wind Focus via Right Mouse Button (button === 2)
  window.addEventListener('mousedown', (e) => {
    if (e.button === 2 && game.snapshot.state === 'PLAYING' && document.pointerLockElement === canvas) {
      game.challenges.focusHeld = true
    }
  })
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) game.challenges.focusHeld = false
  })

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    const keys = game.settings.bindings
    if (keys.pause.includes(e.code)) {
      game.dispatch({ type: 'pauseKey' })
      return
    }
    // Wind Focus via Q key (does not conflict with Shift sprint)
    if (e.code === 'KeyQ' && game.snapshot.state === 'PLAYING') {
      game.challenges.focusHeld = true
      return
    }
    // Optional Vista Look via V key (glances toward summit when stationary & grounded)
    if (e.code === 'KeyV' && game.snapshot.state === 'PLAYING') {
      game.triggerVistaLook()
      return
    }
    // Relaxed mode checkpoint return via C key
    if (e.code === 'KeyC' && game.snapshot.state === 'PLAYING' && game.challengeMode === 'relaxed') {
      game.returnToCheckpoint()
      return
    }
    // Quick restart (Shift+R or hold R for 550 ms); short tap of R keeps camera recentre intact
    if (e.code === 'KeyR' && e.shiftKey && game.snapshot.state === 'PLAYING') {
      game.quickRestart()
      return
    }
    if (keys.recentre.includes(e.code) && game.snapshot.state === 'PLAYING') {
      game.cameraRig?.startRecentre(game.controller?.facingYaw ?? game.spawnYaw, game.reducedMotion)
      if (e.code === 'KeyR') {
        clearRHold()
        rHoldTimer = setTimeout(() => {
          rHoldTimer = null
          if (game.snapshot.state === 'PLAYING') game.quickRestart()
        }, QUICK_RESTART_HOLD_MS)
      }
      return
    }
    if (e.code === 'Space' && game.snapshot.state === 'PLAYING' && e.target instanceof HTMLButtonElement) e.preventDefault()
  })

  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyQ') game.challenges.focusHeld = false
    if (e.code === 'KeyR') clearRHold()
  })

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
}
