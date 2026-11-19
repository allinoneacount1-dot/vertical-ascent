// Character loader options as module-level frozen constants (DIRECTIVE D-001):
// Each selectable Hero maps to its own distinct 3D model (3 CC0 VRoid VRMs + 1 CC0 UAL2 Mannequin GLB),
// lazy-loaded on demand via Suspense and sharing the 6 UAL1 locomotion/jump clips.
import type { VRMHumanBoneName } from '@react-three/viverse'
import { assetUrl } from '../assets.ts'
import type { HeroId } from './heroes.ts'

/** Unreal/Godot Mannequin_F skeleton (UAL2 Standard) -> VRM humanoid bone names. */
export const UE_MANNEQUIN_BONE_MAP: Readonly<Record<string, VRMHumanBoneName>> = Object.freeze({
  pelvis: 'hips',
  spine_01: 'spine',
  spine_02: 'chest',
  spine_03: 'upperChest',
  neck_01: 'neck',
  Head: 'head',
  clavicle_l: 'leftShoulder',
  upperarm_l: 'leftUpperArm',
  lowerarm_l: 'leftLowerArm',
  hand_l: 'leftHand',
  index_01_l: 'leftIndexProximal',
  index_02_l: 'leftIndexIntermediate',
  index_03_l: 'leftIndexDistal',
  middle_01_l: 'leftMiddleProximal',
  middle_02_l: 'leftMiddleIntermediate',
  middle_03_l: 'leftMiddleDistal',
  pinky_01_l: 'leftLittleProximal',
  pinky_02_l: 'leftLittleIntermediate',
  pinky_03_l: 'leftLittleDistal',
  ring_01_l: 'leftRingProximal',
  ring_02_l: 'leftRingIntermediate',
  ring_03_l: 'leftRingDistal',
  thumb_01_l: 'leftThumbMetacarpal',
  thumb_02_l: 'leftThumbProximal',
  thumb_03_l: 'leftThumbDistal',
  clavicle_r: 'rightShoulder',
  upperarm_r: 'rightUpperArm',
  lowerarm_r: 'rightLowerArm',
  hand_r: 'rightHand',
  index_01_r: 'rightIndexProximal',
  index_02_r: 'rightIndexIntermediate',
  index_03_r: 'rightIndexDistal',
  middle_01_r: 'rightMiddleProximal',
  middle_02_r: 'rightMiddleIntermediate',
  middle_03_r: 'rightMiddleDistal',
  pinky_01_r: 'rightLittleProximal',
  pinky_02_r: 'rightLittleIntermediate',
  pinky_03_r: 'rightLittleDistal',
  ring_01_r: 'rightRingProximal',
  ring_02_r: 'rightRingIntermediate',
  ring_03_r: 'rightRingDistal',
  thumb_01_r: 'rightThumbMetacarpal',
  thumb_02_r: 'rightThumbProximal',
  thumb_03_r: 'rightThumbDistal',
  thigh_l: 'leftUpperLeg',
  calf_l: 'leftLowerLeg',
  foot_l: 'leftFoot',
  ball_l: 'leftToes',
  thigh_r: 'rightUpperLeg',
  calf_r: 'rightLowerLeg',
  foot_r: 'rightFoot',
  ball_r: 'rightToes',
})

/** Default protagonist VRM (restyled AvatarSample_F, D-051, textures <= 1024^2); useViverseAvatar false (D-003). */
export const MODEL_OPTIONS = Object.freeze({
  url: assetUrl('assets/characters/protagonist-f.vrm'),
  type: 'vrm' as const,
  useViverseAvatar: false,
  castShadow: true,
  receiveShadow: true,
})

/** Distinct frozen model loader configs per selectable Hero (Fase 6 Gelombang B). */
export const HERO_MODEL_OPTIONS = Object.freeze({
  sora: MODEL_OPTIONS,
  kaze: Object.freeze({
    url: assetUrl('assets/characters/protagonist-g.vrm'),
    type: 'vrm' as const,
    useViverseAvatar: false,
    castShadow: true,
    receiveShadow: true,
  }),
  aoi: Object.freeze({
    url: assetUrl('assets/characters/protagonist-e.vrm'),
    type: 'vrm' as const,
    useViverseAvatar: false,
    castShadow: true,
    receiveShadow: true,
  }),
  ren: Object.freeze({
    url: assetUrl('assets/characters/mannequin-f.glb'),
    type: 'gltf' as const,
    boneMap: UE_MANNEQUIN_BONE_MAP,
    useViverseAvatar: false,
    castShadow: true,
    receiveShadow: true,
  }),
}) satisfies Readonly<Record<HeroId, unknown>>

/** Default model options kept for backwards compatibility. */
/** Model options for this page, chosen once at module load (the loader key must stay identical, D-001). */
export const ACTIVE_MODEL_OPTIONS = MODEL_OPTIONS

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
    removeXZMovement: true,
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

export const FADE_S = 0.1
export const LAND_HOLD_S = 0.1
export const JUMP_UP_MIN_S = 0.3
export const RISING_VY = 0.5
