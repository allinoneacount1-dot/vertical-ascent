# ref/05 — Aset, lisensi, pipeline

## Larangan

Tidak satu pun biner dari `examples/*/public/` upstream (`avatar.vrm`, `jog-*`, `aim-*`, `pistol-*`, `map.glb`, `*.mp3`, `muzzleflash.png`, `pose.glb`, `laying.fbx`, `sword.gltf`, `sample.bvh`, `viverse-logo.png`) dan tidak satu pun file `packages/viverse/assets/*` di luar ekspor npm. Dilarang juga: Mixamo; Pixabay/Sonniss sebagai file mentah; VRoid Hub; Ready Player Me (tutup 2026-01-31); lisensi NC/ND; logo/brand/meme/NFT pihak ketiga walau CC0; drei `<Environment preset>`, `<Cloud>/<Clouds>` tanpa `texture` lokal, `<Text>` tanpa `font` lokal. `check-assets.mjs` juga gagal pada nama file yang cocok dengan daftar contoh di atas.

## Alur persetujuan dan unduhan

1. G0 langkah 11: setiap kandidat di §Sumber yang dibutuhkan → baris `docs/APPROVALS.md` (asset-id, siapa yang mengunduh, host, pola nama file, ukuran ±25 %, lisensi seperti tertulis).
2. Owner menyetujui di chat (kickoff sesi G2 atau balasan). Agen mengunduh hanya baris yang disetujui di sesi itu, ke `.cache/downloads/<asset-id>/`. Ukuran dari header respons GET (HEAD tidak selalu bisa); di luar ±25 % → berhenti dan tanya.
3. Unduhan OWNER-ONLY: owner menaruh file di `.cache/inbox/<slot>/` dan membalas "dropped <slot>".

## Karantina

- Pohon: `.cache/{downloads,inbox,extract,upstream}/` (gitignored, dikecualikan dari watcher Vite dan vitest).
- Ekstraksi ke folder baru yang kosong: `.cache/extract/<slot>/` untuk file yang diserahkan owner, `.cache/extract/<asset-id>/` untuk unduhan agen, dengan `/c/Windows/System32/tar.exe -x -f <zip> -C <dir>` atau `py -I -m zipfile -e <zip> <dir>`; tolak entri berisi `..` atau path absolut (cek listing dulu: `tar.exe -t -f <zip>`). Tidak ada yang dijalankan dari arsip. Script pemrosesan berada di `scripts/`, bukan di folder ekstraksi; path dioper sebagai argumen.
- Yang boleh disalin ke `public/assets/<kategori>/` (atau `public/assets/_build-only/<kategori>/` untuk file ber-`repo_committable: BUILD-ONLY`, yang di-gitignore): `*.glb *.gltf *.bin *.png *.jpg *.webp *.ogg *.wav *.mp3 *.hdr *.woff2` yang benar-benar dipakai. `License.txt` pack → `licenses/<id>.txt`. Preview image, `.url`, dan teks lain tidak disalin.
- `sha256sum` setiap file sumber → manifest.

## Sumber

`[AUTO]` = agen mengunduh setelah disetujui; `[OWNER]` = OWNER-ONLY. Verifikasi ulang label lisensi saat unduh dan simpan snapshot-nya.

| Slot | Sumber | Lisensi (label + catatan) | Mekanisme |
|---|---|---|---|
| Lingkungan Z1 | Kenney **Platformer Kit**, **City Kit (Roads)**, **Modular Buildings** | CC0 (kenney.nl/support); tanpa logo Kenney | Kenney tidak lagi punya href `.zip` dan link bertanda tangannya menolak klien non-browser → **[AUTO] hanya bila** ada unggahan Kenney sendiri di OpenGameArt (`opengameart.org/content/<slug>`, author Kenney, CC0, versi cocok dengan halaman kenney.nl, `tar.exe -t` menunjukkan GLB); selain itu **[OWNER]**: Download → "Continue without donating…" di kenney.nl → `.cache/inbox/kenney-<slug>/` |
| Lingkungan Z2–Z3 | Kenney **City Kit (Industrial)**, **Factory Kit** (conveyor/belt untuk platform bergerak) | CC0 | sama |
| Greybox semua zona | Kenney **Prototype Kit** | CC0 | sama; dihitung placeholder |
| Z4 / puncak | Pack Z1–Z3 dengan palet Z4 + struktur puncak orisinal dari primitif + beacon emisif (+ KayKit Platformer bila disetujui) | — | — |
| Hazard tambahan | KayKit **Platformer** (`kaylousberg.itch.io/kaykit-platformer`), Free 22 MB (Extra $4.99 = OWNER-ONLY berbayar) | label CC0; catat tanggal "Updated" itch | [OWNER] |
| Protagonis (1) | Quaternius **Universal Base Characters** Standard (122 MB, $0; berisi 2 dari 6 body — mana saja **belum terverifikasi**, baca listing dulu) + **Modular Character Outfits – Fantasy** Standard (280 MB, $0) | label CC0; situs memuat **QAL v1.0** (8/28/2026: pakai komersial bebas, tanpa atribusi, **dilarang redistribusi sebagai aset mandiri**, klaim lintas platform) → `license_id` dari label, catatan QAL, kedua snapshot, `repo_committable: BUILD-ONLY` | [OWNER] tombol itch. Pilih body paling dekat 1.7–1.8 m; outfit paling polos (mis. Peasant) diwarnai ulang ke palet kasual lewat warna material (script gltf-transform); satu aksesori primitif di bone (topi/ransel) sebagai perubahan siluet. Membeli Source = berbayar → OWNER-ONLY |
| Protagonis (2) | VRoid Studio alpha CC0 (`opengameart.org/content/vroid-studio-cc0-models`; unggahan pihak ketiga) `avatarsample_e/f/g`, `base_*` | CC0 menurut halaman; halaman pihak pertama pixiv memblokir bot → owner membuka dan menempel kalimat CC0 di chat (disimpan ke `licenses/vroid-alpha.txt`) | [AUTO] zip langsung OGA. 11–17 MB/file > budget 10 MB → butuh pengecualian budget yang disetujui owner di DECISIONS. Dump meta; bila bertentangan dengan CC0 → `BLOCKED`, tanya owner, jangan menulis ulang. Gaya anime + MToon → material toon palet zona |
| Protagonis (3) | pixiv AvatarSample A/B diekspor owner dari VRoid Studio sebagai VRM 1.0 | ketentuan **belum terverifikasi** (halaman memblokir bot) | [OWNER] membaca `vroid.pixiv.help/hc/en-us/articles/4402394424089` dan menempel ketentuannya di chat; bila tidak jelas → opsi ditolak |
| Animasi | (a) tujuh klip default paket (blockout); (b) UAL1 Standard OGA (`universal_animation_librarystandard.zip`, 2025-04-16, **nama tulang pra-v2.0** → peta tulang sendiri) dan UAL2 Standard OGA (2026-01-23); (c) opsional [OWNER]: UAL1/UAL2 Standard terbaru di itch ($0, varian "Root Motion disabled", penamaan rig sama dengan UBC v2.0+) | label CC0; catatan QAL seperti di atas | [AUTO] (b) OGA langsung. Daftar klip dan format **belum terverifikasi** sampai listing dibaca; bila tidak ada GLB/glTF → `BLOCKED` (Blender tidak ada). Slot wajib: idle, walk, run, jumpUp, jumpLoop, jumpDown (+ fall bila ada). Slot tanpa klip berlisensi tetap default paket dan tercatat sebagai gap. Muat dengan `removeXZMovement: true` |
| Audio | Kenney **Impact Sounds**, **Interface Sounds**, **UI Audio**, **Music Jingles** | CC0 | seperti Kenney di atas. Nama file footstep dicek dengan listing |
| Wind bed & angin jatuh | Sintesis WebAudio (kode sendiri) | — | tanpa file, tanpa baris manifest |
| Audio ekstra | Freesound CC0 | per-suara; API Freesound hanya non-komersial dan preview butuh key | [OWNER] unduh manual di browser dengan akun sendiri; satu baris manifest per URL suara |
| HDRI (IBL saja) | Poly Haven `industrial_sunset_puresky` / `kloppenheim_06_puresky` 1k | CC0 | [AUTO] `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/<id>_1k.hdr` (~1.2 MB) dengan header `User-Agent: VerticalAscent-fetch-assets/<versi>`. Hanya environment/IBL, background off; langit terlihat = drei `<Sky>` atau shader gradien palet zona |
| Font | `@fontsource-variable/inter` (paket npm, OFL-1.1, WOFF2 subset; Inter tidak mendeklarasikan Reserved Font Name) | OFL-1.1 | `pnpm add` (D-015). Teks OFL + copyright masuk `dist/THIRD_PARTY_LICENSES.txt` |
| Prosedural | awan low-poly gabungan primitif (non-collider, bercelah), beacon (mesh emisif + light), papan puncak palsu (CanvasTexture + font OFL), langit, wind | — | kode sendiri; bukan "pengganti diam-diam" |
| Prop tambahan | Poly Pizza API | campuran CC0/CC-BY | [OWNER] membuat key; opsional |

## Pipeline per kelas file

| Kelas | Aturan |
|---|---|
| GLB lingkungan/prop (lewat drei `useGLTF(url, false)`) | `pnpm exec gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify false --flatten false --join false --palette false --instance false` (tambah `--prune false` bila ada node penanda kosong). `gltf-transform inspect` sebelum/sesudah: nama node tidak berubah. Kenney GLB bisa merujuk `Textures/colormap.png` eksternal: jalankan optimize dari folder kit agar tekstur ter-embed, atau kirim `colormap.png` dengan baris manifest sendiri; catat `images[].uri` di manifest. Setiap GLB piece dimuat sekali dan dipakai ulang lewat `<Clone>` (tidak `<primitive>` dua kali). Gabung per zona (`dedup → join`) hanya bila draw call terukur (bayangan on) >500 |
| GLB karakter (`type: 'gltf'`) | meshopt boleh |
| GLB klip animasi | tanpa meshopt/quantize; hanya `split-clips` + prune |
| `.vrm` | **tidak pernah** lewat gltf-transform (ekstensi VRM tidak terdaftar dan hilang). Meta diedit hanya dengan `scripts/vrm-meta.mjs` |
| Gate | `check-assets.mjs` gagal bila ada file di `public/assets/animations/` atau `.vrm` yang memuat `EXT_meshopt_compression` atau `KHR_mesh_quantization` |

## Script

- `scripts/fetch-assets.mjs` — mengunduh hanya baris APPROVALS yang disetujui di sesi ini ke `.cache/downloads/<id>/`; cek ukuran dari header GET; sha256; tidak pernah scrape saat unduh; tidak memanggil `kenney.nl/download-link/*`.
- `scripts/split-clips.mjs` — `@gltf-transform/core` + `functions`: untuk setiap nama animasi, baca ulang input, buang animasi lain, `prune({ keepLeaves: true, keepAttributes: true })`, tulis `<nama>.glb` tanpa kompresi. Satu baris manifest per klip (`modifications_made: split from <pack>`).
- `scripts/vrm-meta.mjs` — rewriter GLB tanpa dependensi: parse header 12 byte + chunk JSON/BIN, edit `extensions.VRM.meta` atau `extensions.VRMC_vrm.meta`, pad JSON ke 4 byte, perbaiki panjang chunk dan total, BIN identik per byte; simpan meta asli ke `licenses/<id>.json` dulu. Meta final: `avatarPermission: everyone`, `commercialUsage: personalProfit|corporation`, `allowRedistribution: true` bila dikomit, `modification` sesuai pilihan, `thirdPartyLicenses` mengkredit basis.
- `scripts/check-assets.mjs` — setiap `.glb/.gltf/.vrm` di `public/`: baca chunk JSON → `asset.generator`, `extensionsUsed`, nama klip, meta VRM; gagal bila VRM0 `licenseName=Redistribution_Prohibited` / `commercialUssageName=Disallow` / `allowedUserName=OnlyAuthor`, atau VRM1 `allowRedistribution=false` / `commercialUsage=personalNonProfit` / `avatarPermission=onlyAuthor` / `modification=prohibited` (bila dimodifikasi); gagal bila file `public/` tanpa baris manifest; gagal pada aturan kelas di atas dan nama file terlarang.
- `scripts/glb-nodes.mjs` — dump nama node GLB ke evidence (untuk `boneMap`).

## Stub default paket

Library selalu meng-emit mannequin dan tujuh klip default sebagai chunk data-URL (import dinamis yang terjangkau). Mulai G2 PASS, plugin ini wajib aktif, kecuali untuk slot yang masih menunggu pengganti (gap):

```ts
// scripts/stub-viverse-defaults.ts
import type { Plugin } from 'vite'
export const stubViverseDefaults = (keep: string[] = []): Plugin => ({
  name: 'stub-viverse-default-assets',
  enforce: 'pre',
  load(id) {
    const m = id.split('?')[0].match(/@pmndrs[\\/]viverse[\\/]dist[\\/]assets[\\/](mannequin|idle|walk|run|jump-[a-z]+)\.js$/)
    if (m && !keep.includes(m[1])) return 'export const url = "data:,stubbed"'
  },
})
```
`prototype-texture` tetap selama `PrototypeBox` dipakai. Status manifest = `REMOVED` saat ter-stub; G5: `! rg -l "data:model/gltf-binary" dist`, kecuali slot gap.

## Lisensi di build

- `scripts/license-plugin.ts` (Vite, `generateBundle`): petakan `chunk.moduleIds` dan aset yang di-emit (mis. decoder Draco three, Apache-2.0) ke paket `node_modules`, sertakan LICENSE/LICENCE/COPYING verbatim; untuk `SEE LICENSE IN X` baca X (`@pmndrs/viverse` dan `@react-three/viverse` memuat juga blok MIT pixiv three-vrm); tambah bagian file vendored, OFL, dan lisensi aset dari manifest → `dist/THIRD_PARTY_LICENSES.txt`. Layar Credits menautkannya.
- File proyek: `LICENSE` (kode saja; MIT disarankan, keputusan owner) dengan kalimat "This license covers source code only. Assets under public/assets/ are licensed as described in ASSET_MANIFEST.md and CREDITS.md."; `public/assets/LICENSE-ASSETS.md`; `CREDITS.md` (baris TASL per aset CC-BY dan flag "modified").

## Gate string

Semua gate "0 hit" ditulis dengan `!` (rg exit 1 bila tidak ada hit; dengan `!` exit 0 = lulus).
- `! rg -n "https?://[^\"']+\.(vrm|glb|gltf|fbx|vrma|bvh|mp3|ogg|wav|png|jpg|hdr|ktx2)" src public`
- `! rg -n "['\"\`]/(assets|draco|audio|models|textures|fonts)/" src` (path runtime lewat `assetUrl`)
- `rg -n -i "\bonly[ _-]?up\b|fortnite|viverse-logo" src public index.html package.json | rg -v "pmndrs-example:" | (! grep .)` — baris komentar rujukan upstream berpola `pmndrs-example:` dikecualikan; nama file evidence diperiksa dengan `find evidence | grep -i -E "only[ _-]?up|fortnite"` (harus tanpa output).
- `dist/`: `rg -o --no-filename "https?://[^\"'\` )]+" dist/assets | sort -u > evidence/G5/dist-urls.txt`; setiap baris ada di `scripts/url-allowlist.txt` (URL namespace, react.dev/errors, lisensi vrm.dev, path Draco gstatic viverse dorman, URL preset drei dorman) atau dijelaskan di DECISIONS. Gate jaringan yang sebenarnya = HAR (TEST-18a, 18b, 20b).

## Kolom `ASSET_MANIFEST.md`

Satu baris per file di `public/` dan per aset data-URL yang terjangkau di `dist/`. Status manifest: `PLANNED | DOWNLOADED | INTEGRATED | REJECTED | REMOVED`. `repo_committable`: `YES | BUILD-ONLY | NO`.

`id | path | category | purpose | title | author | source_url | source_platform | license_id | license_label_as_displayed | license_snapshot | obtained_on | obtained_by | tier_or_price | repo_committable | attribution_required | attribution_text | modification_allowed | modifications_made | redistribution_in_build | vrm_meta_version | vrm_meta_flags | format | file_size | sha256 | integration_status | notes`

Baris wajib sejak G0: `pmndrs-avatar-miko` (REJECTED: meta VRM melarang), `pmndrs-fortnite-map` (REJECTED: tanpa lisensi), `pmndrs-fortnite-clips` (REJECTED: UAL Pro berbayar), `viverse-mannequin` (Quaternius; INTEGRATED blockout → REMOVED via stub), `viverse-default-anims` (Quaternius UAL, tier belum terverifikasi; sama), `viverse-prototype-texture` (Kenney CC0; selama `PrototypeBox` dipakai), `favicon` (OWN-ARR).
