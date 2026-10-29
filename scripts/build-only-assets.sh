#!/usr/bin/env bash
# Rebuilds public/assets/_build-only/ (gitignored; ASSET_MANIFEST.md repo_committable BUILD-ONLY, D-047) from the
# approved downloads in .cache/ (D-045). The Quaternius clips ship only inside the game build: QAL v1.0, in effect
# when they were obtained, forbids redistributing them as standalone assets. Inputs are checked by sha256 first.
#   bash scripts/build-only-assets.sh
set -euo pipefail
cd "$(dirname "$0")/.."

UAL1_ZIP=.cache/downloads/ual1-standard-oga/universal_animation_librarystandard.zip
UAL1_ZIP_SHA=18ff1a7215f4852b320203e8aaf02a1578b5c8eef9027fbaedfcedc7b85a3ac2
UAL1_DIR=.cache/extract/ual1-standard-oga
UAL1_GLB="$UAL1_DIR/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb"
UAL1_GLB_SHA=1b7bf67866360665426bb99e4c71bd619f19b408453c24e30f0c3071601eee5c
OUT=public/assets/_build-only/animations/ual1

echo "$UAL1_ZIP_SHA *$UAL1_ZIP" | sha256sum -c -
if [ ! -f "$UAL1_GLB" ]; then
  # quarantine rule (ref/05 §Karantina): a new empty folder, listing checked for '..' and absolute paths first
  [ -e "$UAL1_DIR" ] && [ -n "$(ls -A "$UAL1_DIR")" ] && { echo "$UAL1_DIR is not empty"; exit 1; }
  /c/Windows/System32/tar.exe -t -f "$UAL1_ZIP" | grep -E '(^|/)\.\.(/|$)|^/|^[A-Za-z]:' && { echo "unsafe entry"; exit 1; }
  mkdir -p "$UAL1_DIR"
  /c/Windows/System32/tar.exe -x -f "$UAL1_ZIP" -C "$UAL1_DIR"
fi
echo "$UAL1_GLB_SHA *$UAL1_GLB" | sha256sum -c -

rm -rf "$OUT"
node scripts/split-clips.mjs "$UAL1_GLB" "$OUT" --only Idle_Loop,Walk_Loop,Sprint_Loop,Jump_Start,Jump_Loop,Jump_Land --drop-meshes
(cd "$OUT" && sha256sum *.glb)
