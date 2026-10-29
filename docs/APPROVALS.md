# APPROVALS — records only; approval comes from the owner's chat message in the current session

## Session 1 (G0) — package and source approvals

Context: the agent offered two ways to run G0; way 2 required the owner's approval in chat of the four session-1 kickoff items (OWNER_RUNBOOK): (1) `pnpm create vite@9.3.3` in a temporary folder; (2) `pnpm add -E` / `pnpm add -E -D` / `pnpm install` for the exact D-015 packages plus template dependencies; (3) sparse clone of `https://github.com/pmndrs/viverse` at `b88c0e734ae87c9c6a1b3a8d0b84064f4b4fa3ef`; (4) local git commits without a remote. Owner reply (verbatim): "ya 2". Date: 2026-10-30. No assets downloaded in G0.

## Asset candidates for G2 (A1–A5 approved in chat 2026-10-30 06:15, D-045; A6 and every O-row not approved)

Sizes are from listings or pages seen during research (2026-10-24 … 10-29); "unknown" until checked in G2. Who downloads: agent = after approval in the G2 session chat; owner = OWNER-ONLY button download into `.cache/inbox/<slot>/`.

| id | asset-id | who downloads | host | filename pattern | size (±25%) | license as displayed | owner reply (verbatim) | date | session/gate |
|---|---|---|---|---|---|---|---|---|---|
| A1 | ual1-standard-oga | agent | opengameart.org | `universal_animation_librarystandard.zip` | 14.5 MB | CC0 (OGA page; Quaternius site shows QAL v1.0) | "Setujui A1–A5" | 2026-10-30 06:15 | session 1, G2 gap closure |
| A2 | ual2-standard-oga | agent | opengameart.org | `universal_animation_library_2standard.zip` | 10.3 MB | CC0 (OGA page; Quaternius site shows QAL v1.0) | "Setujui A1–A5" | 2026-10-30 06:15 | session 1, G2 gap closure |
| A3 | hdri-industrial-sunset-1k | agent | dl.polyhaven.org | `industrial_sunset_puresky_1k.hdr` | ~1.2 MB | CC0 (polyhaven.com/license) | "Setujui A1–A5" | 2026-10-30 06:15 | session 1, G2 gap closure |
| A4 | hdri-kloppenheim-06-1k | agent | dl.polyhaven.org | `kloppenheim_06_puresky_1k.hdr` | 1.17 MB | CC0 | "Setujui A1–A5" | 2026-10-30 06:15 | session 1, G2 gap closure |
| A5 | vroid-alpha-cc0 (fallback protagonist only) | agent | opengameart.org | `avatarsample_e.zip` / `avatarsample_f.zip` / `avatarsample_g.zip` | 11–15 MB each | CC0 (third-party OGA upload; first-party pixiv text must be pasted by the owner) | "Setujui A1–A5" | 2026-10-30 06:15 | session 1, G2 gap closure |
| A6 | kenney-<slug> OGA mirrors | agent (only if Kenney's own OGA upload exists, CC0, GLB inside, version matches kenney.nl) | opengameart.org | `kenney_<slug>*.zip` | unknown (per OGA listing) | CC0 | | | G2 |
| O1 | ubc-standard | owner → `.cache/inbox/ubc/` | quaternius.itch.io/universal-base-characters | `Universal Base Characters[Standard].zip` | ~122 MB | CC0 label; site QAL v1.0 | | | G2 |
| O2 | outfits-fantasy-standard | owner → `.cache/inbox/outfits/` | quaternius.itch.io (Modular Character Outfits – Fantasy) | `*Standard*.zip` | ~280 MB | CC0 label; site QAL v1.0 | | | G2 |
| O3 | kenney-platformer-kit | owner → `.cache/inbox/kenney-platformer-kit/` (unless A6 mirror) | kenney.nl/assets/platformer-kit | `kenney_platformer-kit*.zip` | ~4.6 MB | CC0 | | | G2 |
| O4 | kenney-city-kit-roads | owner (unless A6) | kenney.nl/assets/city-kit-roads | `kenney_city-kit-roads*.zip` | ~2.9 MB | CC0 | | | G2 |
| O5 | kenney-modular-buildings | owner (unless A6) | kenney.nl/assets/modular-buildings | `kenney_modular-buildings*.zip` | ~1.8 MB | CC0 | | | G2 |
| O6 | kenney-city-kit-industrial | owner (unless A6) | kenney.nl/assets/city-kit-industrial | `kenney_city-kit-industrial*.zip` | ~5.0 MB | CC0 | | | G2/G3 |
| O7 | kenney-factory-kit | owner (unless A6) | kenney.nl/assets/factory-kit | `kenney_factory-kit*.zip` | ~4.5 MB | CC0 | | | G2/G3 |
| O8 | kenney-prototype-kit | owner (unless A6) | kenney.nl/assets/prototype-kit | `kenney_prototype-kit*.zip` | ~3.0 MB | CC0 | | | G2 |
| O9 | kenney-impact-sounds | owner (unless A6) | kenney.nl/assets/impact-sounds | `kenney_impact-sounds*.zip` | ~0.8 MB | CC0 | | | G2 |
| O10 | kenney-interface-sounds | owner (unless A6) | kenney.nl/assets/interface-sounds | `kenney_interface-sounds*.zip` | ~0.8 MB | CC0 | | | G2 |
| O11 | kenney-ui-audio | owner (unless A6) | kenney.nl/assets/ui-audio | `kenney_ui-audio*.zip` | ~0.4 MB | CC0 | | | G2 |
| O12 | kenney-music-jingles | owner (unless A6) | kenney.nl/assets/music-jingles | `kenney_music-jingles*.zip` | unknown | CC0 | | | G2 |
| O13 | kaykit-platformer-free (optional) | owner → `.cache/inbox/kaykit-platformer/` | kaylousberg.itch.io/kaykit-platformer | `*Free*.zip` | ~22 MB | CC0 label | | | G3 |
