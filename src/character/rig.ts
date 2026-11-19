// Character loader options as module-level constants (DIRECTIVE D-001): the loaders suspend() on a key compared
// with ===, so an inline object or function would reload forever.
// Supports 4 distinct 3D Hero models (3 VRoid CC0 VRMs + 1 stylized Quaternius Sky Automaton mannequin),
// all sharing VRM humanoid bone names and the 6 UAL1 Standard animation clips.
import type { VRMHumanBoneName } from '@react-three/viverse'
import { assetUrl } from '../assets.ts'
import type { HeroId } from './heroes.ts'

/** Default protagonist VRM (restyled AvatarSample_F, D-051, textures <= 1024^2); useViverseAvatar false (D-003). */
export const MODEL_OPTIONS = Object.freeze({
  url: assetUrl('assets/characters/protagonist-f.vrm'),
  type: 'vrm' as const,
  useViverseAvatar: false,
  castShadow: true,
  receiveShadow: true,
})

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
    url: undefined as string | undefined,
    useViverseAvatar: false,
    castShadow: true,
    receiveShadow: true,
  }),
}) satisfies Readonly<Record<HeroId, Readonly<{ url?: string; type?: 'vrm' | 'gltf'; useViverseAvatar: boolean; castShadow: boolean; receiveShadow: boolean }>>>

/** Default model options constant (kept for compatibility with TEST-03). */
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
