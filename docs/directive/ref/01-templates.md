# ref/01 — Template file (G0)

Semua file di sini ditulis di G0 kecuali disebut lain. Sesuaikan isi bertanda `<…>`.

## CLAUDE.md (root project, ≤60 baris)

```markdown
# Vertical Ascent — agent notes (loaded every session)

Spec (read-only): docs/directive/DIRECTIVE.md — read it fully at session start and after every compaction, before the next tool call. Reference files: docs/directive/ref/0*.md — Grep the heading, Read with offset/limit; never reconstruct numbers from memory.
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
```

## docs/PROGRESS.md

```markdown
RESUME HERE: G0, next action: DIRECTIVE §4 step 1

# PROGRESS — Vertical Ascent
## Environment
node: | pnpm: | git: | renderer (vitexec default): | renderer (--force_low_power_gpu): | preview pane renderer: | upstream HEAD: | date:
## Stack (resolved, from pnpm why)
three: | @react-three/fiber: | drei: | @react-three/viverse: | @pmndrs/viverse: | @react-three/timeline: | @pmndrs/timeline: | react: | vite: | typescript: | vitexec: | playwright:
## Gates
| Gate | Status | Started | Finished | Commit | Compactions | Evidence |
|---|---|---|---|---|---|---|
| G0 Setup | NOT-STARTED | | | | | evidence/G0 |
| G1 Foundation | NOT-STARTED | | | | | evidence/G1 |
| G2 Vertical slice | NOT-STARTED | | | | | evidence/G2 |
| G3 Full world | NOT-STARTED | | | | | evidence/G3 |
| G4 Production quality | NOT-STARTED | | | | | evidence/G4 |
| G5 Delivery | NOT-STARTED | | | | | evidence/G5 |
## TESTs (one row per ID in DIRECTIVE §7, incl. 07b 11a 11b 12a 12b 14a 14b 18a 18b 19a 19b 20a 20b 23b 28a 28b 34b 35a 35b)
| ID | Gate | Status | Attempts | Artifact | Command | Commit | Date |
|---|---|---|---|---|---|---|---|
| TEST-01 | G1 | NOT-STARTED | 0 | | | | |
…
## Placeholders still present
| What | Where referenced | Expected in gate | Replacement |
## Blocked / needs owner
- (none)
## Gate reports
(append DIRECTIVE §5.7 blocks here)
```

## docs/DECISIONS.md

```markdown
# DECISIONS
Seeds (summaries of the spec; the spec text is authoritative):
## D-001 Hybrid controller
<≤3 lines> — source: directive §3 D-001
…
## D-024 Document set
<≤3 lines> — source: directive §3 D-024

New decisions (D-025+), ≤10 lines each:
## D-025 <title>
Context: … Choice: … Evidence: <file:line | URL | command + output> Consequence: …
```

## docs/APPROVALS.md

```markdown
# APPROVALS — records only; approval comes from the owner's chat message in the current session
| id | asset-id | who downloads | host | filename pattern | size (±25%) | license as displayed | owner reply (verbatim) | date | session/gate |
|---|---|---|---|---|---|---|---|---|---|
```

## .gitignore (tambahkan ke milik template)

```
.cache/
.tmp/
.tmp-scaffold/
.env*
!.env.example
evidence/**/*.mp4
evidence/**/*.har
evidence/**/*heap*.json
evidence/**/*.cpuprofile
evidence/**/*.zip
licenses/*.pdf
public/assets/_build-only/
.claude/settings.local.json
!evidence/**/*.log
```
Template create-vite sudah memuat `*.log`; baris negasi terakhir mengembalikan log evidence ke git. File ber-`repo_committable: BUILD-ONLY` (mis. Quaternius) disimpan di `public/assets/_build-only/` sehingga tidak pernah terkomit. Cek: `git check-ignore -v evidence/G0/build.log` → tidak ada output.

## .gitattributes

Satu pola per baris (git menolak baris berisi banyak glob):
```
* text=auto eol=lf
*.glb binary
*.vrm binary
*.vrma binary
*.bin binary
*.png binary
*.jpg binary
*.jpeg binary
*.webp binary
*.ktx2 binary
*.hdr binary
*.exr binary
*.ogg binary
*.mp3 binary
*.wav binary
*.woff binary
*.woff2 binary
*.ttf binary
*.otf binary
*.zip binary
*.mp4 binary
*.wasm binary
*.fbx binary
```
Cek G0: `git check-attr binary evidence/G0/00-first-run.png` → `binary: set`.

## pnpm-workspace.yaml (sebelum `pnpm add` pertama)

```yaml
overrides:
  '@react-three/timeline': 0.3.9
  '@pmndrs/timeline': 0.3.9
```

## Pin exact

`pnpm add -E` tidak menulis ulang paket yang sudah dideklarasikan template. Setelah kedua `pnpm add`:
```bash
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));for(const k of ['dependencies','devDependencies'])for(const [n,v] of Object.entries(p[k]||{}))p[k][n]=v.replace(/^[\^~]/,'');p.packageManager='pnpm@11.22.0';p.engines={node:'^22.13.0 || ^24.0.0 || >=26.0.0'};fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
pnpm install
grep -E '"[\^~]' package.json   # harus tanpa output
```

## vite.config.ts (inti)

Baris pertama wajib: tanpanya `tsc -b` (yang ikut memeriksa `vite.config.ts` lewat `tsconfig.node.json`) menolak key `test` dan `pnpm build` exit 1.

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// G2: import { stubViverseDefaults } from './scripts/stub-viverse-defaults.ts' (ref/05 §Stub; ekstensi .ts wajib — module nodenext)
// G5: import { thirdPartyLicenses } from './scripts/license-plugin.ts' (ref/05 §Lisensi di build)

export default defineConfig({
  base: './',
  appType: 'mpa',
  plugins: [react()],
  resolve: { dedupe: ['three', '@react-three/fiber'] },
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/.cache/**', '**/.tmp/**', '**/evidence/**', '**/licenses/**'] } },
  test: { include: ['src/**/*.test.ts'], exclude: ['**/node_modules/**', '**/.cache/**', '**/.tmp/**', '**/evidence/**'] },
})
```
Bila `appType: 'mpa'` mengganggu vitexec (index tidak tersaji), catat sebagai D-0xx dan pakai pemeriksaan content-type TEST-18a/18b saja.

## TypeScript

- `tsconfig.app.json` dari template: `include: ["src"]` (folder `vitexec/` otomatis di luar `tsc`), tambahkan `"forceConsistentCasingInFileNames": true`; pertahankan `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnused*`.
- Test vitest berada di `src/**/*.test.ts` sehingga ikut di-typecheck.

## .claude/launch.json (project-local; gabungkan bila file sudah ada)

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "vertical-ascent", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev", "--", "--port", "5179", "--strictPort"], "port": 5179 }
  ]
}
```
`npm` di sini disengaja (pola yang terbukti di mesin ini); jangan diganti pnpm.

## Upstream (sparse clone, read-only)

Pola dioper lewat stdin: sebagai argumen, Git Bash mengubah `/packages/...` menjadi `C:/Program Files/Git/packages/...` dan checkout menjadi kosong — dengan exit 0 dan hash yang benar.
```bash
git clone --filter=blob:none --no-checkout https://github.com/pmndrs/viverse .cache/upstream/viverse
git -C .cache/upstream/viverse sparse-checkout set --no-cone --stdin <<'EOF'
/packages/viverse/src/
/packages/react/src/
/examples/fortnite/src/
/examples/fortnite/vitexec/
/skills/pmndrs-viverse/
/docs/tutorials/
/LICENSE
/packages/viverse/LICENSE
/packages/react/LICENSE
EOF
git -C .cache/upstream/viverse checkout b88c0e734ae87c9c6a1b3a8d0b84064f4b4fa3ef
git -C .cache/upstream/viverse rev-parse HEAD   # → PROGRESS "upstream HEAD"
git -C .cache/upstream/viverse sparse-checkout list   # harus tanpa "Program Files"
test -f .cache/upstream/viverse/packages/viverse/src/physics/index.ts && test -f .cache/upstream/viverse/skills/pmndrs-viverse/SKILL.md
```
Clone ini sumber untuk vendoring (`physics/index.ts`, `camera.ts`, `update-input-velocity.ts`), pola contoh, dan skill. Tidak ada file dari sini yang masuk `public/` atau di-import runtime selain salinan vendored bertanda.
