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
  settings: { id: 'Pengaturan', en: 'Settings' },
  controls: { id: 'Kontrol', en: 'Controls' },
  credits: { id: 'Kredit', en: 'Credits' },
  back: { id: 'Kembali', en: 'Back' },
  restart: { id: 'Ulang dari bawah', en: 'Restart' },
  restartConfirm: { id: 'Ulang dari tanah? Ketinggianmu sekarang akan hilang.', en: 'Restart from the ground? Your current height will be lost.' },
  cancel: { id: 'Batal', en: 'Cancel' },
  sprintMode: { id: 'Mode lari', en: 'Sprint mode' },
  sprintHold: { id: 'Tahan', en: 'Hold' },
  sprintToggle: { id: 'Ganti (tekan)', en: 'Toggle' },
  sprintAlways: { id: 'Selalu', en: 'Always' },
  showTimer: { id: 'Tampilkan waktu', en: 'Show timer' },
  victory: { id: 'Puncak tercapai', en: 'Summit reached' },
  replay: { id: 'Main lagi', en: 'Replay' },
  menu: { id: 'Menu', en: 'Menu' },
  keysMove: { id: 'W A S D — bergerak', en: 'W A S D — move' },
  keysSprint: { id: 'Shift — lari', en: 'Shift — sprint' },
  keysJump: { id: 'Spasi — lompat (tekan lagi di udara: lompat ganda)', en: 'Space — jump (press again in the air: double jump)' },
  keysLook: { id: 'Mouse — kamera, roda — jarak', en: 'Mouse — camera, wheel — distance' },
  creditsLibs: { id: 'Dibuat dengan three.js, React Three Fiber, pmndrs viverse (Bela Bohlender), zustand.', en: 'Built with three.js, React Three Fiber, pmndrs viverse (Bela Bohlender), zustand.' },
  creditsPlaceholders: { id: 'Karakter sementara: mannequin Quaternius dari paket viverse.', en: 'Temporary character: Quaternius mannequin bundled with viverse.' },
  creditsAssets: { id: 'Animasi: Universal Animation Library oleh Quaternius (quaternius.com). Cahaya langit: HDRI Industrial Sunset (Pure Sky) oleh Sergej Majboroda dan Jarod Guest, Poly Haven (CC0).', en: 'Animations: Universal Animation Library by Quaternius (quaternius.com). Sky lighting: Industrial Sunset (Pure Sky) HDRI by Sergej Majboroda and Jarod Guest, Poly Haven (CC0).' },
  creditsFont: { id: 'Font: Inter (SIL OFL 1.1).', en: 'Font: Inter (SIL OFL 1.1).' },
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
