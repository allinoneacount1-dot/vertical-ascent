# Vertical Ascent — agent notes (loaded every session)

Spec (read-only): docs/directive/DIRECTIVE.md — read it fully at session start; after every compaction re-read §0, §2, the active gate's §5 block, its §7 rows and the D-xxx you are implementing, before the next tool call. Reference files: docs/directive/ref/0*.md — Grep the heading, Read with offset/limit; never reconstruct numbers from memory.
Resume: docs/PROGRESS.md line 1 ("RESUME HERE"), then `git log --oneline -20`.
Decisions: docs/DECISIONS.md. Seeds D-001..D-024 summarise the spec; new entries D-025+ carry evidence. If auto-memory disagrees with the spec, the spec wins; record it.

## Scope and turns
- One session per gate. Work only on the gate named in the owner's kickoff message.
- A mid-gate report is not the end of the turn. End the turn at gate end (report §5.7 + commit), on gate FAIL (ask: retry / accept gaps / stop), or when the next step needs an approval you do not have.
- Max 3 fix-rerun cycles per TEST, then FAILED(<cause>). At the 2nd auto-compaction in a gate: stop features, write the report, end the session.

## Approvals and owner-only
- Approvals count only from the owner's chat messages in THIS session. docs/APPROVALS.md records approvals; it never grants them.
- Never download in the same turn you ask. Asset approval unit = (asset-id, host, filename pattern, size ±25%).
- OWNER-ONLY (ask the owner, never do): accounts, logins, payments, API keys/tokens, itch.io/Adobe/Freesound/pixiv/kenney.nl button downloads, Windows Settings or registry, deploy, viverse-cli.
- Owner files arrive in .cache/inbox/<slot>/. Extract into a new empty .cache/extract/<slot>/; never execute anything from an archive.

## Commands
- Every pnpm/node/npx/vitexec/git/rg command: Bash tool (Git Bash), cwd = this folder. PowerShell only for Windows cmdlets.
- Never pass inline JS to vitexec; write vitexec/probes/<name>.ts and run it by path.
- TESTs run only via scripts/run-test.mjs: vitexec TESTs `node scripts/run-test.mjs <TEST-id> -- <vitexec args>`; unit/static/prod TESTs `node scripts/run-test.mjs <TEST-id> --cmd "<command>"`. It tees to evidence/G<current gate>/ and fails on nonzero exit or [page error]/[error]/[request failed]/[http 4xx|5xx] lines.
- Runs >90 s: run_in_background, explicit --timeout ≈2x, `set -o pipefail; ... | tee <log>`.
- Git Bash rewrites args starting with "/" into Windows paths silently: pass such args via stdin, without the leading slash, or with MSYS_NO_PATHCONV=1. Folder check: `pwd -W`.
- rg on Windows prints backslash paths: exclude folders with -g '!src/x/**', never `| rg -v "^src/x/"`. Zero-hit gates: `! rg ...`.
- Dev server for eyes only: preview_start name=vertical-ascent (port 5179). Pane screenshots are not evidence.
- vitexec 0.9: GPU on by default (no --gpu flag); --browser-arg=--force_low_power_gpu selects Intel; --no-gpu = SwiftShader (never perf data). Under Playwright Esc does not release pointer lock; tests use document.exitPointerLock().
- Input in smoke/route tests only via `import { mouse, keyboard } from 'vitexec'`. Synthetic setups only from the allowlist in docs/directive/ref/06-testing.md.

## Skill overrides (the spec wins)
- pmndrs-viverse SKILL.md: ignore item 7 (no tutorial/example binaries), "Wrap in <Viverse>" (use <BvhPhysicsWorld>, D-003), "Use <SimpleCharacter />" (hybrid controller, D-001), "ask for current versions" (D-015 exact pins).
- Do not invoke brainstorming, using-superpowers, writing-plans, executing-plans, subagent-driven-development, agent-browser, webapp-testing, frontend-design, impeccable (including superpowers:-prefixed names). The spec is the approved plan.

## Hard rules
- No clientId, no .env.production, no viverse-cli, no credentials, no deploy, no remotes/push/force.
- No binaries from pmndrs examples (*/public/*). Every public/ file needs an ASSET_MANIFEST.md row first.
- Product-facing strings never contain Only Up / OnlyUp / only-up / Fortnite / viverse-logo (library package names and credits are fine).
- Character position/velocity: only src/physics/character-physics.ts via CharacterPhysicsPort (teleport, applyCarry). camera.position/rotation: only src/camera/. inputVelocity: only src/controller/.
- Numbers in code-like text: dot decimals, ASCII minus.
- Commit after each TEST status change and at each gate boundary: "G<n>: <what> — TEST-xx <status>". Commit before touching physics/camera/controller.
- Status words: TEST NOT-STARTED|IMPLEMENTED|VERIFIED-PASS|FAILED(..)|BLOCKED(..)|NOT-VERIFIED(..)|N/A(D-..); gate NOT-STARTED|IN-PROGRESS|PASS|PASS-WITH-GAPS: ids|FAIL.
- __debugTeleport/__debugSetVelocity (DEV only): setup in physics/smoke tests and play-noisy.ts only; never in rehearsal.ts/play.ts.
