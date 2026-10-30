# Vertical Ascent — game design (G2)

Working title only (OWNER_RUNBOOK Q1, D-029). One continuous climb, no checkpoints; a fall costs height, never health.

## Movement spec (measured, `level/movement.json`)

| Verb | Value |
|---|---|
| Walk / sprint | 3 / 6 m/s, instant air control |
| Jump | vy = 8 m/s fixed arc; rise 1.58 m, airtime 0.79 s |
| Double jump (D-038) | one air jump after a ground jump; max rise 3.15 m, airtime 1.36 s |
| Reach, run (flat / +1 m / −2 m) | 4.76 / 3.81 / 5.99 m; with double jump 8.14 / 7.55 / 9.10 m |
| Coyote / buffer / re-jump | 0.12 / 0.10 / 0.30 s |
| Sprint modes | Toggle (default), Hold, Always |
| Kill plane | y < −20 m or 10 m outside the floor footprint → respawn, same run |
| Big fall | vy < −12 m/s for > 0.6 s |

Design margins (ref/03): a jump uses at most 80 % of the matching reach in the first zone (88 / 93 / 95 % later), climbs at most 0.85 × the measured rise, and never needs coyote time. Every route jump states whether it needs the double jump; the slice needs none.

## Palette and visual grammar (stylized flat colour, D-017)

| Role | Colour | Shape cue |
|---|---|---|
| Walkable pad | sand `#d8b56a` | brown trim around the top edge |
| Small precision pad | light sand `#e6c98a` | same trim, 2 × 2 m |
| Moving platform | steel blue `#4f8fb8` | white trim, thinner slab (0.5 m), it moves |
| Hazard (windmill bar) | slate `#2f3640` | yellow bands along the bar |
| Finish | pale gold `#f4e3a1` | white trim |
| Ground | slate grey `#5b6876` | — |

Walkable surfaces always have the trim; decoration never does. Hazards are told apart by bands and motion, never by a red/green pair.

## Protagonist

Base: VRoid Studio alpha AvatarSample_F (CC0, A5; owner's pick, D-051). Made the game's own (D-017) with warm colours that read against sand pads, slate ground and steel-blue movers, and a climber's silhouette:

| Part | Change | How |
|---|---|---|
| Outfit, legwear, shoes | navy → dark olive, cyan → rust/coral | baked: `huesaturation=hue=-175:saturation=-0.25:colors=c+b+m:strength=20` on the cloth/body textures (skin untouched) |
| Hair | white → chestnut | baked: `colorize=hue=22:saturation=0.6:lightness=0.3:mix=0.8,eq=gamma=0.7` |
| Silhouette | climbing pack: body `#4b3a2c`, flap and bedroll in sand `#d8b56a` | runtime primitive on the upper-chest bone (`src/character/protagonist-style.ts`) |

Textures ≤1024² (D-017), file under 10 MB. Not in the game until the owner pastes pixiv's first-party CC0 sentence (D-045).

## Vertical slice (`level/slice.json`)

14 route pads from the ground to 8.8 m, one moving platform (8 m ride, 1.5 s dwell at each end), one windmill bar across a 3 m sprint jump (clear about half of each 6 s turn), finish pad with a sensor. The route bot climbs it in about 36 s.

## Skill ladder

1. Step-up jumps of 0.6–0.9 m between large pads (learn jump + walk).
2. A 2 × 2 m precision pad (learn to stop).
3. Ride a moving platform and leave it at the far end (learn timing and carry).
4. Sprint jump across a gap past a rotating bar (learn sprint + timing).
5. Climbing spiral of medium and small pads to the finish.

Later zones (G3) add the fake summit, a marked trap fork near the top, and landmarks visible from below.

## Hazard and trap telegraphing

Moving and rotating objects move from the first frame; dangerous parts carry yellow bands; a trap (G3) gets an original warning sign before the fork. Falls are announced with a toast; leaving the world fades to black for 300 ms and returns to the spawn.

## Naming notes

"Vertical Ascent" is an internal codename (US mark in a playground-equipment class exists). No product string uses the reference game's name or brands; the only nominative mention is the README inspiration line.
