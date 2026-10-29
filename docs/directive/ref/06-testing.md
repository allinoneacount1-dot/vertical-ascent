# ref/06 — Pengujian

## Alat dan fakta vitexec 0.9.0 (diukur 2026-10-29)

- Menjalankan Vite dev server sendiri (middleware mode); tidak bisa menarget URL lain atau `dist/` → test produksi memakai `scripts/smoke-dist.mjs`.
- Script dicari: path langsung → `./vitexec/<nama>` → kode inline. Selalu by path.
- Flag: `--screenshot <path>` (setelah script selesai), `--record <path>` (MP4 AV1+Opus), `--record-fps`, `--headed`, `--no-gpu` (SwiftShader; **tidak ada** `--gpu`), `--viewport WxH` (default 1280x720), `--timeout <detik>` (default 600), `--network-trace <path>` (HAR), `--heap-snapshot <path>` (diagnosis saja, file besar), `--cpu-profile <path>`, `--performance-trace <path>`, `--browser-arg <arg>` (berulang), `--path`, `--config`.
- Exit: `throw` / `await` yang reject di level atas → exit 1. Error di dalam callback (setTimeout, event), reject yang tidak di-await, `console.error`, request gagal → hanya baris log (`[page error]`, `[error]`, `[request failed]`, `[http N]`, prefiks `[late <id>]`) dengan exit 0 → runner wajib.
- Input: `import { mouse, keyboard } from 'vitexec'` menghasilkan event **trusted** yang mematuhi fokus dan pointer lock; pointer lock headless nyata berfungsi (klik → `pointerlockchange → canvas`; `mouse.move(dx, dy)` mengirim `movementX/Y`). Signature persis dan opsi lama tahan tombol: `node_modules/vitexec/skills/vitexec/references/inputs.md` (default press ≈80 ms) — baca, jangan tebak.
- Di bawah Playwright: `keyboard.press('Escape')` saat terkunci **tidak** melepas lock; `document.exitPointerLock()` lalu klik setelah ~200 ms berhasil re-lock (cooldown 1.25 s tidak muncul).
- `fetch('/tidak-ada.glb')` di dev server mengembalikan 200 `text/html` (fallback SPA) — karena itu `appType: 'mpa'` (ref/01) dan pemeriksaan content-type di TEST-18a/18b.

## Probe G0

```ts
// vitexec/probes/env.ts
const gl = document.createElement('canvas').getContext('webgl2')
if (!gl) throw new Error('no webgl2')
const ext = gl.getExtension('WEBGL_debug_renderer_info')
const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
console.log('env ' + JSON.stringify({ ua: navigator.userAgent, renderer, vendor, dpr: devicePixelRatio, ext: !!ext }))
if (/swiftshader|llvmpipe/i.test(String(renderer))) console.warn('software renderer')
```
`getParameter(37446)` tanpa `getExtension('WEBGL_debug_renderer_info')` mengembalikan `null` — jangan dipakai. Setiap script performa dan smoke mencatat string renderer dengan cara yang sama.

```ts
// vitexec/probes/first-run.ts — tunggu render nyata sebelum --screenshot diambil
const t0 = performance.now()
while (!document.querySelector('canvas')) { if (performance.now() - t0 > 15000) throw new Error('no canvas'); await new Promise(r => setTimeout(r, 100)) }
let frames = 0
await new Promise<void>(res => { const f = () => (++frames >= 60 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f) })
console.log('first-run frames=' + frames)
```
(Setelah G1, tunggu juga `window.__game?.worldReady`.)

## Runner `scripts/run-test.mjs` (G1)

Dua mode:
- `node scripts/run-test.mjs <TEST-id> [--slug <s>] -- <args vitexec>` → spawn `pnpm exec vitexec …`.
- `node scripts/run-test.mjs <TEST-id> [--slug <s>] --cmd "<perintah>"` → untuk unit (`pnpm vitest run <file>`), static (`node scripts/level-lint.mjs` dll.), dan prod (`node scripts/smoke-dist.mjs …`).

Keduanya men-tee stdout+stderr ke `evidence/G<n>/TEST-<id>-<slug>.log`, dengan `G<n>` = gate sesi berjalan (dari baris `RESUME HERE` di PROGRESS) dan `slug` default `run`. Exit 1 bila exit perintah ≠0 **atau** ada baris yang cocok `/^(\[late [^\]]+\] )?\[(page error|error|request failed|http [45]\d\d)\]/m`. Run panjang: Bash background + `--timeout` (DIRECTIVE §2.3).

## Lapisan

| Lapisan | Cara |
|---|---|
| physics | Harness headless di vitexec atau vitest: `const root = new Group(); const ch = new Object3D(); root.add(ch)`; world dari `@pmndrs/viverse`; physics vendored; `step(dt)` deterministik tanpa render; dt mentah (tanpa clamp app) kecuali TEST menyebut lain. Pola: `pmndrs-example:fortnite/vitexec/physics-framerate.ts` dengan import `/src/...`. |
| smoke | Script vitexec in-page; input hanya `mouse`/`keyboard` vitexec; lock dari klik nyata pada tombol Play, diverifikasi `document.pointerLockElement === canvas`; observasi lewat `window.__game`. |
| route | Bot loop-tertutup (§Route bot). |
| unit | vitest Node, `src/**/*.test.ts`; impor hanya `three`, `@pmndrs/viverse`, dan modul app tanpa `@react-three/*` (di Node R3F memuat build CJS → instance three kedua). |
| static | script Node + `rg`. |
| prod | `scripts/smoke-dist.mjs`. |
| manual | Owner (§Playtest). |

## Allowlist setup sintetis (selain ini dilarang di script evidence)

| TEST | Setup | Label di log |
|---|---|---|
| 14a, 14b, 26 | `document.exitPointerLock()` sebagai pengganti Esc pengguna | `stand-in: exitPointerLock` |
| 14b | `HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('', 'SecurityError'))` sementara, lalu dipulihkan | `synthetic: lock-reject-stub` |
| 28a | `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })` + `document.dispatchEvent(new Event('visibilitychange'))`; `window.dispatchEvent(new Event('blur'))` | `synthetic: visibility/blur` |
| 25 | ubah ukuran elemen container Canvas in-page (R3F mengukur parent lewat ResizeObserver) 1280x720 → 800x1000 | `synthetic: container-resize` |
| 26 | `gl.getExtension('WEBGL_lose_context').loseContext()` / `.restoreContext()` | `synthetic: context-loss` |
| 30 | `pagehide` lewat `page.reload()` Playwright di smoke-dist | `prod: reload` |
| 05 | seed `localStorage['va.settings.v1']` (sprintMode) sebelum load | `synthetic: settings-seed` |
| 32 | patch `prototype.update` untuk mencatat urutan (bukan input) | `synthetic: order-probe` |
| 02, 12a, 12b, 15, 17, 29, 37, 40, 38 | `window.__game.__debugTeleport` / `__debugSetVelocity` (DEV saja) untuk menempatkan pemain sebelum asersi | `debug-setup` |

Shim `pointerLockElement` dan `dispatchEvent` event input **tidak** dipakai; bila suatu saat lock headless gagal, catat error-nya sebagai D-0xx dulu.

## Route bot

- `vitexec/routes/<slice|main>.json` dibangkitkan (ref/03). Waypoint: `{ id, zone, pos, padRadius, needsSprint, needsJump, jumpAt?, waitPhase?: { platform, window } }`.
- Loop per frame: baca `window.__game.player` → pilih tombol manusia (W/A/S/D/Shift/Space) dan yaw `mouse.move` → tunggu frame. Timeout per waypoint; ≤3 retry per segmen dengan berjalan kembali seperti manusia; tanpa teleport, tanpa menulis posisi, tanpa mengubah opsi physics, tanpa `__debug*`.
- Bukti: `.mp4` (`--record`), `milestones.json` (waktu, tinggi, zona per waypoint), screenshot tiap masuk zona, dump state akhir, sampel animasi 10 Hz `{ t, clip, groundedSpeed }` (kriteria G4).
- Alur: probe sekali-pakai (≤30 per proyek) → `vitexec/rehearsal.ts` → salin ke `vitexec/play.ts` → jalankan `play.ts` dua kali berturut-turut. Setelah full-route pertama, tidak ada probe one-off baru dan tidak ada retune game; kegagalan presisi berulang → sederhanakan rute dan mulai lagi dari rehearsal.

## Noisy bot (TEST-38, diagnostik)

`vitexec/play-noisy.ts`: bot yang sama dengan error manusia ber-seed (delay reaksi ~180 ±40 ms, jitter yaw, noise waktu takeoff), tanpa retry, lanjut dari tempat mendarat. ≥5 seed per zona sebelum rute dibekukan; boleh mulai di pintu masuk zona lewat `__debugTeleport` (hanya di script ini, output bertanda diagnostik). Output `evidence/G3/noisy-bot.json`: tingkat gagal per lompatan, median waktu per zona. Dipakai memilih lompatan yang disederhanakan; tidak menentukan PASS.

## Smoke produksi `scripts/smoke-dist.mjs`

- Playwright `1.63.0-beta-1788477194000` (devDependency; memakai Chromium 1243 yang sudah ada), `chromium.launch({ channel: 'chromium', args: [...] })`.
- Ditulis di G3 (TEST-30 butuh `page.reload()`), dipakai lagi di G4 dan G5.
- Melayani `dist/` (atau folder zip terekstrak) dengan server `node:http` + `fs` di dalam script pada `http://127.0.0.1:5180/<base>` dengan `--base sub/` atau `--base sub/dir/` (**tanpa** slash di depan — Git Bash mengubah `/sub/` menjadi path Windows); tidak butuh server terpisah.
- `recordHar`; input lewat `page.mouse`/`page.keyboard`; asersi TEST-01 dasar, TEST-18b, TEST-21 (termasuk Σ bake BVH dan segitiga dari `__game.bvh`), TEST-27 (args `--js-flags=--expose-gc --enable-precise-memory-info`; `gc()` lalu `performance.memory.usedJSHeapSize` sebelum restart 1 dan setelah restart 10), TEST-30 (`page.reload()` lalu Continue), angka first-load dan frame time spawn untuk TEST-22.
- Frame time rute penuh TEST-22 tetap dari vitexec (bot butuh input vitexec), berlabel "dev build".

## Performa (TEST-22, `PERFORMANCE_REPORT.md`)

- Dua run script yang sama: (a) default (harus NVIDIA RTX 2050), (b) `--browser-arg=--force_low_power_gpu` (harus Intel UHD). Renderer tidak cocok → run itu `NOT-VERIFIED(gpu-mismatch)`. Tidak pernah `--use-angle=gl`; `--no-gpu` bukan data performa. Agen tidak mengubah Windows Settings/registry.
- Daya: `powershell -NoProfile -c "(Get-CimInstance Win32_Battery).BatteryStatus"` → 2 = AC; dicatat. Pemanasan 5 menit.
- Blok baseline: CPU, GPU (string renderer), RAM, OS, versi Chromium, ukuran canvas, DPR, `dpr` efektif, refresh rate terukur (timestamp rAF), status daya, render scale.
- Metrik: p50/p95/p99 frame time di spawn / tengah / puncak selama segmen 60 s; `renderer.info.render.calls/triangles` (bayangan on); `renderer.info.memory`; waktu `step()` physics; heap. Sasaran lunak: p95 ≤20 ms (NVIDIA), ≤33 ms (Intel). Dilaporkan, bukan dihakimi.
- Preview pane manusia dicatat terpisah; renderer-nya bisa berbeda.

## Playtest owner (manual)

G2 dan G3, bila owner bersedia: main sekali di preview, catat menit, jumlah jatuh, lompatan yang terasa "dimakan", tempat tersesat; untuk TEST-14b juga tekan Esc lalu klik Resume dalam 1 s dan setelah 2 s → ditempel ke TEST_REPORT sebagai "manual playtest: <kutipan>". Tanpa itu: `BLOCKED(owner-manual)` (gap kelas (a), tidak membuat gate FAIL).

## Evidence index

`scripts/list-evidence.mjs` → `evidence/INDEX.md` (path, sha256, TEST-id); `scripts/test-report.mjs` → `TEST_REPORT.md` dari baris TEST di PROGRESS, gagal bila path evidence yang ditautkan tidak ada.

## Perintah (Git Bash, root project)

```bash
node scripts/run-test.mjs 31 --slug framerate -- ./vitexec/physics-framerate.ts
node scripts/run-test.mjs 09 --slug camera -- --screenshot ./evidence/G1/TEST-09-camera.png ./vitexec/smoke-camera.ts
node scripts/run-test.mjs 20b --slug full-route -- --timeout 1800 --record ./evidence/G3/TEST-20b-full-route.mp4 --network-trace ./evidence/G3/TEST-20b-dev.har ./vitexec/play.ts   # background
node scripts/run-test.mjs 22 --slug perf-intel -- --browser-arg=--force_low_power_gpu ./vitexec/perf-route.ts                                                                # background
node scripts/run-test.mjs 35b --slug state --cmd "pnpm vitest run src/game/state.test.ts"
node scripts/run-test.mjs 36 --slug lint --cmd "node scripts/level-lint.mjs"
pnpm build && node scripts/run-test.mjs 21 --slug dist --cmd "node scripts/smoke-dist.mjs --dist dist --base sub/"
```
