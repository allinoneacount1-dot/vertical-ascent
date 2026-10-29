// Character loader options as module-level constants (DIRECTIVE D-001): the loaders suspend() on a key compared
// with ===, so an inline object or function would reload forever. G1 blockout: library mannequin + default clips
// (D-016 b, expected placeholders); the final character and boneMap arrive in G2 (D-017).
import { IdleAnimationUrl, JumpDownAnimationUrl, JumpLoopAnimationUrl, JumpUpAnimationUrl, RunAnimationUrl, WalkAnimationUrl } from '@react-three/viverse'

/** No url = the bundled mannequin; useViverseAvatar false (D-003). */
export const MODEL_OPTIONS = Object.freeze({ useViverseAvatar: false, castShadow: true, receiveShadow: true })

/** scaleTime values follow the library's SimpleCharacter graph (walk 0.5, run 0.8). */
export const CLIPS = Object.freeze({
  idle: Object.freeze({ url: IdleAnimationUrl }),
  walk: Object.freeze({ url: WalkAnimationUrl, scaleTime: 0.5 }),
  run: Object.freeze({ url: RunAnimationUrl, scaleTime: 0.8 }),
  jumpUp: Object.freeze({ url: JumpUpAnimationUrl }),
  jumpLoop: Object.freeze({ url: JumpLoopAnimationUrl }),
  jumpDown: Object.freeze({ url: JumpDownAnimationUrl }),
})

/** Cross-fade between clips (library default). */
export const FADE_S = 0.1
/** Landing clip window. D-023/TEST-06 allow ≤150 ms; graph transitions land on frame boundaries (+1–2 frames), so 0.10 s. */
export const LAND_HOLD_S = 0.1
/** Minimum time in jumpUp before a landing can end it. */
export const JUMP_UP_MIN_S = 0.3
/** Upward speed that counts as rising (m/s). */
export const RISING_VY = 0.5
