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
