#!/usr/bin/env bash
# G1 TEST suite, one run at a time (resource limit: a single vitexec/Chromium instance). Usage: bash scripts/g1-suite.sh
# Prints one "TEST-xx slug result" line per run; logs land in evidence/G1/ via scripts/run-test.mjs.
set -u
run() { local id="$1" slug="$2"; shift 2; node scripts/run-test.mjs "$id" --slug "$slug" "$@" > /dev/null 2>&1; echo "TEST-$id $slug $(grep -oE 'result=(PASS|FAIL)' "evidence/G1/TEST-$id-$slug.log" | tail -1)"; }
run 35a state --cmd "pnpm vitest run src/game/state.test.ts"
run 07 phase-sweep -- --timeout 170 ./vitexec/physics-phase-sweep.ts
run 34 terminal -- --timeout 170 ./vitexec/physics-terminal.ts
run 28b dt-clamp -- --timeout 120 ./vitexec/physics-dt-clamp.ts
run 31 framerate -- --timeout 120 ./vitexec/physics-framerate.ts
run 11a platforms -- --timeout 150 ./vitexec/physics-platforms.ts
run 06 physics -- --timeout 120 ./vitexec/physics-jump.ts
run 08 physics -- --timeout 150 ./vitexec/physics-jump-repeat.ts
run 01 load -- --path ?level=g1-blockout --timeout 150 --screenshot ./evidence/G1/TEST-01-load.png ./vitexec/smoke-load.ts
run 04 move -- --path ?level=g1-blockout --timeout 150 --screenshot ./evidence/G1/TEST-04-move.png ./vitexec/smoke-move.ts
for m in toggle hold always; do run 05 sprint-$m -- --path ?level=g1-blockout --timeout 150 --screenshot ./evidence/G1/TEST-05-sprint-$m.png ./vitexec/smoke-sprint-$m.ts; done
run 06 smoke -- --path ?level=g1-blockout --timeout 150 --screenshot ./evidence/G1/TEST-06-smoke.png ./vitexec/smoke-jump.ts
run 08 smoke-hold -- --path ?level=g1-blockout --timeout 120 ./vitexec/smoke-hold-jump.ts
run 09 camera -- --path ?level=g1-blockout --timeout 180 --screenshot ./evidence/G1/TEST-09-camera.png ./vitexec/smoke-camera.ts
run 14a pause -- --path ?level=g1-blockout --timeout 150 --screenshot ./evidence/G1/TEST-14a-pause.png ./vitexec/smoke-pause.ts
run 28a visibility -- --path ?level=g1-blockout --timeout 150 --screenshot ./evidence/G1/TEST-28a-visibility.png ./vitexec/smoke-visibility.ts
run 10 camera-walls -- --path ?level=g1-blockout --timeout 300 --screenshot ./evidence/G1/TEST-10-camera-walls.png ./vitexec/smoke-camera-walls.ts
run 32 frame-order -- --path ?level=g1-blockout --timeout 150 --screenshot ./evidence/G1/TEST-32-frame-order.png ./vitexec/smoke-frame-order.ts
echo "SUITE DONE"
