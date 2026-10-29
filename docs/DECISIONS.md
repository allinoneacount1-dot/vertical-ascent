# DECISIONS

Seeds summarise the spec (`docs/directive/DIRECTIVE.md` §3); the spec text is authoritative.

## D-001 Hybrid controller
useCharacterModelLoader + vendored physics + game-owned velocity/sprint/jump + directly instantiated CharacterCameraBehavior + CharacterAnimationAction graph. `<SimpleCharacter>` only in the G0 smoke scene. Loader option objects are module constants in `src/character/rig.ts`. — source: directive §3 D-001

## D-002 Vendored physics
Copy `packages/viverse/src/physics/index.ts` to `src/physics/character-physics.ts` behind CharacterPhysicsPort: updatesPerSecond 240, jump(speed) sets vy, isGroundedRaw vs canJump (coyote 0.12 s), resetVelocity/teleport/applyCarry, forceWriteBack rules, keep world.updateSensors(). — source: directive §3 D-002

## D-003 BvhPhysicsWorld, no Viverse provider
No clientId, .env.production, viverse-cli or useViverse*. Gate: `! rg -l "viverse\.com|sdk-api|htcvive" dist/assets`. — source: directive §3 D-003

## D-004 Input and pointer lock
Keyboard + pointer-lock bindings mounted once; every entry into PLAYING goes through enterPlaying() and commits only on pointerlockchange → canvas; jump gated on PLAYING + lock. — source: directive §3 D-004

## D-005 React DOM UI
No uikit; HUD via zustand at ≤10 Hz; Canvas never unmounts; StrictMode kept. — source: directive §3 D-005

## D-006 State machine
LOADING | ERROR | MENU | PLAYING | PAUSED | VICTORY + mode run/freeRoam; falling is a character flag; PLAYING requires worldReady. — source: directive §3 D-006

## D-007 Falls, kill plane, restart
No damage; kill plane y < -20 or outside floorAABB+10 m = same run; Restart (confirmed) = new run. — source: directive §3 D-007

## D-008 Timer, height, records
Unscaled clamped PLAYING timer; HUD target fakeSummitY then summitY; counters and PB rules as spec. — source: directive §3 D-008

## D-009 Save-on-quit + Continue
lastSafe on static ground only; Save & quit to menu; Continue / New climb. — source: directive §3 D-009

## D-010 Movement verbs
Walk, sprint (game-owned sprintActive; Toggle default, tap-only), fixed jump arc; Focus optional G4 (sets focusUsed, no PB). — source: directive §3 D-010

## D-011 Physics stepping
updatesPerSecond 240; app clamp 0.1 s; skip while PAUSED; frame split for platforms > 0.2 m/frame; sim-time jump timers. — source: directive §3 D-011

## D-012 Moving platforms and carry
Built in game code (ref/04 §Carry): move the group above the kinematic body, 5-ray probe in prev pose, applyCarry. — source: directive §3 D-012

## D-013 Collision geometry
Box colliders generated from level data, material.visible=false for invisible colliders, no instanced meshes in bodies, worldReady, ≤300k tris, bake ≤1.5 s. — source: directive §3 D-013

## D-014 Camera
Direct CharacterCameraBehavior with custom whisker raycast against a camera world; single zoom writer; pitch [-75°, 50°]; FOV cap 110°; recentre key. — source: directive §3 D-014

## D-015 Version matrix
Exact pins per spec; timeline 0.3.9 via pnpm-workspace overrides; @pmndrs/viverse direct dependency. — source: directive §3 D-015

## D-016 Asset policy
No pmndrs example binaries; defaults stubbed from G2 PASS; legal sources only; manifest + check-assets; licenses in dist. — source: directive §3 D-016

## D-017 Protagonist and art direction
Stylized low-poly; protagonist ladder UBC+Outfits → VRoid alpha CC0 → pixiv AvatarSample → mannequin BLOCKED. — source: directive §3 D-017

## D-018 Testing contract
vitexec trusted input; synthetic setups only from allowlist; run-test.mjs (vitexec or --cmd); smoke-dist for prod; route passes twice. — source: directive §3 D-018

## D-019 Pause and pointer lock reality
Pause on pointerlockchange/visibility/blur/P; Esc + 1.25 s cooldown only testable manually. — source: directive §3 D-019

## D-020 Hosting, network, performance
base './', appType 'mpa', assetUrl(), HAR-only network gate, no drei remote presets, world-edge plane, two GPUs via browser flags. — source: directive §3 D-020

## D-021 Accessibility and Settings
Text/contrast floors, aria-live, WASD/Arrows presets by KeyboardEvent.code, sprint modes, edge guard, sliders Master/SFX/Ambience. — source: directive §3 D-021

## D-022 Level design
Declarative prefabs + zone JSON, generated routes, offline generator allowed, beats.json, fall-cost budget, fake summit, trap, landmarks. — source: directive §3 D-022

## D-023 Audio and fall feedback
WebAudio-synth wind; Kenney SFX + Music Jingles; bigFall package; victory sequence. — source: directive §3 D-023

## D-024 Document set
README, CLAUDE.md ≤60 lines, PROGRESS, DECISIONS, APPROVALS, GAME_DESIGN, manifest, CREDITS, licenses, generated TEST_REPORT and evidence index. — source: directive §3 D-024

---

New decisions (D-025+):

## D-025 Template-provided dev tools kept, strict mode added
Context: create-vite 9.3.3 react-ts adds `@types/node` and `oxlint` (not in the D-015 matrix) and its `tsconfig.app.json` has no `strict`. Choice: keep both tools, pinned exact (`@types/node` 24.19.2, `oxlint` 1.90.0 — pnpm resolved 1.90.0 from the template's `^1.89.0`); add `"strict": true` and `"forceConsistentCasingInFileNames": true` to `tsconfig.app.json`. Evidence: `package.json` after scaffold (`"oxlint": "^1.89.0"`, `"@types/node": "^24.19.2"`); pnpm add output `+ oxlint 1.90.0`. Consequence: `pnpm lint` (oxlint) is available but is not a gate.

## D-026 G0 run inside the planning session
Context: the owner chose to run G0 in the session that wrote the spec (reply "ya 2"), after it moved its working folder from `D:\CLAUDE` to `D:\CLAUDE\vertical-ascent` with the app's change-directory tool. The folder change takes effect at the end of that turn, so G0 used absolute paths, and `preview_start` reads this project's `.claude/launch.json` only from the next turn on. Choice: run G0 here; the preview check (§4 step 10) is done in the next turn. Evidence: change-directory result "will move to this folder when the current turn ends". Consequence: G1 onward should start in a fresh session in this folder, per the spec.

## D-027 Preview pane: Bash-started dev server instead of preview_start by name
Context: after the folder move, `preview_start name=vertical-ascent` still resolved `D:\CLAUDE\.claude\launch.json` (the session's original root), whose only entry is another project ("laglo", port 5178); it started that server, which was stopped at once. A second attempt would resolve the same file, so it was not repeated. Choice: per DIRECTIVE §2.3 fallback, run `npm run dev -- --port 5179 --strictPort` with Bash `run_in_background`, then `preview_start url=http://localhost:5179`. `D:\CLAUDE\.claude` was not modified (§2.2). Evidence: preview_logs "> laglo@0.0.0 dev / vite --port 5178"; `evidence/G0/00-preview.log`. Consequence: a session opened directly in this folder should get the project `launch.json`; if it does not, use this fallback.

## D-028 Pin-exact check ignores the engines range
Context: ref/01 §Pin exact ends with `grep -E '"[\^~]' package.json` "must print nothing", but the same recipe writes `"engines": { "node": "^22.13.0 || ..." }`, so the grep always prints that line. Choice: the exact-pin check covers `dependencies` and `devDependencies` only. Evidence: `evidence/G0/pin-exact.txt` ("non-exact deps: 0 []"); grep output is the single line `"node": "^22.13.0 || ^24.0.0 || >=26.0.0"`. Consequence: later gates reuse the node check, not the grep.

## D-029 Owner accepted the OWNER_RUNBOOK defaults for Q1–Q11
Context: end of G0; the agent asked "Terima jawaban default untuk Q1–Q11?". Owner reply in chat, 2026-10-30, verbatim: "Terima default". Choice: Q1 codename stays internal (owner checks USPTO/EUIPO/WIPO classes 009/041 before any public name); Q2 repo private, local only; Q3 save-on-quit + Continue on (D-009); Q4 UI language follows the browser (id → Indonesian, else English), switchable; Q5 Focus slow-motion optional in G4 with Pure mode; Q6 no variable jump height (fixed arc); Q7 timer shown by default, can be turned off; Q8 no playtest commitment, so manual parts are `BLOCKED(owner-manual)` class (a) gaps, not FAIL; Q9 commit identity "Vertical Ascent build agent" <agent@vertical-ascent.invalid>, repo-local; Q10 no music in v1, Ambience slider for wind; Q11 code licence MIT, assets separate. Evidence: docs/directive/OWNER_RUNBOOK.md lines 30-40; owner chat reply. Consequence: TEST-30 stays active (not N/A); TEST-14b manual part defaults to BLOCKED(owner-manual) unless the owner offers a playtest in a later kickoff.

## D-030 G1 continues in the planning session
Context: after G0 the agent recommended a fresh session per gate (D-026, DIRECTIVE §2.6). Owner reply in this session, 2026-10-30 01:33, verbatim: "lanjutkan" (with "Terima default" repeated). Choice: treat it as the owner's kickoff for G1 in this session. Approvals in force for this session remain those the owner gave here ("ya 2": pnpm add/install of the D-015 packages, the upstream sparse clone, local commits without a remote); nothing else is approved, and no asset is downloaded in G1. Evidence: owner chat message. Consequence: the compaction budget restarts at 0/2 for G1; the session folder is now D:\CLAUDE\vertical-ascent.

## D-031 Pre-bundle every runtime dependency for vitexec harness scripts
Context: vitexec scripts that import app modules and `@pmndrs/viverse` failed on a cold Vite cache with "Execution context was destroyed, most likely because of a navigation": the dep optimizer found packages after the initial crawl and reloaded the page mid-script; warm-cache runs passed. Choice: `optimizeDeps.include` lists every runtime package (`@pmndrs/viverse`, `@react-three/drei|fiber|viverse`, `react`, `react-dom`, `react-dom/client`, `react/jsx-dev-runtime`, `react/jsx-runtime`, `three`, `zustand`) in addition to the ref/01 `entries`. Evidence: two cold runs (`rm -rf node_modules/.vite`) of `vitexec/physics-movement.ts` failed before and passed after, with identical output. Consequence: a new runtime dependency must be added to that list. Also: vitexec scripts import project files by browser-root path (`/vitexec/lib/harness.ts`, `/src/...`); relative imports 404 because scripts are served from `/__vitexec/code/<id>` (vitexec SKILL.md "Prefer browser-root imports").

## D-032 Vendored physics marks every shapecast/sensor triangle dirty
Context: `BvhPhysicsWorld.shapecast/updateSensors` reuse one `ExtendedTriangle` refilled with `Triangle.copy` (node_modules/@pmndrs/viverse/dist/physics/world.js:205), which leaves `needsUpdate` false; three-mesh-bvh 0.9.17 `closestPointToSegment` then runs its segment-pierce test against the cached plane of an earlier triangle (ExtendedTriangle.js:155-171). Choice: the vendored physics sets `needsUpdate = true` on the triangle before `closestPointToSegment` in both callbacks (one more modification listed in the file header). Evidence: `evidence/G1/D-032-stale-plane.log` — 4000 capsule segments over the G1 blockout: 7019 triangle tests, 3513 stale planes, 114 different distances, 30 false pierces (distance 0 that the fresh plane rejects) and 84 missed pierces. Consequence: collision differs from upstream only where upstream used a wrong plane; TEST-07/34 run on the fixed code.

## D-033 Rotation input ignored for 150 ms after pointer lock is acquired
Context: in the first G1 smoke run (one-off probe `vitexec/probes/g1-smoke.ts`, 2026-10-30) the camera ended at yaw 1.356 rad, pitch 0.251 rad with no `mouse.move` after the lock: one pointermove of about (-244, -108) px arrived around lock acquisition (rotationSpeed 4 rad per canvas height 720 px reproduces exactly that). Two later runs did not reproduce it; a first-event movement spike after pointer lock is a known Chromium behaviour. Choice: on `pointerlockchange → canvas` the camera rig drops queued yaw/pitch deltas for 150 ms (it drains the behavior's readers before `update`). Evidence: probe output above; `src/camera/camera-rig.ts` suppressRotation. Consequence: mouse look starts 150 ms after Play/Resume; TEST-09 moves the mouse later than that.

## D-034 Settings are read from storage at startup and at every run start
Context: TEST-05 seeds `localStorage['va.settings.v1']` (allowlist `synthetic: settings-seed`, "sebelum load"), but a vitexec script only starts after page load and does not survive a reload (ref/06). The settings screen arrives in G3. Choice: `src/game/settings.ts` validates the stored value (ref/02 §Storage rules, `console.warn` only) at startup and again at each run start (Play, Restart, Replay), so a seed written before clicking Play applies to that run. Evidence: `src/game/game.ts` startRun → `applySettings(loadSettings())`. Consequence: G3 settings changes apply immediately and also survive a reload; TEST-05 seeds before its Play click and records the label.

## D-035 TEST-01 "store changes ≥10 Hz" measured per 100 ms slot
Context: D-005 caps HUD store writes at ≤10 Hz, while TEST-01 asks that the store read by the DOM overlay changes ≥10 Hz during 600 frames. Both hold only for an exact 10 Hz cadence, and frame quantization makes a changes/seconds ratio land at 10 ± 0.2. Choice: the HUD sampler writes once per 100 ms slot of the page clock (`Math.floor(performance.now() / 100)`); TEST-01 asserts that every 100 ms slot boundary crossed inside the 600-frame window produced exactly one store change (no slot skipped = ≥10 Hz; never two in one slot = ≤10 Hz) and logs the plain changes/second figure too. Evidence: `src/ui/HudSampler.tsx`. Consequence: a frame longer than 100 ms would skip a slot and fail TEST-01, which is the intended signal.

## D-036 isGroundedRaw = ground contact in any substep of the step; sub-nanosecond remainders dropped
Context: with dt = 1/60 and substeps of 1/240 s, floating point leaves a ~1e-18 s fifth substep. It moves nothing, so the capsule sits exactly at the depenetrated distance (`distance < radius` false) and the step reported "not grounded" although the previous substeps were grounded (stateVelocity was the grounded reset value -0.2). Evidence: step-7 carry probe before the fix — carried player on a 2 m/s platform, feet exactly on top, isGroundedRaw 0 % of frames; after the fix 100 % (`evidence/G1/step7-carry-probe.log`); movement numbers unchanged (apex 1.5756 m, airtime 0.794 s). Choice: the vendored loop runs while remaining time > 1e-9 s, and isGroundedRaw is true when any substep of the last `update()` had ground contact with downward state velocity (ref/04 checklist 4: "kontak pada step terakhir"). Consequence: TEST-11a/08 grounded percentages measure real contact; jump still clears it immediately (jump() sets it false).

## D-037 Vendored physics writes back the landing substep
Context: upstream skips the position write-back whenever a substep is grounded with no input (physics/index.ts:111-113). On the landing substep that drops the depenetration correction: the player stays where the previous airborne substep left it (up to one substep of fall travel above the ground, 1.3 cm at dt 1/144), falls again at low speed, and isGroundedRaw flickers false for several frames. Evidence: one-off trace at dt 1/144 after a jump on a static 3×3 platform — landing frame feet y 1.0132 (top 1.0), then 3 frames not grounded; TEST-11a attempt 2 failed its validity check ("grounded 3 frames after landing") at 1/144 only. Choice: also write back when the previous substep was not grounded (tracked per substep; reset by jump and teleport). Resting on the ground still skips the write-back, so idle creep on slopes stays prevented. Consequence: TEST-11a passes at 1/60, 1/144 and 1/30 (`evidence/G1/TEST-11a-platforms.log`); TEST-07, 34, 31 and 28b were rerun on this code and still pass.

## D-038 Double jump (owner request)
Context: owner message in this session, 2026-10-30, verbatim: "tambahan double spasi bisa double lompat". This changes D-010 (walk, sprint, one fixed-arc jump); the genre reference has no double jump, so falls become easier to recover from and every reach number grows. Choice: one air jump per airborne phase, granted only by a ground takeoff (coyote takeoffs included) and cleared on landing; it needs a fresh Space press (key repeat is ignored), fires no earlier than 0.10 s after the ground takeoff (an earlier press stays buffered 0.10 s), and sets vy = 8 like the ground jump (same arc, no variable height). Walking off a ledge without a ground jump gives no air jump, so TEST-06 "0.14 s → tidak" keeps its meaning; holding Space still gives one takeoff (TEST-08). The animation replays jumpUp on the air jump; `__game.events` takeoff entries carry `kind: 'ground' | 'air'`. Evidence: `evidence/G1/D-038-double-jump.log` (+ .png): single press 1 ground takeoff, rise 1.574 m; double tap ground+air, rise 3.127 m; again after landing 3.138 m; triple tap still ground+air. `level/movement.json` adds `doubleJump` (air jump at the apex): max rise 3.1512 m, airtime 1.3569 s, run reach flat 8.142 m (single 4.764 m). Consequence: G2+ level design and lint (ref/03 margins, TEST-36) must state per route jump whether it needs the double jump and apply the margins to the matching measured reach; the owner may still revert this by a new decision.

## D-039 Camera pivot side shift limited by horizontal clearance
Context: D-014 shifts the camera pivot 0.6 m sideways while pitch < -50°, eased with τ 0.15 s. With the player against a wall (capsule axis 0.4 m from it) the shifted pivot lands inside the wall; the collision ray then starts inside the closed hull, misses its near faces (FrontSide) and the camera stays inside the wall. Evidence: TEST-10 attempt 2 (`evidence/G1/TEST-10-camera-walls-attempt2-FAIL.log`): 101 frames with the camera inside wall-thin, feet at (8.35, 5.76), pitch -75° or easing out of it. Choice: each frame the rig measures the free distance from the base pivot (feet + 1.3 m) in 8 horizontal directions against the camera world and limits the shift to that distance − 0.35 m (whisker 0.25 + 0.1); a smaller limit applies at once (snap in), growth stays eased. Consequence: next to walls the steep-pitch side shift shrinks to ~0; open-space behaviour is unchanged.

## D-040 Smoke TESTs lock the pointer without raw input (test isolation); settings read when requesting the lock
Context: with `requestPointerLock({ unadjustedMovement: true })` (D-004 default) headless Chromium on Windows also receives the machine's physical mouse (raw input), so camera input in smoke TESTs is not only vitexec's. Evidence: `evidence/G1/D-040-raw-input-leak.log` — no vitexec mouse input for 6 s: raw lock 191 trusted pointermove events (−1513 px, yaw changed 8.4 rad), plain lock 0 events; the TEST-10 attempt 1–2 "spikes" and the D-033 one-off are this. Choice: (1) `enterPlaying()` reads `va.settings.v1` rawInput right before requesting the lock (extends D-034); (2) every smoke TEST seeds `rawInput: false` before its Play click, merged into any other allowlisted seed, logged as `synthetic: settings-seed` — an allowlist extension of ref/06 recorded here (the directive copy is read-only). Players keep raw input on by default. Consequence: smoke evidence no longer depends on the owner not touching the mouse; all G1 smoke TESTs are rerun with the seed; the raw-input lock path itself is covered by TEST-39 (Settings) in G3.

## D-041 G2 continues in the planning session
Context: after the G1 report the agent asked whether to start G2 in a new session or here. Owner reply in this session, 2026-10-30 05:36, verbatim: "Lanjut di sini". Choice: G2 runs in this session; its compaction budget starts at 0/2. Approvals in force remain the ones given in this session ("ya 2": D-015 packages, upstream sparse clone, local commits; plus the owner's design requests). No asset id from docs/APPROVALS.md is approved yet, so nothing is downloaded: G2 starts with the asset-free work (level schema and slice data, HUD/menus/Restart, kill plane, bigFall, pipeline scripts, stub plugin) and asks for the approved ids. Resource limit from the owner still applies (one vitexec/Chromium at a time, no parallel browser agents). Evidence: owner chat message. Consequence: G2 cannot reach PASS until assets are approved or the owner accepts placeholder gaps.

## D-042 The G1 blockout stays as a DEV test level; G1 smoke TESTs select it with ?level=
Context: from G2 the default level is the vertical slice (level/slice.json). The G1 smoke TESTs walk to fixed blockout positions (walls, pole, clear lanes) and must keep passing in the G4/G5 full reruns (TEST-24). Choice: `src/level/levels.ts` exposes the G1 blockout in the level schema as `g1-blockout`, selectable only in DEV builds with `?level=g1-blockout`; G1 smoke commands add `--path ?level=g1-blockout` (vitexec resolves it against its dev server; verified by a one-off probe: `level: g1-blockout`, bodies `g1-blockout-static`, `mover-linear`, `mover-lift`). Physics-harness TESTs keep importing `src/level/blockout.ts` directly. Evidence: `scripts/g1-suite.sh`. Consequence: production builds always load the slice (G3: the full route); the query switch is dead code there.

## D-043 Pointer-lock re-requests can be rejected under Playwright; tests retry like a person
Context: ref/06 states that under Playwright the 1.25 s re-lock cooldown does not appear. TEST-15 (20 pause → Restart → confirm cycles, the confirm click 0.4–0.8 s after the lock was released) saw 4 rejected lock requests (`lockRejected` events) in attempt 3 and 3 un-entered restarts in attempt 2. The app behaves as D-004 requires: it stays on the pause menu with "Click again" and does not retry by itself. Choice: smoke scripts that re-lock after a pause wait ≥400 ms and, when PLAYING is not entered, click the same control again once (logged per row as `lockRetries`, with the page's `lockRejected` count). Evidence: `evidence/G2/TEST-15-restart.log` (`lockRejected: 4`, 20/20 restarts), attempts 1–2 logs. Consequence: TEST-14b (G3) must expect possible rejections on fast re-clicks; the owner's manual Esc test remains the real check of the cooldown.

## D-044 Stub plugin active from G2; the character slots stay as gaps
Context: ref/05 §Stub requires `stubViverseDefaults` from G2 PASS, except for slots that still wait for a licensed replacement. No final character or clips exist yet: no asset id in docs/APPROVALS.md is approved in chat and no OWNER-ONLY file is in `.cache/inbox/` (TEST-03 `BLOCKED(owner-asset-approval)`). Choice: `vite.config.ts` registers the plugin with keep = mannequin, idle, walk, run, jump-up, jump-loop, jump-down (gap slots). jump-forward is stubbed now, because only the library's SimpleCharacter loads it and the game does not render SimpleCharacter (D-001). Evidence: `evidence/G2/G2-stub-plugin-build.log` (tsc exit 0; vite build: the jump-forward chunk is 0.03 kB `data:,stubbed`, and `data:model/gltf-binary` appears only in the 7 gap chunks), `evidence/G2/G2-stub-plugin-boot.log` (dev boot to PLAYING with the plugin, slice level). Consequence: each slot leaves the keep list when its licensed replacement is integrated, and its manifest row becomes REMOVED. G5's `! rg -l "data:model/gltf-binary" dist` stays a class (a) gap for any slot still kept.
