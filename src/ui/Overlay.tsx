// DOM overlay (DIRECTIVE D-005, D-008, D-009, D-021, D-023; Tahap 1–3):
// Menu with Hardcore/Relaxed mode + Challenge Modifiers, HUD with Wind Focus stamina bar,
// Crosswind gust indicator, Speedrun Zone Splits (Z1–Z4), and quick restart support.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useUi } from '../game/store.ts'
import type { Panel } from '../game/store.ts'
import { enterPlaying } from '../game/enter-playing.ts'
import { formatHud } from '../game/run.ts'
import { game } from '../game/game.ts'
import { loadSettings, saveSettings } from '../game/settings.ts'
import type { ActionId, Settings } from '../game/settings.ts'
import { BINDING_PRESETS, keyLabel } from '../game/input-bindings.ts'
import { assetUrl } from '../assets.ts'
import type { SprintMode } from '../controller/locomotion.ts'
import credits from './credits.json'
import { t } from './strings.ts'
import type { StringId } from './strings.ts'

const setPanel = (panel: Panel) => useUi.setState({ panel })

function formatTenths(ms: number): string {
  return `${formatHud(ms)}.${Math.floor(ms / 100) % 10}`
}

function Hud() {
  const hud = useUi((s) => s.hud)
  const freeRoam = useUi((s) => s.snapshot.mode === 'freeRoam')
  const challengeMode = useUi((s) => s.challengeMode)
  const noWindFocus = useUi((s) => s.modifiers.noWindFocus)
  const splits = hud.splits

  return (
    <div className="hud" aria-hidden="true" tabIndex={-1}>
      <div className="hud-block">
        <span className="hud-label">{t('height')}</span>
        <span className="hud-value" data-testid="hud-height">
          {hud.heightM} / {hud.targetM} m
        </span>
      </div>
      {hud.showTimer && !freeRoam && (
        <div className="hud-block">
          <span className="hud-label">{t('time')}</span>
          <span className="hud-value" data-testid="hud-timer">
            {formatHud(hud.timerMs)}
          </span>
        </div>
      )}
      {!noWindFocus && (
        <div className={hud.focusActive ? 'hud-block hud-focus active' : 'hud-block hud-focus'} data-testid="hud-focus">
          <span className="hud-label">{t('windFocus')} (Q)</span>
          <div className="focus-bar">
            <div className="focus-fill" style={{ width: `${Math.round(hud.focusRatio * 100)}%` }} />
          </div>
        </div>
      )}
      {hud.windPhase !== 'calm' && (
        <div className={`hud-block hud-wind ${hud.windPhase}`} data-testid="hud-wind">
          <span className="hud-label">
            {hud.windPhase === 'telegraph' ? t('windTelegraph') : t('windGust')}
            {hud.windSheltered ? ` · ${t('windSheltered')}` : ''}
          </span>
        </div>
      )}
      {!freeRoam && (
        <div className="hud-block hud-splits" data-testid="hud-splits">
          <span className="hud-label" data-testid="hud-mode">
            {challengeMode === 'hardcore' ? t('modeHardcore') : `${t('modeRelaxed')}${hud.checkpointLabel ? ` · CP ${hud.checkpointLabel}` : ''}`}
          </span>
          <div className="splits-row">
            {(['z1', 'z2', 'z3', 'z4'] as const).map((z) => (
              <span key={z} className={splits[z] != null ? 'split-chip done' : 'split-chip'}>
                {z.toUpperCase()} {splits[z] != null ? formatHud(splits[z]!) : '--:--'}
              </span>
            ))}
          </div>
        </div>
      )}
      {hud.sprintGlyph && (
        <div className="hud-sprint" data-testid="hud-sprint" title={t('sprint')}>
          »
        </div>
      )}
      {!freeRoam && hud.targetM > 0 && (
        <div className="hud-elevation" data-testid="hud-elevation-map" aria-hidden="true">
          <div className="elev-track">
            <div className="elev-fill" style={{ height: `${Math.max(0, Math.min(100, (hud.heightM / hud.targetM) * 100))}%` }} />
            {[125, 250, 375].map((m) => (
              <span
                key={m}
                className="elev-tick"
                style={{ bottom: `${Math.min(100, (m / hud.targetM) * 100)}%` }}
                title={`Catch Deck ${m}m`}
              />
            ))}
            {game.records.bestHeightM > 1 && (
              <span
                className="elev-pb"
                style={{ bottom: `${Math.min(100, (game.records.bestHeightM / hud.targetM) * 100)}%` }}
              />
            )}
            <span
              className="elev-dot"
              style={{ bottom: `${Math.max(0, Math.min(100, (hud.heightM / hud.targetM) * 100))}%` }}
            />
          </div>
          <span className="elev-label">V</span>
        </div>
      )}
      {hud.lostM != null && (
        <div className="hud-block">
          <span className="hud-value" data-testid="hud-lost">
            −{hud.lostM} m
          </span>
        </div>
      )}
    </div>
  )
}

function ControlsStrip() {
  const used = useUi((s) => s.usedActions)
  const items: Array<[string, StringId]> = [
    ['move', 'keysMove'],
    ['run', 'keysSprint'],
    ['jump', 'keysJump'],
  ]
  if (items.every(([a]) => used.includes(a))) return null
  return (
    <div className="strip" data-testid="controls-strip" aria-hidden="true">
      {items.map(([a, id]) => (
        <span key={a} className={used.includes(a) ? 'strip-item used' : 'strip-item'}>
          {t(id)}
        </span>
      ))}
      <span className="strip-item">
        {t('pauseHint')} · {t('recentreHint')}
      </span>
    </div>
  )
}

const ACTIONS: Array<[ActionId, StringId]> = [
  ['forward', 'actForward'],
  ['backward', 'actBackward'],
  ['left', 'actLeft'],
  ['right', 'actRight'],
  ['run', 'actRun'],
  ['jump', 'actJump'],
  ['pause', 'actPause'],
  ['recentre', 'actRecentre'],
]

function KeyName({ code }: { code: string }) {
  const [label, setLabel] = useState(code)
  useEffect(() => {
    let live = true
    void keyLabel(code).then((l) => live && setLabel(l))
    return () => {
      live = false
    }
  }, [code])
  return <>{label}</>
}

function SettingsPanel() {
  const [s, setS] = useState<Settings>(() => loadSettings())
  const [capture, setCapture] = useState<ActionId | null>(null)
  const apply = (change: Partial<Settings>) => {
    const next = saveSettings(change)
    game.applySettings(next)
    setS(next)
  }
  useEffect(() => {
    if (capture == null) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code !== 'Escape') apply({ bindings: { ...loadSettings().bindings, [capture]: [e.code] } })
      setCapture(null)
    }
    window.addEventListener('keydown', onKey, { capture: true, once: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [capture])
  const range = (id: string, label: StringId, value: number, min: number, max: number, step: number, onChange: (v: number) => void, shown: string) => (
    <label className="row">
      <span>{t(label)}</span>
      <span className="range">
        <input type="range" data-testid={id} min={min} max={max} step={step} value={value} aria-valuetext={shown} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="range-value">{shown}</span>
      </span>
    </label>
  )
  const check = (id: string, label: StringId, value: boolean, onChange: (v: boolean) => void) => (
    <label className="row">
      <span>{t(label)}</span>
      <input type="checkbox" data-testid={id} checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
  return (
    <div className="panel menu settings" data-testid="panel-settings">
      <h2>{t('settings')}</h2>
      <div className="settings-grid">
        <label className="row">
          <span>{t('language')}</span>
          <select data-testid="set-lang" value={s.lang} onChange={(e) => apply({ lang: e.target.value as Settings['lang'] })}>
            <option value="id">Bahasa Indonesia</option>
            <option value="en">English</option>
          </select>
        </label>
        {range('set-sensitivity', 'sensitivity', s.sensitivity, 0.2, 3, 0.1, (v) => apply({ sensitivity: v }), s.sensitivity.toFixed(1))}
        {check('set-invert-y', 'invertY', s.invertY, (v) => apply({ invertY: v }))}
        {check('set-raw-input', 'rawInput', s.rawInput, (v) => apply({ rawInput: v }))}
        {range('set-fov', 'fov', s.fov, 60, 100, 1, (v) => apply({ fov: v }), `${s.fov}°`)}
        {check('set-sprint-kick', 'sprintKick', s.sprintKick, (v) => apply({ sprintKick: v }))}
        <label className="row">
          <span>{t('sprintMode')}</span>
          <select data-testid="set-sprint-mode" value={s.sprintMode} onChange={(e) => apply({ sprintMode: e.target.value as SprintMode })}>
            <option value="toggle">{t('sprintToggle')}</option>
            <option value="hold">{t('sprintHold')}</option>
            <option value="always">{t('sprintAlways')}</option>
          </select>
        </label>
        {check('set-edge-guard', 'edgeGuard', s.edgeGuard, (v) => apply({ edgeGuard: v }))}
        {check('set-show-timer', 'showTimer', s.showTimer, (v) => apply({ showTimer: v }))}
        {range('set-ui-scale', 'uiScale', s.uiScale, 1, 2, 0.1, (v) => apply({ uiScale: v }), `${Math.round(s.uiScale * 100)} %`)}
        {range('set-render-scale', 'renderScale', s.renderScale, 0.5, 1, 0.05, (v) => apply({ renderScale: v }), `${Math.round(s.renderScale * 100)} %`)}
        {range('set-vol-master', 'volMaster', s.volume.master, 0, 100, 1, (v) => apply({ volume: { ...s.volume, master: v } }), String(s.volume.master))}
        {range('set-vol-sfx', 'volSfx', s.volume.sfx, 0, 100, 1, (v) => apply({ volume: { ...s.volume, sfx: v } }), String(s.volume.sfx))}
        {range('set-vol-ambience', 'volAmbience', s.volume.ambience, 0, 100, 1, (v) => apply({ volume: { ...s.volume, ambience: v } }), String(s.volume.ambience))}
      </div>
      <h3>{t('keyBindings')}</h3>
      <div className="menu-row">
        <button type="button" className="secondary" data-testid="preset-wasd" onClick={() => apply({ bindings: { ...BINDING_PRESETS.wasd } })}>
          {t('presetWasd')}
        </button>
        <button type="button" className="secondary" data-testid="preset-arrows" onClick={() => apply({ bindings: { ...BINDING_PRESETS.arrows } })}>
          {t('presetArrows')}
        </button>
      </div>
      <div className="settings-grid">
        {ACTIONS.map(([a, label]) => (
          <label className="row" key={a}>
            <span>{t(label)}</span>
            <button type="button" className="secondary key" data-testid={`bind-${a}`} aria-live="polite" onClick={() => setCapture(a)}>
              {capture === a ? t('pressKey') : s.bindings[a].map((c, i) => <span key={c}>{i > 0 && ' / '}<KeyName code={c} /></span>)}
            </button>
          </label>
        ))}
      </div>
      <button type="button" autoFocus data-testid="settings-back" onClick={() => setPanel('main')}>
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
        <li>{t('keysFocus')}</li>
        <li>{t('keysQuickRestart')}</li>
        <li>{t('keysCheckpoint')}</li>
        <li>{t('keysLook')}</li>
        <li>{t('pauseHint')}</li>
      </ul>
      <button type="button" autoFocus data-testid="controls-back" onClick={() => setPanel('main')}>
        {t('back')}
      </button>
    </div>
  )
}

type CreditEntry = { id: string; title: string; author: string; license: string; attribution: string; source: string }

function CreditsPanel() {
  return (
    <div className="panel menu" data-testid="panel-credits">
      <h2>{t('credits')}</h2>
      <ul className="list">
        <li>{t('creditsLibs')}</li>
        {(credits as CreditEntry[]).map((c) => (
          <li key={c.id} data-testid={`credit-${c.id}`}>
            {c.attribution || `${c.title} — ${c.author}`} ({c.license})
          </li>
        ))}
        <li>{t('creditsPlaceholders')}</li>
        <li>{t('creditsFont')}</li>
        <li>
          <a href={assetUrl('THIRD_PARTY_LICENSES.txt')} target="_blank" rel="noreferrer">
            {t('thirdParty')}
          </a>
        </li>
      </ul>
      <button type="button" autoFocus data-testid="credits-back" onClick={() => setPanel('main')}>
        {t('back')}
      </button>
    </div>
  )
}

function BestPanel() {
  const r = game.records
  return (
    <div className="panel menu" data-testid="panel-best">
      <h2>{t('best')}</h2>
      <dl className="stats">
        <dt>{t('bestTime')}</dt>
        <dd data-testid="best-time">{r.bestTimeMs == null ? t('none') : formatTenths(r.bestTimeMs)}</dd>
        <dt>{t('bestHeight')}</dt>
        <dd data-testid="best-height">{r.bestHeightM} m</dd>
        <dt>{t('completions')}</dt>
        <dd>{r.completions}</dd>
        <dt>{t('restarts')}</dt>
        <dd>{r.restartCount}</dd>
        <dt>{t('lifetimeBigFalls')}</dt>
        <dd>{r.lifetimeBigFalls}</dd>
      </dl>
      <button type="button" autoFocus data-testid="best-back" onClick={() => setPanel('main')}>
        {t('back')}
      </button>
    </div>
  )
}

function MenuMain() {
  const hint = useUi((s) => s.hint)
  const pending = useUi((s) => s.pendingIntent)
  const saved = useUi((s) => s.savedRun)
  const challengeMode = useUi((s) => s.challengeMode)
  const modifiers = useUi((s) => s.modifiers)

  return (
    <div className="panel menu" data-testid="panel-menu">
      <h1>{t('title')}</h1>
      {saved == null ? (
        <button type="button" autoFocus data-testid="play" disabled={pending != null} onClick={() => void enterPlaying('play')}>
          {t('play')}
        </button>
      ) : (
        <>
          <button type="button" autoFocus data-testid="continue" disabled={pending != null} onClick={() => void enterPlaying('continue')}>
            {t('continue')} ({saved.heightM} m · {formatHud(saved.timerMs)})
          </button>
          <div className="menu-row">
            <button type="button" className="secondary" data-testid="new-climb" onClick={() => setPanel('confirmNewClimb')}>
              {t('newClimb')}
            </button>
          </div>
        </>
      )}

      {/* Mode Selector: Hardcore (default) vs Relaxed (Santai) */}
      <div className="menu-row mode-row">
        <button
          type="button"
          className={challengeMode === 'hardcore' ? 'chip active' : 'chip'}
          data-testid="mode-hardcore"
          onClick={() => game.setChallengeMode('hardcore')}
        >
          {t('modeHardcore')}
        </button>
        <button
          type="button"
          className={challengeMode === 'relaxed' ? 'chip active' : 'chip'}
          data-testid="mode-relaxed"
          onClick={() => game.setChallengeMode('relaxed')}
        >
          {t('modeRelaxed')}
        </button>
      </div>

      {/* Optional Challenge Modifiers */}
      <div className="menu-row mod-row">
        <button
          type="button"
          className={modifiers.constantStorm ? 'chip active' : 'chip'}
          data-testid="mod-storm"
          onClick={() => game.setModifiers({ constantStorm: !modifiers.constantStorm })}
        >
          {t('modStorm')}
        </button>
        <button
          type="button"
          className={modifiers.moonGravity ? 'chip active' : 'chip'}
          data-testid="mod-moon"
          onClick={() => game.setModifiers({ moonGravity: !modifiers.moonGravity })}
        >
          {t('modMoon')}
        </button>
        <button
          type="button"
          className={modifiers.firstPerson ? 'chip active' : 'chip'}
          data-testid="mod-fp"
          onClick={() => game.setModifiers({ firstPerson: !modifiers.firstPerson })}
        >
          {t('modFirstPerson')}
        </button>
        <button
          type="button"
          className={modifiers.noWindFocus ? 'chip active' : 'chip'}
          data-testid="mod-nofocus"
          onClick={() => game.setModifiers({ noWindFocus: !modifiers.noWindFocus })}
        >
          {t('modNoFocus')}
        </button>
      </div>

      <div className="menu-row">
        <button type="button" className="secondary" data-testid="settings" onClick={() => setPanel('settings')}>
          {t('settings')}
        </button>
        <button type="button" className="secondary" data-testid="controls" onClick={() => setPanel('controls')}>
          {t('controls')}
        </button>
        <button type="button" className="secondary" data-testid="credits" onClick={() => setPanel('credits')}>
          {t('credits')}
        </button>
        <button type="button" className="secondary" data-testid="best" onClick={() => setPanel('best')}>
          {t('best')}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
      <p className="keys">
        {t('pauseHint')} · {t('recentreHint')}
      </p>
    </div>
  )
}

function Confirm({ id, text, confirmId, label, onConfirm }: { id: string; text: StringId; confirmId: string; label: StringId; onConfirm: () => void }) {
  return (
    <div className="panel menu" role="alertdialog" aria-labelledby={`${id}-q`} data-testid={`panel-${id}`}>
      <p id={`${id}-q`}>{t(text)}</p>
      <div className="menu-row">
        <button type="button" data-testid={confirmId} onClick={onConfirm}>
          {t(label)}
        </button>
        <button type="button" className="secondary" autoFocus data-testid={`${id}-cancel`} onClick={() => setPanel('main')}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}

function PauseMain() {
  const hint = useUi((s) => s.hint)
  const pending = useUi((s) => s.pendingIntent)
  const mode = useUi((s) => s.snapshot.mode)
  return (
    <div className="panel menu" data-testid="panel-pause">
      <h2>{t('paused')}</h2>
      <button type="button" autoFocus data-testid="resume" disabled={pending != null} onClick={() => void enterPlaying('resume')}>
        {t('resume')}
      </button>
      <div className="menu-row">
        <button type="button" className="secondary" data-testid="restart" onClick={() => setPanel('confirmRestart')}>
          {t('restart')}
        </button>
        {mode === 'run' && (
          <button type="button" className="secondary" data-testid="save-quit" onClick={() => game.dispatch({ type: 'saveAndQuit' })}>
            {t('saveQuit')}
          </button>
        )}
        <button type="button" className="secondary" data-testid="settings" onClick={() => setPanel('settings')}>
          {t('settings')}
        </button>
        <button type="button" className="secondary" data-testid="controls" onClick={() => setPanel('controls')}>
          {t('controls')}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

function Victory() {
  const v = useUi((s) => s.victory)
  const lockedUntil = useUi((s) => s.victoryLockedUntil)
  const pending = useUi((s) => s.pendingIntent)
  const [, rerender] = useState(0)
  const locked = performance.now() < lockedUntil
  useEffect(() => {
    if (!locked) return
    const id = setTimeout(() => rerender((n) => n + 1), Math.max(0, lockedUntil - performance.now()) + 16)
    return () => clearTimeout(id)
  }, [locked, lockedUntil])
  if (v == null) return null
  const delta = v.newBest ? t('newBest') : v.deltaMs == null ? null : `${v.deltaMs >= 0 ? '+' : '−'}${formatTenths(Math.abs(v.deltaMs))} ${t('vsBest')}`
  return (
    <div className="panel menu" data-testid="panel-victory">
      <h2>{t('victory')}</h2>
      <p className="big" data-testid="victory-time">
        {formatTenths(v.timerMs)}
      </p>
      {delta && (
        <p className="delta" data-testid="victory-delta">
          {delta}
        </p>
      )}
      <dl className="stats">
        <dt>{t('bigFalls')}</dt>
        <dd data-testid="victory-bigfalls">{v.bigFalls}</dd>
        <dt>{t('metersLost')}</dt>
        <dd data-testid="victory-meters">{Math.round(v.metersLost)} m</dd>
        <dt>{t('respawns')}</dt>
        <dd data-testid="victory-respawns">{v.killPlaneRespawns}</dd>
        <dt>{t('restarts')}</dt>
        <dd data-testid="victory-restarts">{v.restarts}</dd>
      </dl>
      <div className="menu-row">
        <button type="button" autoFocus data-testid="replay" disabled={locked || pending != null} onClick={() => void enterPlaying('replay')}>
          {t('replay')}
        </button>
        <button type="button" className="secondary" data-testid="free-roam" disabled={locked || pending != null} onClick={() => void enterPlaying('freeRoam')}>
          {t('freeRoam')}
        </button>
        <button type="button" className="secondary" data-testid="victory-menu" disabled={locked} onClick={() => game.dispatch({ type: 'menu' })}>
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
  const mode = useUi((s) => s.snapshot.mode)
  const failedUrl = useUi((s) => s.snapshot.failedUrl)
  const panel = useUi((s) => s.panel)
  const toasts = useUi((s) => s.toasts)
  const uiScale = useUi((s) => s.uiScale)
  useUi((s) => s.lang)
  const sub =
    panel === 'settings' ? <SettingsPanel /> : panel === 'controls' ? <ControlsPanel /> : panel === 'credits' ? <CreditsPanel /> : panel === 'best' ? <BestPanel /> : null
  return (
    <div className="overlay" style={{ '--ui-scale': uiScale } as CSSProperties}>
      <Fade />
      {(state === 'PLAYING' || state === 'PAUSED') && <Hud />}
      {state === 'PLAYING' && mode === 'run' && <ControlsStrip />}
      {state === 'LOADING' && <div className="panel">{t('loading')}</div>}
      {state === 'ERROR' && (
        <div className="panel" role="alert">
          <p>{t('error')}</p>
          {failedUrl && <code>{failedUrl}</code>}
        </div>
      )}
      {state === 'MENU' &&
        (panel === 'confirmNewClimb' ? (
          <Confirm
            id="confirm-new-climb"
            text="newClimbConfirm"
            confirmId="confirm-new-climb"
            label="newClimb"
            onConfirm={() => {
              setPanel('main')
              void enterPlaying('newClimb')
            }}
          />
        ) : (
          (sub ?? <MenuMain />)
        ))}
      {state === 'PAUSED' &&
        (panel === 'confirmRestart' ? (
          <Confirm
            id="confirm-restart"
            text="restartConfirm"
            confirmId="confirm-restart"
            label="restart"
            onConfirm={() => {
              setPanel('main')
              void enterPlaying('restart')
            }}
          />
        ) : (
          (sub ?? <PauseMain />)
        ))}
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
