# ref/04 — Fakta library dan resep (pmndrs/viverse b88c0e7 = npm 0.2.29)

Path file merujuk ke clone `.cache/upstream/viverse/`. Bila `node_modules` berbeda, `node_modules` menang (catat sebagai D-0xx).

## Bacaan per gate

- G0: `SKILL.md`, `references/components-and-hooks.md`, `references/tutorials/remove-viverse-integrations.md`; vitexec `SKILL.md` + `references/inputs.md`.
- G1: `rg -n "useCharacterModelLoader|CharacterModelProvider|CharacterAnimationAction|GrapthState|RunTimeline" .claude/skills/pmndrs-viverse/references/tutorials/custom-character-controller.md` lalu baca ±40 baris di sekitar tiap hit (bukan seluruh file 39 KB). `references/gameplay-quality.md` sebelum G1 langkah 8 (validasi).
- G2: `references/tutorials/custom-models-and-animations.md`.

## Ekspor

Dari `@react-three/viverse` langsung: `BvhPhysicsWorld` (komponen), `useBvhPhysicsWorld`, `BvhPhysicsBody {kinematic}`, `BvhPhysicsSensor {isStatic, onIntersectedChanged}`, `useCharacterModelLoader`, `useCharacterAnimationLoader`, `CharacterModelProvider`, `useCharacterModel`, `CharacterAnimationAction`, `CharacterAnimationLayer`, `CharacterModelBone`, `PrototypeBox`, `BvhCharacterPhysics`, `CharacterCameraBehavior`, `FirstPersonCharacterCameraBehavior`, `KeyboardLocomotionActionBindings`, `PointerLockRotateZoomActionBindings`, hook binding (`useKeyboardLocomotionActionBindings`, `usePointerLockRotateZoomActionBindings`, `useKeyboardActionBinding`, `usePointerButtonActionBinding`), aksi `MoveForward/Backward/Left/RightAction`, `RunAction`, `JumpAction`, `RotateYawAction`, `RotatePitchAction`, `ZoomAction`, `EventAction`, `StateAction`, `BooleanOr`, `updateSimpleCharacterVelocity`, `shouldJump` (hanya rujukan logika), `lowerBody`/`upperBody`, `bvhBoneMap`, `IdleAnimationUrl`, `WalkAnimationUrl`, `RunAnimationUrl`, `JumpUpAnimationUrl`, `JumpLoopAnimationUrl`, `JumpDownAnimationUrl`.
Hanya lewat `import { Vanilla } from '@react-three/viverse'`: `JumpForwardAnimationUrl`, `mixamoBoneMap`, `loadCharacterModel`, `loadCharacterAnimation`, `fixModelAnimationClip`, `updateSimpleCharacterRotation`, kelas `BvhPhysicsWorld` (namanya bentrok dengan komponen). Kode yang butuh kelas world langsung (vendored physics, test Node) mengimpor dari `@pmndrs/viverse` (dependensi langsung, D-015). `three-mesh-bvh` tidak diimpor langsung.

## Physics library (fakta)

- Kinematic character controller berbasis depenetration shapecast (bukan swept). `update(model, dt, opts)`: `dt = min(1, dt)`; substep `min(sisa, 1/updatesPerSecond, capsuleRadius / speed)`; Euler eksplisit.
- Grounded = kontak dengan `direction.y > 0 && tan <= maxGroundSlope` **dan** `stateVelocity.y < 0`; saat grounded `stateVelocity = (0, g*0.01, 0)`; getter `isGrounded` = `notGroundedSeconds < 0.2` (hard-coded).
- **Posisi hanya ditulis balik bila `!isGrounded || inputVelocity ≠ 0`** (`physics/index.ts:111-113`): pemain diam tidak didorong obstacle dan tidak dibawa platform.
- `stateVelocity` privat; `applyVelocity` hanya menambah.
- `update()` diakhiri `world.updateSensors(center, bounds, triangle)` — satu-satunya jalan sensor terpicu.
- `model.parent == null` → posisi global tidak diinisialisasi dari `model.position` dan koreksi tabrakan hilang.
- World: body statis di-bake world-space; kinematic di-bake di ruang lokal **grup root** `BvhPhysicsBody`, `matrixWorld` grup itu dipakai saat query (tanpa `updateWorldMatrix`); anak di dalam body dibekukan saat mount; bake memakai `traverseVisible`; SkinnedMesh/morph dilewati; `InstancedMesh` per instance dan `removeBody(root)` tidak menghapus entri instanced; `shapecast` mengiterasi semua body tanpa broadphase; `raycast` tidak mengembalikan identitas body.
- Hook `useBvhCharacterPhysics` di priority -2; `useCharacterCameraBehavior` di -1 (tidak dipakai; D-014).

## Checklist vendoring (D-002)

`src/physics/character-physics.ts`, dari `packages/viverse/src/physics/index.ts`:
1. Header: `// Derived from pmndrs/viverse packages/viverse/src/physics/index.ts @ b88c0e7 (npm 0.2.29). Copyright 2024 Bela Bohlender, MIT; see THIRD_PARTY_LICENSES. Modifications (c) <year> <owner>: <list>.`
2. TS template: parameter property → field `private readonly world: BvhPhysicsWorld` yang di-assign di constructor; `import type` untuk tipe; parameter tak terpakai diawali `_`; import `BvhPhysicsWorld` dari `@pmndrs/viverse`.
3. Opsi default `updatesPerSecond: 240`, `maxGroundSlope: 1.0`, `coyoteTime: 0.12`.
4. Tambahan publik: `isGroundedRaw` (kontak pada step terakhir), `canJump` (`notGroundedSeconds < coyoteTime`), getter `velocity` (salinan), `jump(speed)` (set `stateVelocity.y = speed`, horizontal tetap), `impulse(v)` (hanya warisan kecepatan platform, dengan cap), `resetVelocity()`, `teleport(p)` (set posisi + reset velocity + `notGroundedSeconds = 0`), `applyCarry(delta: Matrix4)`, `forceWriteBack` per step.
5. `forceWriteBack = true` untuk step yang punya carry **atau** saat AABB kapsul (+0.1 m) bersinggungan dengan AABB world body kinematic terdaftar; selain itu pertahankan skip library (mencegah merayap di lereng).
6. Pertahankan panggilan `world.updateSensors(...)` di akhir `update()`.
7. `throw new Error('character must have a parent')` bila `model.parent == null`.
8. `CharacterPhysicsPort { step(dt), jump(speed), impulse(v), teleport(p), resetVelocity(), applyCarry(delta), readonly position, velocity, isGroundedRaw, canJump }` — modul lain tidak menyentuh kelasnya langsung. `groundBody` adalah field controller (hasil probe carry), bukan bagian port.

Bila kamera juga disalin (`camera.ts`), header dan aturan TS yang sama; `Vector3Tuple` lewat `import type`; `deltaTime` → `_deltaTime`.

## Carry platform (D-012)

1. **Struktur**: `<group ref={mover}> <Visual/> <BvhPhysicsBody kinematic ref={body}> <ColliderMesh/> </BvhPhysicsBody> </group>`. Hanya `mover` yang dianimasikan, di priority -3, dari world clock; lalu `mover.updateMatrixWorld(true)`. Tidak ada transform di bawah `body` yang berubah setelah mount.
2. **Registry**: setiap platform mendaftar `{ id, body, collider, prev: Matrix4, cur: Matrix4, linearVelocity, yawDelta }`. Per irisan: `prev ← cur`, `cur ← body.matrixWorld`. Saat Restart dan resume: `prev = cur`.
3. **Probe** (priority -2, sebelum `step`): 5 ray dari `feet + (0, 0.05, 0)` — tengah dan 4 titik pada `0.7 r` di ±X/±Z — masing-masing 0.15 m ke bawah, terhadap collider tiap platform terdaftar **dalam pose prev** (ray ditransformasi `prev⁻¹`), memakai `THREE.Raycaster`/`mesh.raycast` biasa. Alternatif: XZ kaki di dalam AABB top-face platform diperluas `r`. Hit mana pun = dibawa. Tidak memakai `isGrounded`/`canJump` untuk ini.
4. Bila dibawa: `Δ = cur · prev⁻¹`; `port.applyCarry(Δ)` (translasi + yaw); tambahkan yaw Δ ke yaw model dan kamera; `groundBody = id`.
5. Lompat dari platform: `port.impulse(linearVelocity)` dengan cap 8 m/s per sumbu.
6. Probe gagal → berhenti membawa **segera**; kecepatan warisan tetap.
7. Pemecahan frame (D-011, ref/02 §Frame order): bila perpindahan platform terbesar dalam frame >0.2 m, controller (-2) mengulang per irisan: `motion.advance(dt/n)` (langkah 1) → registry (2) → probe (3) → carry (4) → `step(dt/n)`. Tanpa memajukan platform per irisan, `prev == cur` setelah irisan pertama dan tidak ada yang dibawa.

## Collider, sensor, finish

- Collider tak terlihat: `mesh.visible = true` + `<meshBasicMaterial visible={false} />`. Tidak pernah mengubah `visible` objek di bawah body/sensor. Toggle debug mengubah `material.visible`.
- Sensor: box tertutup tinggi ≥0.5 m, bukan bidang (uji "di dalam" library memakai paritas ray ke bawah, sehingga quad tunggal terbaca "di dalam" di ketinggian berapa pun). Satu mesh tidak bisa sekaligus di body dan di sensor.
- `onIntersectedChanged` hanya terpicu saat berubah: callback hanya menyetel `inFinish = intersected`. Controller, setelah `step`: `state === 'PLAYING' && mode === 'run' && inFinish && isGroundedRaw` → VICTORY.
- Finish = collider box di body zona + sensor box terpisah 0.1 m lebih lebar, top +0.3 m.

## Kamera (D-014)

- `CharacterCameraBehavior` menulis `camera.position` dan `camera.rotation` setiap update dan memakai satu ray dengan pull-in `distance - offset(0.2)`. Jebakan: jarak <0.2 → negatif (kamera terbalik ke depan) — makanya `camRaycast` mengembalikan `max(s, 0.55)`; `zoom: false` membuat zoom "menyusut" setelah collision dan wheel negatif menyalin jarak bebas-collision ke `zoomDistance` — makanya `zoom: { speed: 0 }` dan zoom dimiliki game; cabang `firstUpdate` bisa meninggalkan yaw 0 — makanya yaw/pitch disetel eksplisit saat spawn dan Restart.
- World kamera: satu `Vanilla.BvhPhysicsWorld` kedua berisi hull pemblokir per zona yang disederhanakan (tanpa railing/kabel/pipa tipis). Waktu bake dan segitiganya masuk budget D-013 dan di-log TEST-01.

## Animasi

- `loadCharacterAnimation` mensyaratkan **tepat satu klip per file** (`Expected exactly one animation clip`). Pack UAL kemungkinan satu GLB berisi banyak klip → `scripts/split-clips.mjs` (ref/05).
- Retarget: hanya track untuk nama tulang VRM yang dipertahankan; posisi hanya untuk `hips`/`root`; hips diskalakan rasio tinggi; `removeXZMovement: true` membuang root motion horizontal.
- Model non-VRM (`type: 'gltf'`): `boneMap` yang **sama** dioper ke `useCharacterModelLoader` **dan** ke setiap `CharacterAnimationAction`/`useCharacterAnimationLoader`; peta harus memetakan pelvis → `hips` dan mencakup tulang humanoid inti (22 tulang: hips, spine, chest, upperChest, neck, head, bahu/lengan atas/bawah/tangan, paha/betis/kaki/jari kaki kiri-kanan). Kunci = nama node **yang sudah disanitasi three.js** (titik, titik dua, garis miring, kurung dihapus; spasi → `_`); kunci salah gagal diam-diam. Dump nama node model dan satu klip ke evidence sebelum menulis peta.
- Model non-VRM mendapat putaran hips 180° Y dari library: bila karakter menghadap ke belakang, putar grup pembungkus visual di dalam model sebesar π — tidak pernah root physics.
- Loader VRM dan loader animasi **tidak** mendaftarkan MeshoptDecoder; loader glTF karakter mendaftarkannya. Maka: file `.vrm` dan file klip tidak pernah dikompresi meshopt/quantize.
- Semua opsi loader adalah konstanta modul (`src/character/rig.ts`), D-001.
- Graf: `RunTimeline > Graph > GrapthState` (ejaan asli di 0.3.9) `> Switch/SwitchCase/Parallel`, `timePassed`, `animationFinished`. Mask `lowerBody` mencakup hips.
- Slot `SimpleCharacter` (rujukan saja): `idle, walk, run, jumpUp, jumpLoop, jumpDown, jumpForward`; tidak ada `jumpStart`.

## Kesalahan dokumen yang diketahui (kode menang)

`<SimpleCharacter walk= run= jump=>` → prop sebenarnya `movement={{…}}`; `maxGroundSlope` 0.5 → kode 1; `rotation.speed`/`zoom.speed` 1000 → kode 1.0; rotasi/zoom pointer 0.4/0.0001 → kode 4.0/0.001; slot `jumpStart` tidak ada; `mixamoBoneMap` tidak di-re-export; "built-in robot avatar" → mannequin Quaternius; `LICENSE` menyebut `robot.vrm` yang tidak ada; Sandpack mem-pin `fiber <9`/`drei <10` (basi); skrip vitexec contoh mengimpor `/@fs/Users/bela/...` (tidak portabel — import `/src/...` atau nama paket); `useScreenButton` menyetel className canvas menjadi `mobile-only`; binding keyboard menambahkan listener `pointerlockchange` tanpa abort signal (bocor kecil per instance — mount binding sekali); binding `PointerCapture` default menghasilkan `setPointerCapture … InvalidStateError` saat pointer terkunci (tidak dipakai game).

## Issue upstream

#3 (maintainer: tidak bisa berdiri di objek kinematic), #12 (open: kinematic terasa statis), #10 (open: model kustom lag saat ganti arah — probe di G2 dengan model final), #11 (0.2.3 rusak), #9 (loader pernah mensyaratkan node `root`; tidak ada lagi di 0.2.29).
