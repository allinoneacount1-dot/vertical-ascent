# Third-party notices (source repository)

Code in this repository that is copied or derived from third-party source, with the licence text that must travel
with it. The build adds `dist/THIRD_PARTY_LICENSES.txt` for every bundled package (G5 license plugin, ref/05); this
file covers the source tree.

## pmndrs/viverse — MIT, Copyright 2024 Bela Bohlender

- Source: https://github.com/pmndrs/viverse at commit `b88c0e734ae87c9c6a1b3a8d0b84064f4b4fa3ef` (= npm
  `@pmndrs/viverse@0.2.29` / `@react-three/viverse@0.2.29`). Licence: https://github.com/pmndrs/viverse/blob/main/LICENSE
- Full text, verbatim: [licenses/pmndrs-viverse.LICENSE.txt](licenses/pmndrs-viverse.LICENSE.txt)
  (sha256 `3734dc49128c9ec87673494424b8cc07063855b368b2570dac921b6f1a5ec957`; identical in the pinned commit, in
  both npm packages and on `main` as checked 2026-10-30).
- Derived file: `src/physics/character-physics.ts` (vendored from `packages/viverse/src/physics/index.ts`; the
  modifications are listed in its header).
- The same LICENSE file carries the MIT licence of `@pixiv/three-vrm` (Copyright (c) 2019-2025 pixiv Inc.), which
  the viverse packages bundle. Its CC-BY-4.0 line for `robot.vrm` ("FinBeenWhere?") refers to an upstream file that
  this project does not use or ship.
