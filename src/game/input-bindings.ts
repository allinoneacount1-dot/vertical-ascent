// Keyboard bindings with rebinding (DIRECTIVE D-021; ref/04 §Kesalahan dokumen: the library binding adds a
// pointerlockchange listener without an abort signal, so it is created once). Keys are KeyboardEvent.code values
// from va.settings.v1; applyBindings() only swaps the key lists. Pause and recentre are read by enter-playing.ts.
import { KeyboardLocomotionActionBindings } from '@pmndrs/viverse'
import type { ActionId } from './settings.ts'

let bindings: KeyboardLocomotionActionBindings | null = null
let pending: Readonly<Record<ActionId, string[]>> | null = null

/** Creates the movement/jump/run bindings on the canvas once (the Canvas never unmounts, D-005). */
export function installInputBindings(canvas: HTMLCanvasElement): void {
  if (bindings != null) return
  bindings = new KeyboardLocomotionActionBindings(canvas, new AbortController().signal)
  for (const b of [bindings.moveForwardBinding, bindings.moveBackwardBinding, bindings.moveLeftBinding, bindings.moveRightBinding, bindings.runBinding, bindings.jumpBinding])
    b.requiresPointerLock = true
  if (pending) applyBindings(pending)
}

/** Applies stored key codes per action (called whenever settings are applied). */
export function applyBindings(keys: Readonly<Record<ActionId, string[]>>): void {
  pending = keys
  if (bindings == null) return
  bindings.moveForwardBinding.keys = [...keys.forward]
  bindings.moveBackwardBinding.keys = [...keys.backward]
  bindings.moveLeftBinding.keys = [...keys.left]
  bindings.moveRightBinding.keys = [...keys.right]
  bindings.runBinding.keys = [...keys.run]
  bindings.jumpBinding.keys = [...keys.jump]
}

/** Preset key sets (D-021): physical WASD (AZERTY users get ZQSD positions automatically) and arrows. */
export const BINDING_PRESETS: Readonly<Record<'wasd' | 'arrows', Readonly<Record<ActionId, string[]>>>> = Object.freeze({
  wasd: {
    forward: ['KeyW'],
    backward: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    run: ['ShiftLeft', 'ShiftRight'],
    jump: ['Space'],
    pause: ['KeyP'],
    recentre: ['KeyR'],
  },
  arrows: {
    forward: ['ArrowUp'],
    backward: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    run: ['ShiftRight', 'ShiftLeft'],
    jump: ['Space'],
    pause: ['KeyP'],
    recentre: ['KeyR'],
  },
})

/** Human label of a key code: the layout map when the browser has one (D-021), else the code itself. */
export async function keyLabel(code: string): Promise<string> {
  const kb = (navigator as unknown as { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard
  try {
    const map = await kb?.getLayoutMap()
    const k = map?.get(code)
    if (k) return k.toUpperCase()
  } catch {
    // no layout map (Firefox, insecure context): fall through
  }
  return code.replace(/^Key/, '').replace(/^Digit/, '')
}
