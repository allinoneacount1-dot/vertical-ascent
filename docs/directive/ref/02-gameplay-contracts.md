# ref/02 — Kontrak gameplay

## State table

State: `LOADING | ERROR | MENU | PLAYING | PAUSED | VICTORY`; mode: `run | freeRoam`. "via enterPlaying()" = klik → `requestPointerLock` → PLAYING hanya setelah `pointerlockchange → canvas` (D-004). Pasangan (state, event) yang tidak tercantum = **ignored**; TEST-35a (subset G1) dan TEST-35b (semua) mengenumerasinya.

| Dari | Event | Ke |
|---|---|---|
| LOADING | aset wajib siap dan `worldReady` | MENU |
| LOADING | aset wajib gagal / `webglcontextcreationerror` | ERROR (tampilkan URL yang gagal; hanya reload) |
| MENU | Play (tanpa run tersimpan) | PLAYING via enterPlaying() (run baru) |
| MENU | Continue (`va.run.v1` valid) | PLAYING via enterPlaying() (run dilanjutkan) |
| MENU | New climb (konfirmasi bila ada run tersimpan) | PLAYING via enterPlaying() (run baru, save lama dihapus) |
| PLAYING | `pointerlockchange → null` / `visibilitychange → hidden` / `blur` / `P` | PAUSED |
| PLAYING | `inFinish && isGroundedRaw` di step yang sama, mode run | VICTORY |
| PLAYING | kill plane | PLAYING (respawn, run sama) |
| PLAYING | `webglcontextlost` | PAUSED + overlay |
| PAUSED | Resume | PLAYING via enterPlaying() |
| PAUSED | Restart (konfirmasi) | PLAYING via enterPlaying() (run baru) |
| PAUSED | Save & quit to menu | MENU (run tetap, timer beku, ditulis ke `va.run.v1`) |
| PAUSED | `webglcontextlost` | PAUSED + overlay |
| PAUSED + overlay | `webglcontextrestored` lalu klik Resume | PLAYING via enterPlaying() |
| VICTORY | Replay | PLAYING via enterPlaying() (run baru) |
| VICTORY | Free roam | PLAYING via enterPlaying() (mode freeRoam: tanpa timer, PB, save, sensor finish) |
| VICTORY | Menu | MENU |
| ERROR | — | hanya reload |

Di G1, MENU = layar Click-to-Play dengan tombol Play saja; baris Continue/New climb/Save & quit masuk di G3.

## Frame order (useFrame priority; tidak ada priority positif)

| Priority | Isi |
|---|---|
| -3 | Hitung perpindahan platform frame ini → `n = max(1, ceil(disp / 0.2))`. Bila `n == 1`: world clock (waktu simulasi, berhenti di PAUSED) → animasi platform kinematic (grup mover) via `motion.advance(dt)` → `updateMatrixWorld(true)` → registry prev/cur. Bila `n > 1`: tidak memajukan apa pun; controller yang melakukannya per irisan |
| -2 | Controller: input → `sprintActive` → velocity → untuk tiap irisan `i < n`: (bila `n > 1`: `motion.advance(dt/n)` + registry) → carry → `port.step(dt/n)` → sensor/victory → `lastSafe` |
| -1 | Kamera (`CharacterCameraBehavior.update` dengan `camRaycast`) |
| 0 | Mixer/VRM (dari loader), HUD store (≤10 Hz), audio, blob shadow |

Priority positif mematikan auto-render R3F — tidak dipakai. Saat PAUSED: physics dan world clock tidak maju, `mixer.timeScale = 0`. Pemanggilan `motion.advance` dari -2 saat frame dipecah bukan pelanggaran urutan TEST-32.

## Pemilik besaran

| Besaran | Ditulis hanya oleh |
|---|---|
| Posisi & velocity karakter | `src/physics/character-physics.ts` lewat `CharacterPhysicsPort` (`step`, `jump`, `impulse`, `teleport`, `applyCarry`, `resetVelocity`) |
| `inputVelocity`, `sprintActive`, buffer jump, `groundBody` (hasil probe carry) | `src/controller/` |
| `camera.position` / `camera.rotation`, `zoomDistance` | `src/camera/` |
| Transform platform kinematic, world clock | `src/level/motion.ts` (dipanggil di -3, atau per irisan dari -2) |
| Timer run, counter run | `src/game/run.ts` |
| State machine | `src/game/state.ts` |

Cek G1 (langkah 9; `!` = lulus bila tidak ada hit; glob, bukan `| rg -v`, karena rg di Windows mencetak backslash):
`! rg -n "camera\.(position|rotation)\.(set|copy|add)|zoomDistance\s*=" src -g '!src/camera/**'`
`! rg -n "inputVelocity" src -g '!src/physics/**' -g '!src/controller/**'`
`! rg -n "applyVelocity|stateVelocity" src -g '!src/physics/**'`

## Storage

Semua dibaca dengan `try/catch` + validasi tipe dan rentang; versi tidak dikenal → default + satu `console.warn` (bukan `console.error`, yang digagalkan runner).

```ts
// va.records.v1
{ v: 1, bestTimeMs: number | null, bestHeightM: number, completions: number, restartCount: number,
  lifetimeBigFalls: number, reachedFakeSummit: boolean }
// validasi: 0 <= bestHeightM <= summitY + 50; bestTimeMs === null || bestTimeMs > 1000; counter integer >= 0

// va.settings.v1
{ v: 1, lang: 'id' | 'en', sensitivity: number /*0.2..3*/, invertY: boolean, rawInput: boolean, fov: number /*60..100*/,
  sprintKick: boolean, sprintMode: 'hold' | 'toggle' | 'always', edgeGuard: boolean, showTimer: boolean,
  uiScale: number /*1..2*/, renderScale: number /*0.5..1*/, volume: { master: number, sfx: number, ambience: number },
  bindings: Record<ActionId, string[] /* KeyboardEvent.code */> }

// va.run.v1 (D-009)
{ v: 1, lastSafe: [number, number, number], yaw: number, timerMs: number, killPlaneRespawns: number,
  bigFalls: number, metersLost: number, highestM: number, focusUsed: boolean, savedAt: string }
```
Ditulis: records saat VICTORY dan maksimum grounded baru; settings saat berubah; run pada `pagehide`, `visibilitychange → hidden`, Save & quit.

## Run semantics (ringkas D-007/D-008/D-009)

| Kejadian | Timer | Height | Counter | Save |
|---|---|---|---|---|
| Jatuh ke permukaan di bawah | lanjut | turun | `bigFalls++` bila bigFall; `metersLost += Δ` | `lastSafe` diperbarui saat grounded statis |
| Kill plane | lanjut | ke 0 | `killPlaneRespawns++` | `lastSafe = spawn` |
| PAUSED / hidden | berhenti | — | — | ditulis pada hidden |
| Save & quit | beku | — | — | ditulis |
| Restart / New climb | 0 | 0 | `restartCount++` (records) | dihapus |
| VICTORY (run) | beku | — | `completions++` | dihapus |
| Free roam | mati | ditampilkan | — | tidak ditulis |

## `window.__game`

Produksi (read-only, untuk observasi test dan debugging):
```ts
{ ready: boolean, worldReady: boolean, state: State, mode: 'run' | 'freeRoam',
  player: { pos: [x, y, z], vel: [x, y, z], groundedRaw: boolean, canJump: boolean, airborne: boolean, bigFall: boolean, groundBody: string | null },
  run: { timerMs: number, heightM: number, highestM: number, killPlaneRespawns: number, bigFalls: number, metersLost: number, focusUsed: boolean },
  hud: { targetM: number, showTimer: boolean }, inputLocked: boolean,
  camera: { yaw: number, pitch: number, distance: number, fov: number },
  model: { uuid: string }, anim: { clip: string | null, mixerTime: number },
  simTime: number, worldClock: number, frame: number,
  platforms: Record<string, { phase: number }>,
  audio: { master: number, sfx: number, ambience: number, wind: number, contextState: string },
  render: { calls: number, triangles: number, geometries: number, textures: number, programs: number },
  bvh: { buildMs: Record<string, number>, tris: Record<string, number> },
  events: Array<{ t: number, type: string, data?: unknown }> /* ring buffer 500 */ }
```
Dev saja (`import.meta.env.DEV`): `__debugTeleport(p)`, `__debugSetVelocity(v)` — hanya untuk setup di lapisan physics/smoke dan di `play-noisy.ts`, dicatat di baris TEST; tidak pernah di `rehearsal.ts`/`play.ts`. G5: `! rg -l "__debugTeleport|__debugSetVelocity" dist`.
