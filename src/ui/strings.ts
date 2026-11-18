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
  goal: { id: 'Panjat sampai puncak. Jatuh tidak melukai — kamu lanjut dari tempat mendarat.', en: "Climb to the top. Falling doesn't hurt — you continue from where you land." },
  summitReveal: { id: 'Puncak sebenarnya menyala di atas awan.', en: 'The real summit lights up above the clouds.' },
  fakeSignTitle: { id: 'Hampir.', en: 'Almost.' },
  fakeSignBody: { id: 'Lihat ke atas — awan menyembunyikan sisanya.', en: 'Look up — the clouds hide the rest.' },
  firstFall: { id: 'Jatuh tidak melukai. Lanjut panjat dari sini.', en: "Falls don't hurt. Keep climbing from here." },
  lostMeters: { id: 'Turun {n} m', en: 'Lost {n} m' },
  continueFallback: { id: 'Posisi tersimpan tidak ditemukan — mulai dari bawah.', en: 'Saved spot not found — starting at the bottom.' },
  continue: { id: 'Lanjutkan', en: 'Continue' },
  newClimb: { id: 'Pendakian baru', en: 'New climb' },
  newClimbConfirm: { id: 'Mulai pendakian baru? Pendakian tersimpan akan dihapus.', en: 'Start a new climb? Your saved climb will be deleted.' },
  saveQuit: { id: 'Simpan & ke menu', en: 'Save & quit to menu' },
  best: { id: 'Rekor', en: 'Best' },
  bestTime: { id: 'Waktu terbaik', en: 'Best time' },
  bestHeight: { id: 'Tinggi tertinggi', en: 'Highest point' },
  completions: { id: 'Selesai', en: 'Completions' },
  restarts: { id: 'Ulang', en: 'Restarts' },
  lifetimeBigFalls: { id: 'Jatuh jauh (total)', en: 'Big falls (all time)' },
  none: { id: '—', en: '—' },
  freeRoam: { id: 'Jelajah bebas', en: 'Free roam' },
  newBest: { id: 'Rekor baru!', en: 'New best!' },
  vsBest: { id: 'vs rekor', en: 'vs best' },
  bigFalls: { id: 'Jatuh jauh', en: 'Big falls' },
  metersLost: { id: 'Meter hilang', en: 'Meters lost' },
  respawns: { id: 'Keluar dunia', en: 'Fell out of the world' },
  language: { id: 'Bahasa', en: 'Language' },
  sensitivity: { id: 'Sensitivitas mouse', en: 'Mouse sensitivity' },
  invertY: { id: 'Balik sumbu Y', en: 'Invert Y' },
  rawInput: { id: 'Input mentah (raw)', en: 'Raw input' },
  fov: { id: 'Bidang pandang (FOV)', en: 'Field of view' },
  sprintKick: { id: 'Efek FOV saat lari', en: 'Sprint FOV kick' },
  edgeGuard: { id: 'Penjaga tepi (saat berjalan)', en: 'Edge guard (when walking)' },
  uiScale: { id: 'Skala UI', en: 'UI scale' },
  renderScale: { id: 'Skala render', en: 'Render scale' },
  volMaster: { id: 'Volume utama', en: 'Master volume' },
  volSfx: { id: 'Volume efek', en: 'Effects volume' },
  volAmbience: { id: 'Volume suasana', en: 'Ambience volume' },
  keyBindings: { id: 'Tombol', en: 'Keys' },
  presetWasd: { id: 'WASD (fisik)', en: 'WASD (physical)' },
  presetArrows: { id: 'Panah', en: 'Arrows' },
  pressKey: { id: 'Tekan tombol…', en: 'Press a key…' },
  actForward: { id: 'Maju', en: 'Forward' },
  actBackward: { id: 'Mundur', en: 'Backward' },
  actLeft: { id: 'Kiri', en: 'Left' },
  actRight: { id: 'Kanan', en: 'Right' },
  actRun: { id: 'Lari', en: 'Sprint' },
  actJump: { id: 'Lompat', en: 'Jump' },
  actPause: { id: 'Jeda', en: 'Pause' },
  actRecentre: { id: 'Kamera ke belakang', en: 'Recentre camera' },
  wasdFallback: { id: 'W A S D (Z Q S D di AZERTY)', en: 'W A S D (Z Q S D on AZERTY)' },
  thirdParty: { id: 'Lisensi pihak ketiga', en: 'Third-party licences' },
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
