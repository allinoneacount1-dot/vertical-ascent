// Character loader options as module-level constants (DIRECTIVE D-001): the loaders suspend() on a key compared
// with ===, so an inline object or function would reload forever. Model: still the library mannequin (gap until
// the final character, TEST-03, D-017). Clips: Quaternius Universal Animation Library (A1, CC0 label + QAL v1.0
// note), split by scripts/build-only-assets.sh — the same six motions the library bundles as its defaults (D-047).
import type { VRMHumanBoneName } from '@react-three/viverse'
import { assetUrl } from '../assets.ts'

/** No url = the bundled mannequin; useViverseAvatar false (D-003). */
export const MODEL_OPTIONS = Object.freeze({ useViverseAvatar: false, castShadow: true, receiveShadow: true })

/**
 * DEV-only local preview of the prepared protagonist (D-054), selected with ?character=preview: the restyled
 * AvatarSample_F built into .cache by scripts/build-protagonist.sh. Never in public/ or a build — the mannequin
 * stays the shipped model until the owner confirms pixiv's first-party CC0 text (D-045).
 */
const PREVIEW_MODEL_OPTIONS = Object.freeze({
  url: '/.cache/work/vroid-f/protagonist-f.vrm',
  type: 'vrm' as const,
  useViverseAvatar: false,
  castShadow: true,
  receiveShadow: true,
})

/** Model options for this page, chosen once at module load (the loader key must stay identical, D-001). */
export const ACTIVE_MODEL_OPTIONS =
  import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('character') === 'preview'
    ? PREVIEW_MODEL_OPTIONS
    : MODEL_OPTIONS

/**
 * UAL1 Standard bone names (pre-v2.0 rig, sanitized by three.js) → VRM humanoid names. Derived by pairing the 53
 * skin joints of UAL1 with the library mannequin's VRM-named joints in the same order
 * (evidence/G2/G2-ual1-nodes.json). `root` has no humanoid name; the loader drops its tracks either way.
 * Only the clips get this map: the mannequin's nodes already carry VRM names, and so does any VRM model.
 */
export const UAL1_BONE_MAP: Readonly<Record<string, VRMHumanBoneName>> = Object.freeze({
  'DEF-hips': 'hips',
  'DEF-spine001': 'spine',
  'DEF-spine002': 'chest',
  'DEF-spine003': 'upperChest',
  'DEF-neck': 'neck',
  'DEF-head': 'head',
  'DEF-shoulderL': 'leftShoulder',
  'DEF-upper_armL': 'leftUpperArm',
  'DEF-forearmL': 'leftLowerArm',
  'DEF-handL': 'leftHand',
  'DEF-f_index01L': 'leftIndexProximal',
  'DEF-f_index02L': 'leftIndexIntermediate',
  'DEF-f_index03L': 'leftIndexDistal',
  'DEF-f_middle01L': 'leftMiddleProximal',
  'DEF-f_middle02L': 'leftMiddleIntermediate',
  'DEF-f_middle03L': 'leftMiddleDistal',
  'DEF-f_pinky01L': 'leftLittleProximal',
  'DEF-f_pinky02L': 'leftLittleIntermediate',
  'DEF-f_pinky03L': 'leftLittleDistal',
  'DEF-f_ring01L': 'leftRingProximal',
  'DEF-f_ring02L': 'leftRingIntermediate',
  'DEF-f_ring03L': 'leftRingDistal',
  'DEF-thumb01L': 'leftThumbMetacarpal',
  'DEF-thumb02L': 'leftThumbProximal',
  'DEF-thumb03L': 'leftThumbDistal',
  'DEF-shoulderR': 'rightShoulder',
  'DEF-upper_armR': 'rightUpperArm',
  'DEF-forearmR': 'rightLowerArm',
  'DEF-handR': 'rightHand',
  'DEF-f_index01R': 'rightIndexProximal',
  'DEF-f_index02R': 'rightIndexIntermediate',
  'DEF-f_index03R': 'rightIndexDistal',
  'DEF-f_middle01R': 'rightMiddleProximal',
  'DEF-f_middle02R': 'rightMiddleIntermediate',
  'DEF-f_middle03R': 'rightMiddleDistal',
  'DEF-f_pinky01R': 'rightLittleProximal',
  'DEF-f_pinky02R': 'rightLittleIntermediate',
  'DEF-f_pinky03R': 'rightLittleDistal',
  'DEF-f_ring01R': 'rightRingProximal',
  'DEF-f_ring02R': 'rightRingIntermediate',
  'DEF-f_ring03R': 'rightRingDistal',
  'DEF-thumb01R': 'rightThumbMetacarpal',
  'DEF-thumb02R': 'rightThumbProximal',
  'DEF-thumb03R': 'rightThumbDistal',
  'DEF-thighL': 'leftUpperLeg',
  'DEF-shinL': 'leftLowerLeg',
  'DEF-footL': 'leftFoot',
  'DEF-toeL': 'leftToes',
  'DEF-thighR': 'rightUpperLeg',
  'DEF-shinR': 'rightLowerLeg',
  'DEF-footR': 'rightFoot',
  'DEF-toeR': 'rightToes',
})

const ual1 = (clip: string, scaleTime?: number) =>
  Object.freeze({
    url: assetUrl(`assets/_build-only/animations/ual1/${clip}.glb`),
    type: 'gltf' as const,
    boneMap: UAL1_BONE_MAP,
    removeXZMovement: true, // ref/05 §Sumber Animasi
    ...(scaleTime == null ? {} : { scaleTime }),
  })

/** scaleTime values follow the library's SimpleCharacter graph (walk 0.5, run 0.8). */
export const CLIPS = Object.freeze({
  idle: ual1('Idle_Loop'),
  walk: ual1('Walk_Loop', 0.5),
  run: ual1('Sprint_Loop', 0.8),
  jumpUp: ual1('Jump_Start'),
  jumpLoop: ual1('Jump_Loop'),
  jumpDown: ual1('Jump_Land'),
})

/** Cross-fade between clips (library default). */
export const FADE_S = 0.1
/** Landing clip window. D-023/TEST-06 allow ≤150 ms; graph transitions land on frame boundaries (+1–2 frames), so 0.10 s. */
export const LAND_HOLD_S = 0.1
/** Minimum time in jumpUp before a landing can end it. */
export const JUMP_UP_MIN_S = 0.3
/** Upward speed that counts as rising (m/s). */
export const RISING_VY = 0.5
