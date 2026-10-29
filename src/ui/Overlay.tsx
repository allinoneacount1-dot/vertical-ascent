// DOM overlay (DIRECTIVE D-005, D-021): Click-to-Play (G1 MENU = one Play button), pause screen, minimal HUD
// (height, timer, sprint glyph). Only the overlay subscribes to the store; the Canvas subtree never does.
import { useUi } from '../game/store.ts'
import { enterPlaying } from '../game/enter-playing.ts'
import { formatHud } from '../game/run.ts'
import { t } from './strings.ts'

function Hud() {
  const hud = useUi((s) => s.hud)
  return (
    <div className="hud" aria-hidden="true" tabIndex={-1}>
      <div className="hud-block">
        <span className="hud-label">{t('height')}</span>
        <span className="hud-value" data-testid="hud-height">
          {hud.heightM} m
        </span>
      </div>
      {hud.showTimer && (
        <div className="hud-block">
          <span className="hud-label">{t('time')}</span>
          <span className="hud-value" data-testid="hud-timer">
            {formatHud(hud.timerMs)}
          </span>
        </div>
      )}
      {hud.sprintGlyph && (
        <div className="hud-sprint" data-testid="hud-sprint" title={t('sprint')}>
          »
        </div>
      )}
    </div>
  )
}

export function Overlay() {
  const state = useUi((s) => s.snapshot.state)
  const failedUrl = useUi((s) => s.snapshot.failedUrl)
  const hint = useUi((s) => s.hint)
  const pending = useUi((s) => s.pendingIntent)
  return (
    <div className="overlay">
      {(state === 'PLAYING' || state === 'PAUSED') && <Hud />}
      {state === 'LOADING' && <div className="panel">{t('loading')}</div>}
      {state === 'ERROR' && (
        <div className="panel" role="alert">
          <p>{t('error')}</p>
          {failedUrl && <code>{failedUrl}</code>}
        </div>
      )}
      {state === 'MENU' && (
        <div className="panel menu">
          <h1>{t('title')}</h1>
          <button type="button" autoFocus disabled={pending != null} onClick={() => void enterPlaying('play')}>
            {t('play')}
          </button>
          {hint && <p className="hint">{hint}</p>}
          <p className="keys">
            {t('pauseHint')} · {t('recentreHint')}
          </p>
        </div>
      )}
      {state === 'PAUSED' && (
        <div className="panel menu">
          <h2>{t('paused')}</h2>
          <button type="button" autoFocus disabled={pending != null} onClick={() => void enterPlaying('resume')}>
            {t('resume')}
          </button>
          {hint && <p className="hint">{hint}</p>}
        </div>
      )}
      <div className="toasts" aria-live="polite" />
    </div>
  )
}
