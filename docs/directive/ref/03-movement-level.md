# ref/03 — Gerak, data level, aturan desain

## Movement

Nilai di bawah adalah **seed** untuk konfigurasi. Angka yang dipakai validator, margin, dan TEST-06 adalah hasil **ukur** harness physics G1 (vendored physics, `updatesPerSecond: 240`, `jump(speed)` yang menyetel `vy`), ditulis ke `level/movement.json`. Rumus analitik dan replika lama (apex ≈1.52–1.55 m dengan impulse aditif) tidak dipakai sebagai target.

| Parameter | Seed | Catatan |
|---|---|---|
| Walk / run | 3 / 6 m/s | `update-input-velocity.ts:22,28` (salinan proyek membaca `sprintActive`) |
| Jump | `jump(8)` menyetel `vy = 8` | apex analitik 1.6 m, airtime 0.8 s — diukur ulang |
| Gravity / damping | -20 m/s² / 0.1 | |
| Kapsul | r 0.4 m, h 1.7 m, pivot kaki | |
| `maxGroundSlope` | 1.0 (45°) eksplisit | |
| `updatesPerSecond` | 240 | D-011 |
| Coyote (`canJump`) | 0.12 s | `isGroundedRaw` untuk semua kegunaan lain |
| Jump buffer / re-jump | 0.10 s / 0.30 s | waktu simulasi |
| Wind-up | ≤0.05 s, animasi saja | |
| Air control | instan 100 % | baseline |
| Step-up implisit | ≈0.12 m | tangga → ramp collider |
| Overhang tepi maksimum | ≈0.28 m (`r·sin45°`) | sebelum tergelincir |

`level/movement.json` (G1): `{ ups, apexM, airtimeS, reach: { walk: { flat, up1m, down2m }, run: { flat, up1m, down2m } }, coyoteS, measuredAt, commit }`.

**Margin desain** (rasio terhadap jangkauan run terukur untuk Δh yang sama): Z1 ≤0.80, Z2 ≤0.88, Z3 ≤0.93, Z4 ≤0.95; kenaikan ≤0.85 × apex terukur; tidak ada lompatan yang **memerlukan** coyote. Toleransi takeoff awal pada batas margin = `(1 - m) * reach / v_run` ≈ 160 / 96 / 56 / 40 ms untuk Z1–Z4 — margin batas hanya untuk lompatan yang sengaja ditandai `precision`.

**Ukuran permukaan**: nyaman ≥1.6 m; sempit 1.0 m (Z2+); balok ≥0.6 m; pad pendaratan lompatan maksimum ≥1.2 m dalam; tebal collider ≥0.5 m. Rest pad ≥3×3 m tanpa hazard dalam 3 m.

## Data level (sumber kebenaran tunggal)

`src/level/schema.ts` mendefinisikan tipe dan dipakai game, lint, test, dan pembangkit rute.

```jsonc
// level/prefabs.json
[{ "id": "kenney-platformer-block-large", "glb": "assets/env/kenney-platformer/block-large.glb", "node": null,
   "kit": "kenney-platformer", "scale": 1.0,                       // = skala kit tercatat (§Skala kit)
   "collider": { "type": "box", "size": [4, 1, 4], "offset": [0, -0.5, 0] },
   "walkable": true, "surface": "concrete", "scaleCue": false }]

// level/<zone>.json  (z1, z2, z3, z4, slice)
{ "zone": "z1", "seed": null, "platforms": [
  { "id": "z1-007", "prefab": "kenney-platformer-block-large", "pos": [12, 6.5, -3], "rotY": 0,
    "tag": "route" | "rest" | "catch" | "decor" | "skip" | "discovery" | "hazard",   // hazard = obstacle sapuan/berputar
    "precision": false, "landmark": false, "fakeSummit": false, "trap": null | { "fork": "z4-trap-a", "safe": true },
    "motion": null | { "type": "linear" | "loop" | "rotate", "points": [[...],[...]], "axis": [0,1,0],
                        "periodS": 4, "phaseS": 0, "dwellS": 0.6 } }
]}
```
- AABB tiap platform diturunkan dari `collider.size`, `offset`, `pos`, `rotY`; collider box dibangkitkan dari situ (D-013). Visual GLB diletakkan di atasnya, di luar body.
- `src/level/motion.ts` mengevaluasi `motion(t)` dari world clock; dipakai game, lint, dan bot.
- Rute bot `vitexec/routes/<slice|main>.json` **dibangkitkan** oleh `scripts/build-routes.mjs` dari urutan platform bertag `route` (zona sebagai field waypoint). Tidak diedit tangan.
- Generator offline `tools/level-gen.mjs` (opsional): seed tetap dicatat di header JSON; output dikomit dan boleh diedit tangan; `src/` tidak pernah mengimpornya; setiap pasangan harus lulus lint dan sim test sebelum commit.

`level/beats.json` (G3, sebelum membangun zona):
```json
[{ "zone": "z1", "bandM": [0, 35], "jumps": [20, 30], "restEveryJumps": 6, "maxChain": 8 },
 { "zone": "z4", "bandM": [140, 190], "jumps": [25, 40], "restEveryJumps": 10, "maxChain": 14,
   "fakeSummitAtM": 165, "trapBetweenM": [165, 180], "cloudLayerM": [70, 95] }]
```
Nilai di atas contoh; agen memilih seed, `summitY` mengikuti level yang terbangun.

## Skala kit

Untuk setiap kit, setelah impor ukur node referensi (pintu atau railing) dan catat satu skala seragam di `prefabs.json` sehingga pintu ≈2.1 m dan railing ≈1.1 m. Instans dari prefab ber-`scaleCue: true` memakai skala kit itu tanpa diubah. Prop yang sengaja raksasa (mis. mobil 6× sebagai platform) boleh, tetapi memakai prefab tersendiri ber-`scaleCue: false`.

## Aturan desain (D-022)

- **Zona**: Z1 The Beginning (urban, lantai nyata, tutorial lewat desain), Z2 Industrial Ascent (crane, scaffolding, pipa, platform besi), Z3 Sky Obstacles (struktur melayang, platform bergerak, obstacle berputar, timing), Z4 The Summit (puncak palsu → jebakan → puncak asli). Satu landmark per zona ≥15 m dengan siluet khas, terlihat dari pintu masuk zonanya dan dari zona di bawahnya (`landmark: true`).
- **Z1**: tidak ada miss yang mahal; ≥2 lompatan presisi (pad ≤1.2 m) yang bila meleset kehilangan ≤2 m; urutan wajib: walk-gap ≤1.5 m → step-up ≤1.2 m → sprint-gap (> jangkauan walk, ≤0.80 run) dengan run-up terlihat → platform bergerak pertama di ketinggian rendah dengan landasan lebar.
- **Tangga keterampilan**: walk-gap → step-up → sprint-gap → drop-down → moving platform → timed obstacle → lompatan diagonal/putar kamera → drop panjang ke pad kecil → chain tanpa rest. Setiap keterampilan diperkenalkan terisolasi dengan fall cost ≤10 m sebelum dikombinasikan; dicatat di `GAME_DESIGN.md`.
- **Fall cost**: dari setiap lompatan rute `i`, simulasikan miss: pendek 0.5 m, lateral ±0.5 m, dan berjalan keluar dari tiap 4 tepi pad asal. Fall cost = `y_top(asal) - y(tempat mendarat)`. Budget: Z1 ≤10 m, Z2 ≤30 m, Z3 ≤80 m, Z4 ≤120 m, dengan ≤3 pengecualian per zona di Z3–Z4 yang boleh jatuh sampai "lantai zona" (= permukaan `catch`/`rest` tertinggi di atau di bawah tepi bawah pita zona). Setiap permukaan tempat mendarat punya node `route` dalam ≤2 lompatan.
- **Platform bergerak**: periode ≥3 s, dwell ≥0.5 s di tiap ujung, jendela mendarat ≥0.6 s pada lompatan yang dibutuhkan, jalur gerak terlihat (rel/tanda). Obstacle sapuan: ≤8 m/s, tebal ≥0.5 m, clearance ≥2.0 m vertikal / ≥1.1 m horizontal dari collider statis.
- **Sightline**: dari ketinggian mata (kaki + 1.3 m) di setiap node rute, ≥6 dari 9 titik sampel di pad rute berikut tidak terhalang dalam pitch [-45°, 30°] pada FOV default; pengecualian hanya node bertag `discovery` (≤3 per zona).
- **Grammar walkable**: setiap permukaan yang dipakai rute membawa isyarat bersama (trim tepi hangat / top lebih terang), tidak dipakai dekorasi; isyarat platform bergerak lewat bentuk/pola/gerak, bukan warna saja.
- **Tag**: setiap permukaan >1 m² di setiap level (termasuk Z1 dan slice) bertag. `catch` harus punya `route` dalam ≤2 lompatan. Tidak ada jalan buntu tanpa tanda (`rest` = ceruk dengan pemandangan).
- **Skip**: skip yang merusak dicegah terutama dengan geometri **terlihat** (jarak, overhang, jaring, material "not climbable"); blocker tak terlihat jalan terakhir, ≥1 m di belakang geometri terlihat, dicatat di `GAME_DESIGN.md`. Skip opsional (`skip`, di luar rute emas, failure cost dalam budget zona, divalidasi sim test) boleh.
- **Puncak palsu**: sampai pertama kali dicapai, target HUD = `fakeSummitY` dan beacon aktif ada di puncak palsu; puncak asli tidak bercahaya dan tersembunyi di atas pita awan/fog. Saat sensor puncak palsu terpicu dalam keadaan grounded: papan orisinal (tidak memakai kata "Winner"), stinger, **tanpa** pergantian state, timer jalan, split `fakeSummit` di-log. Setelah ±3 s beacon menyala di puncak asli dan target HUD = `summitY`. `records.reachedFakeSummit = true` membuat run berikutnya langsung menampilkan target asli.
- **Jebakan**: percabangan 2–3 opsi yang mirip dekat puncak palsu, dibangun dari mekanik yang ada (pad statis, platform bergerak, sapuan). Tepat satu opsi melanjutkan rute dan membawa tanda yang konsisten dan terdokumentasi (mis. penyangga terlihat atau trim walkable); pilihan salah ≤ budget fall cost Z4 dan mendarat di permukaan `catch`. Platform runtuh hanya tambahan opsional setelah TEST-11a lulus.
- **Isyarat ketinggian**: objek berskala manusia (instans prefab `scaleCue: true`) setiap ≤15 m ketinggian; lapisan awan prosedural **bercelah** di ~40–55 % tinggi yang tetap menjaga garis pandang spawn → beacon aktif dan puncak → kota; kota awal terlihat sebagai "peta"; bidang tanah/laut non-collider sampai ≥1.2× fog far sehingga tepi dunia tidak terlihat.
- **Kill plane**: `floorAABB` = AABB footprint rute ±120 m; setiap XZ permukaan berada di dalam `floorAABB`.

## Lint (TEST-36, `scripts/level-lint.mjs` → `evidence/G3/TEST-36-lint.json`)

Satu script untuk semua pemeriksaan statis level: skema & prefab ada; collider walkable ada; tag 100 %; fall cost per zona vs budget + pengecualian; landasan setiap miss punya `route` ≤2 lompatan; margin lompatan per zona vs `movement.json`; kenaikan ≤0.85 apex; jendela mendarat ≥0.6 s (sampling fase 50 ms); periode ≥3 s & dwell ≥0.5 s; clearance jalur sapuan setiap platform bertag `hazard`; kepadatan rest dan `maxChain` vs `beats.json`; discovery ≤3 per zona; tepat satu puncak palsu dan satu trap dengan tepat satu opsi `safe`; isyarat skala setiap ≤15 m; skala kit sesuai `prefabs.json`; blocker tak terlihat tercatat; semua permukaan di dalam `floorAABB`; jumlah segitiga tabrakan semua world ≤300k. Pasangan yang lulus rumus tetapi belum dilewati sim test atau bot ditandai `ROUTE-UNPROVEN` (flag level, bukan status TEST).

Sim test (`src/level/reachability.sim.test.ts`, vitest Node): untuk setiap pasangan rute, physics vendored pada dunia dua-kotak dengan input "run + jump di tepi" → `isGroundedRaw` di tujuan ≤3 s.
