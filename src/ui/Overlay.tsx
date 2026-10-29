// DOM overlay (DIRECTIVE D-005, D-008, D-021): menu (Play, Settings, Controls, Credits), pause menu (Resume,
// Restart with confirmation), minimal victory screen, HUD (height / target, timer, sprint glyph), toasts in an
// aria-live region, kill-plane fade. Only the overlay subscribes to the store; the Canvas subtree never does.
import { useUi } from '../game/store.ts'
import type { Panel } from '../game/store.ts'
import { enterPlaying } from '../game/enter-playing.ts'
import { formatHud } from '../game/run.ts'
import { game } from '../game/game.ts'
import { loadSettings, saveSettings } from '../game/settings.ts'
import type { SprintMode } from '../controller/locomotion.ts'
import { t } from './strings.ts'

const setPanel = (panel: Panel) => useUi.setState({ panel })

function Hud() {
  const hud = useUi((s) => s.hud)
  return (
    <div className="hud" aria-hidden="true" tabIndex={-1}>
      <div className="hud-block">
        <span className="hud-label">{t('height')}</span>
        <span className="hud-value" data-testid="hud-height">
          {hud.heightM} / {hud.targetM} m
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

function SettingsPanel() {
  const s = loadSettings()
  const apply = (change: Parameters<typeof saveSettings>[0]) => {
    game.applySettings(saveSettings(change))
    useUi.setState({}) // re-render with the stored value
  }
  return (
    <div className="panel menu" data-testid="panel-settings">
      <h2>{t('settings')}</h2>
      <label className="row">
        {t('sprintMode')}
        <select defaultValue={s.sprintMode} onChange={(e) => apply({ sprintMode: e.target.value as SprintMode })}>
          <option value="toggle">{t('sprintToggle')}</option>
          <option value="hold">{t('sprintHold')}</option>
          <option value="always">{t('sprintAlways')}</option>
        </select>
      </label>
      <label className="row">
        <input type="checkbox" defaultChecked={s.showTimer} onChange={(e) => apply({ showTimer: e.target.checked })} />
        {t('showTimer')}
      </label>
      <button type="button" autoFocus onClick={() => setPanel('main')}>
        {t('back')}
      </button>
    </div>
  )
}

function ControlsPanel() {
  return (
    <div className="panel menu" data-testid="panel-controls">
      <h2>{t('controls')}</h2>
      <ul className="list">
        <li>{t('keysMove')}</li>
        <li>{t('keysSprint')}</li>
        <li>{t('keysJump')}</li>
        <li>{t('keysLook')}</li>
        <li>{t('pauseHint')}</li>
        <li>{t('recentreHint')}</li>
      </ul>
      <button type="button" autoFocus onClick={() => setPanel('main')}>
        {t('back')}
      </button>
    </div>
  )
}

function CreditsPanel() {
  return (
    <div className="panel menu" data-testid="panel-credits">
      <h2>{t('credits')}</h2>
      <ul className="list">
        <li>{t('creditsLibs')}</li>
        <li>{t('creditsAssets')}</li>
        <li>{t('creditsPlaceholders')}</li>
        <li>{t('creditsFont')}</li>
      </ul>
      <button type="button" autoFocus onClick={() => setPanel('main')}>
        {t('back')}
      </button>
    </div>
  )
}

function MenuMain() {
  const hint = useUi((s) => s.hint)
  const pending = useUi((s) => s.pendingIntent)
  return (
    <div className="panel menu" data-testid="panel-menu">
      <h1>{t('title')}</h1>
      <button type="button" autoFocus disabled={pending != null} onClick={() => void enterPlaying('play')}>
        {t('play')}
      </button>
      <div className="menu-row">
        <button type="button" className="secondary" onClick={() => setPanel('settings')}>
          {t('settings')}
        </button>
        <button type="button" className="secondary" onClick={() => setPanel('controls')}>
          {t('controls')}
        </button>
        <button type="button" className="secondary" onClick={() => setPanel('credits')}>
          {t('credits')}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
      <p className="keys">
        {t('pauseHint')} · {t('recentreHint')}
      </p>
    </div>
  )
}

function PauseMain() {
  const hint = useUi((s) => s.hint)
  const pending = useUi((s) => s.pendingIntent)
  return (
    <div className="panel menu" data-testid="panel-pause">
      <h2>{t('paused')}</h2>
      <button type="button" autoFocus disabled={pending != null} onClick={() => void enterPlaying('resume')}>
        {t('resume')}
      </button>
      <div className="menu-row">
        <button type="button" className="secondary" data-testid="restart" onClick={() => setPanel('confirmRestart')}>
          {t('restart')}
        </button>
        <button type="button" className="secondary" onClick={() => setPanel('settings')}>
          {t('settings')}
        </button>
        <button type="button" className="secondary" onClick={() => setPanel('controls')}>
          {t('controls')}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

function ConfirmRestart() {
  return (
    <div className="panel menu" role="alertdialog" aria-labelledby="restart-q" data-testid="panel-confirm-restart">
      <p id="restart-q">{t('restartConfirm')}</p>
      <div className="menu-row">
        <button
          type="button"
          data-testid="confirm-restart"
          onClick={() => {
            setPanel('main')
            void enterPlaying('restart')
          }}
        >
          {t('restart')}
        </button>
        <button type="button" className="secondary" autoFocus onClick={() => setPanel('main')}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}

function Victory() {
  const timerMs = useUi((s) => s.hud.timerMs)
  const pending = useUi((s) => s.pendingIntent)
  const total = Math.floor(timerMs / 100)
  const shown = `${formatHud(timerMs)}.${total % 10}`
  return (
    <div className="panel menu" data-testid="panel-victory">
      <h2>{t('victory')}</h2>
      <p className="big" data-testid="victory-time">
        {shown}
      </p>
      <div className="menu-row">
        <button type="button" autoFocus disabled={pending != null} onClick={() => void enterPlaying('replay')}>
          {t('replay')}
        </button>
        <button type="button" className="secondary" onClick={() => game.dispatch({ type: 'menu' })}>
          {t('menu')}
        </button>
      </div>
    </div>
  )
}

function Fade() {
  const fadeAt = useUi((s) => s.fadeAt)
  if (fadeAt === 0) return null
  return <div key={fadeAt} className="fade" aria-hidden="true" />
}

export function Overlay() {
  const state = useUi((s) => s.snapshot.state)
  const failedUrl = useUi((s) => s.snapshot.failedUrl)
  const panel = useUi((s) => s.panel)
  const toasts = useUi((s) => s.toasts)
  const sub = panel === 'settings' ? <SettingsPanel /> : panel === 'controls' ? <ControlsPanel /> : panel === 'credits' ? <CreditsPanel /> : null
  return (
    <div className="overlay">
      <Fade />
      {(state === 'PLAYING' || state === 'PAUSED') && <Hud />}
      {state === 'LOADING' && <div className="panel">{t('loading')}</div>}
      {state === 'ERROR' && (
        <div className="panel" role="alert">
          <p>{t('error')}</p>
          {failedUrl && <code>{failedUrl}</code>}
        </div>
      )}
      {state === 'MENU' && (sub ?? <MenuMain />)}
      {state === 'PAUSED' && (panel === 'confirmRestart' ? <ConfirmRestart /> : (sub ?? <PauseMain />))}
      {state === 'VICTORY' && <Victory />}
      <div className="toasts" aria-live="polite" data-testid="toasts">
        {toasts.map((x) => (
          <div key={x.id} className="toast">
            {x.text}
          </div>
        ))}
      </div>
    </div>
  )
}
