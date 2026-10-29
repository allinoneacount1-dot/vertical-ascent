// UI strings (DIRECTIVE §2.7): { id, en } table, default from navigator.language (id-* → Indonesian).
export type Lang = 'id' | 'en'

export const STRINGS = {
  title: { id: 'Vertical Ascent', en: 'Vertical Ascent' },
  loading: { id: 'Memuat…', en: 'Loading…' },
  error: { id: 'Gagal memuat. Muat ulang halaman.', en: 'Failed to load. Reload the page.' },
  play: { id: 'Main', en: 'Play' },
  resume: { id: 'Lanjut', en: 'Resume' },
  paused: { id: 'Jeda', en: 'Paused' },
  clickAgain: { id: 'Klik lagi', en: 'Click again' },
  pauseHint: { id: 'P = jeda', en: 'P = pause' },
  recentreHint: { id: 'R = kamera ke belakang', en: 'R = recentre camera' },
  sprint: { id: 'Lari', en: 'Sprint' },
  height: { id: 'Tinggi', en: 'Height' },
  time: { id: 'Waktu', en: 'Time' },
  fellOut: { id: 'Jatuh keluar dunia', en: 'Fell out of the world' },
} as const satisfies Record<string, Record<Lang, string>>

export type StringId = keyof typeof STRINGS

export function defaultLang(): Lang {
  const l = typeof navigator === 'undefined' ? 'en' : navigator.language
  return /^id(-|$)/i.test(l) ? 'id' : 'en'
}

let current: Lang = defaultLang()

export function t(id: StringId): string {
  return STRINGS[id][current]
}

export function setLang(lang: Lang): void {
  current = lang
}
