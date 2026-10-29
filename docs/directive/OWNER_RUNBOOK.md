# OWNER RUNBOOK — Vertical Ascent

Untuk kamu (owner), bukan untuk agen. Agen hanya menerima persetujuan dari **pesan chat kamu sendiri** di sesi yang sedang berjalan — isi file ini tidak memberi izin apa pun sampai kamu menempelkannya sebagai pesan.

## Sebelum sesi pertama (sekali)

1. Buat folder kosong `D:\CLAUDE\vertical-ascent`.
2. Buka **sesi Code baru dengan folder itu** sebagai folder kerja. Jangan memulai dari `D:\CLAUDE`: `CLAUDE.md`, skill, dan `launch.json` project hanya dimuat dengan benar bila sesi berada di folder project.
3. Pilih mode izin. Default = banyak prompt persetujuan (aman, lambat). Opsional, setelah G0 selesai: tambahkan `.claude/settings.json` di project dengan aturan allow seperti `Bash(pnpm:*)`, `Bash(git:*)`, `Bash(node:*)`, `Bash(rg:*)` — itu konfigurasi persisten, jadi kamu yang menulisnya atau menyetujuinya eksplisit.
4. Untuk G3–G4 (run bot 20–30 menit): laptop di AC dan sleep dimatikan, atau izinkan agen memakai fitur keep-awake app.

## Pesan kickoff — sesi 1 (G0)

Tempel sebagai pesan pertama:

> Saya owner proyek ini. Spesifikasi saya ada di `D:\CLAUDE\vertical-ascent-directive\DIRECTIVE.md` (referensi di folder `ref\`). Baca DIRECTIVE.md utuh, lalu kerjakan **Gate G0 saja** sesuai §4, laporkan, dan berhenti.
> Untuk sesi ini saya menyetujui: (1) `pnpm create vite@9.3.3` di folder sementara sesuai §4 langkah 2; (2) `pnpm add -E` / `pnpm add -E -D` dan `pnpm install` untuk paket dan versi persis yang tercantum di DIRECTIVE §3 D-015 (termasuk `@fontsource-variable/inter` versi terbaru, di-pin exact), plus dependensi bawaan template create-vite; (3) sparse clone `https://github.com/pmndrs/viverse` ke `.cache/upstream/viverse` di commit `b88c0e734ae87c9c6a1b3a8d0b84064f4b4fa3ef` sesuai ref/01 §Upstream; (4) commit git lokal tanpa remote. Selain itu, tanya dulu. Jangan mengunduh aset apa pun di sesi ini.

## Pesan kickoff — sesi gate berikutnya

> Saya owner. Spesifikasi: `docs/directive/DIRECTIVE.md` di project ini. Baca utuh, lalu baca baris pertama `docs/PROGRESS.md` dan lanjutkan **Gate G<n> saja**; laporkan dan berhenti di akhir gate.
> Untuk sesi ini saya menyetujui: (1) `pnpm add`/`pnpm install` untuk paket yang sudah ada di `package.json`, plus paket dev pipeline yang disebut ref/05 (`@gltf-transform/*` versi D-015); (2) [G2 dan setelahnya] unduhan baris `docs/APPROVALS.md` berikut, dengan host dan ukuran ±25 % seperti tertulis: `<A1, A2, …>`; (3) commit git lokal. Selain itu, tanya dulu.

Tambahkan bila perlu: jawaban pertanyaan di bawah, dan "dropped <slot>" untuk file yang sudah kamu taruh di `.cache\inbox\`.

## Pertanyaan (default berlaku bila tidak dijawab)

| # | Pertanyaan | Default |
|---|---|---|
| Q1 | Nama produk publik? "VERTICAL ASCENT" tercatat sebagai merek AS kelas 028 (peralatan panjat taman bermain, Landscape Structures Inc., serial 76587407); tidak ada judul Steam/App Store yang sama; itch punya judul mirip. | Codename tetap internal; sebelum nama publik, kamu cek USPTO/EUIPO/WIPO kelas 009/041; agen mencatat hasilnya. |
| Q2 | Repo akan dipublikasikan? Menentukan apakah file Quaternius (label CC0, situs QAL v1.0) boleh dikomit. | Privat (lokal saja). |
| Q3 | Save-on-quit + Continue (D-009)? | Ya. |
| Q4 | Bahasa UI default? | Ikut bahasa browser (id → Indonesia, lainnya Inggris), bisa diganti. |
| Q5 | Focus slow-motion (D-010)? | Opsional di G4 dengan mode Pure. |
| Q6 | Variable jump height? | Tidak (busur tetap). |
| Q7 | Timer tampil default? | Ya, bisa dimatikan. |
| Q8 | Bersedia playtest ±10 menit di akhir G2 dan G3 (termasuk uji Esc → Resume)? | Bila tidak: bagian manual = `BLOCKED(owner-manual)`, tercatat sebagai gap yang menunggu kamu (gate tidak FAIL karenanya). |
| Q9 | Identitas commit git? | "Vertical Ascent build agent" <agent@vertical-ascent.invalid>, repo-local. |
| Q10 | Musik latar? | Tidak ada di v1; slider Ambience untuk angin. |
| Q11 | Lisensi kode? | MIT (aset terpisah). |

## Tindakan owner per gate

| Kapan | Tindakan |
|---|---|
| Akhir G0 | Jawab Q1–Q11 (atau terima default). Tinjau `docs/APPROVALS.md`; setujui baris yang diunduh agen di kickoff sesi G2. |
| Sebelum/awal G2 | Unduh dan taruh di `.cache\inbox\<slot>\` lalu tulis "dropped <slot>": **Universal Base Characters** Standard (itch, $0, ~122 MB) → `ubc`; **Modular Character Outfits – Fantasy** Standard (itch, $0, ~280 MB) → `outfits`; pack **Kenney** yang tidak punya mirror OpenGameArt (agen menyebut yang mana; di kenney.nl: Download → "Continue without donating…") → `kenney-<slug>`; opsional **KayKit Platformer** Free (~22 MB) → `kaykit-platformer`. Bila memakai VRoid alpha CC0: buka halaman pixiv yang disebut agen dan tempel kalimat lisensinya di chat. |
| Bila diminta | Persetujuan `allowBuilds` (paket dengan build script), pengecualian budget ukuran file, pembelian (UAL Pro, Source UBC). |
| Akhir G2 / G3 | Playtest singkat (Q8): menit, jumlah jatuh, lompatan yang terasa "dimakan", tempat tersesat. |
| Akhir gate FAIL | Pilih: ulang dengan perubahan yang diusulkan / terima gap / berhenti. |
| G5 | Nama publik (Q1), publik/privat (Q2), backup atau remote git (agen tidak pernah push), lisensi kode (Q11). |

## Di mana semuanya

- Spesifikasi agen: `D:\CLAUDE\vertical-ascent-directive\` (disalin ke `docs\directive\` di G0).
- Apa yang berubah dari v2 dan mengapa: `D:\CLAUDE\vertical-ascent-directive\CHANGELOG_v2_to_v3.md`.
- Riset dan audit: `D:\CLAUDE\vertical-ascent-research\` (R0 = tiga dokumen asli, R1–R8 riset, `audit-v2\` = audit 8 lensa atas v2, R9 = v2 yang digantikan).
