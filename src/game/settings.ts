// va.settings.v1 (ref/02 §Storage, DIRECTIVE D-021). Read with try/catch + type and range validation; an unknown
// version or a broken value falls back to the default with one console.warn (never console.error). The settings
// screen arrives in G3; G1 reads the stored value at startup and again at every run start (D-034).
import type { SprintMode } from '../controller/locomotion.ts'
import { defaultLang } from '../ui/strings.ts'
import type { Lang } from '../ui/strings.ts'

export const SETTINGS_KEY = 'va.settings.v1'

export type ActionId = 'forward' | 'backward' | 'left' | 'right' | 'run' | 'jump' | 'pause' | 'recentre'

export type Settings = {
  v: 1
  lang: Lang
  sensitivity: number
  invertY: boolean
  rawInput: boolean
  fov: number
  sprintKick: boolean
  sprintMode: SprintMode
  edgeGuard: boolean
  showTimer: boolean
  uiScale: number
  renderScale: number
  volume: { master: number; sfx: number; ambience: number }
  bindings: Record<ActionId, string[]>
}

export const DEFAULT_BINDINGS: Readonly<Record<ActionId, string[]>> = Object.freeze({
  forward: ['KeyW'],
  backward: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  pause: ['KeyP'],
  recentre: ['KeyR'],
})

export function defaultSettings(): Settings {
  return {
    v: 1,
    lang: defaultLang(),
    sensitivity: 1,
    invertY: false,
    rawInput: true,
    fov: 75,
    sprintKick: true,
    sprintMode: 'toggle',
    edgeGuard: false,
    showTimer: true,
    uiScale: 1,
    renderScale: 1,
    volume: { master: 80, sfx: 80, ambience: 60 },
    bindings: { ...DEFAULT_BINDINGS },
  }
}

const isNum = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

/** Validates a parsed value field by field; returns [settings, problems]. */
export function validateSettings(raw: unknown): [Settings, string[]] {
  const d = defaultSettings()
  const problems: string[] = []
  if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) return [d, ['not an object']]
  const r = raw as Record<string, unknown>
  if (r.v !== 1) return [d, [`unknown version ${JSON.stringify(r.v)}`]]
  const take = <K extends keyof Settings>(key: K, ok: (v: unknown) => boolean) => {
    if (!(key in r)) return
    if (ok(r[key])) (d as Record<string, unknown>)[key] = r[key]
    else problems.push(String(key))
  }
  take('lang', (v) => v === 'id' || v === 'en')
  take('sensitivity', (v) => isNum(v, 0.2, 3))
  take('invertY', isBool)
  take('rawInput', isBool)
  take('fov', (v) => isNum(v, 60, 100))
  take('sprintKick', isBool)
  take('sprintMode', (v) => v === 'hold' || v === 'toggle' || v === 'always')
  take('edgeGuard', isBool)
  take('showTimer', isBool)
  take('uiScale', (v) => isNum(v, 1, 2))
  take('renderScale', (v) => isNum(v, 0.5, 1))
  if ('volume' in r) {
    const vol = r.volume as Record<string, unknown> | null
    if (vol != null && typeof vol === 'object' && isNum(vol.master, 0, 100) && isNum(vol.sfx, 0, 100) && isNum(vol.ambience, 0, 100)) {
      d.volume = { master: vol.master, sfx: vol.sfx, ambience: vol.ambience }
    } else problems.push('volume')
  }
  if ('bindings' in r) {
    const b = r.bindings as Record<string, unknown> | null
    const ok =
      b != null &&
      typeof b === 'object' &&
      (Object.keys(DEFAULT_BINDINGS) as ActionId[]).every((k) => Array.isArray(b[k]) && (b[k] as unknown[]).every((c) => typeof c === 'string' && /^[A-Za-z0-9]+$/.test(c)))
    if (ok) d.bindings = b as Record<ActionId, string[]>
    else problems.push('bindings')
  }
  return [d, problems]
}

/** Reads and validates va.settings.v1; never throws. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Settings {
  let text: string | null = null
  try {
    text = storage?.getItem(SETTINGS_KEY) ?? null
  } catch {
    return defaultSettings()
  }
  if (text == null) return defaultSettings()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    console.warn(`${SETTINGS_KEY}: corrupt JSON, using defaults`)
    return defaultSettings()
  }
  const [settings, problems] = validateSettings(parsed)
  if (problems.length > 0) console.warn(`${SETTINGS_KEY}: invalid ${problems.join(', ')}; defaults used for those`)
  return settings
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
