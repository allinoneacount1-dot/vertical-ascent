#!/usr/bin/env bash
# Builds the protagonist file from AvatarSample_F (A5, owner's pick D-051) into .cache/work/vroid-f/protagonist-f.vrm:
# textures ≤1024² (D-017), baked recolour of cloth/legwear/shoes and hair, MToon shade/emission colours to match
# (GAME_DESIGN.md §Protagonist). Input checked by sha256 first. The output stays in .cache until the owner pastes
# pixiv's first-party CC0 sentence (D-045); integration then copies it to public/assets/characters/.
#   bash scripts/build-protagonist.sh
set -euo pipefail
cd "$(dirname "$0")/.."

IN=.cache/extract/vroid-alpha-cc0/avatarsample_f/AvatarSample_F.vrm
IN_SHA=d8eff1ed09b41afb94e30da27997560fb901dde925c813f835ab1986708521bb
OUT=.cache/work/vroid-f/protagonist-f.vrm
echo "$IN_SHA *$IN" | sha256sum -c -

mkdir -p "$(dirname "$OUT")"
rm -rf .tmp/vrm-protagonist-f

CLOTH='^F00_002_(Body_00|Onepiece_01|Shoes_01)$'
HAIR='^F00_000_(HairBack_00|Hair_00_0[123])$'
HAIR_FRONT='^F00_000_Hair_00_0[12]$'
node scripts/vrm-textures.mjs "$IN" "$OUT" --max 1024 --workdir .tmp/vrm-protagonist-f \
  --filter "$CLOTH::huesaturation=hue=-175:saturation=-0.25:colors=c+b+m:strength=20" \
  --filter "$HAIR::colorize=hue=22:saturation=0.6:lightness=0.3:mix=0.8,eq=gamma=0.7" \
  --filter "$HAIR_FRONT::eq=gamma=0.65" \
  --material '_CLOTH$::_ShadeColor=0.62,0.5,0.46,1' \
  --material '_HAIR(_0[123])?$::_Color=1,1,1,1' \
  --material '_HAIR(_0[123])?$::_ShadeColor=0.7,0.56,0.48,1' \
  --material '_HAIR(_0[123])?$::_EmissionColor=0.1,0.07,0.05,1'
sha256sum "$OUT"
