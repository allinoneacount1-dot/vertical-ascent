// One-off G3 probe (ref/06 §Probe): the DEV-only protagonist preview (?character=preview, D-054) in the slice —
// boot, Play, walk forward with real input, then a screenshot from the default third-person camera (the camera sits
// behind the character, so a correct facing shows the back and the pack). Not TEST evidence.
import { keyboard } from 'vitexec'
import { bootToPlaying, logRenderer, sleep } from '/vitexec/lib/move-smoke.ts'

type Snap = { state: string; player: { pos: number[] }; camera: { yaw: number }; anim: { clip: string | null }; model: { uuid: string } }
const snap = () => (window as unknown as { __game: { snapshot(): Snap; facingYaw?: number } }).__game.snapshot()

logRenderer()
await bootToPlaying()
const vrmRequested = performance.getEntriesByType('resource').some((r) => r.name.includes('protagonist-f.vrm'))
await keyboard.down('KeyW', { releaseAfterMs: 1200 })
await sleep(600)
const walking = snap()
await sleep(1000)
console.log('preview ' + JSON.stringify({ vrmRequested, walkingClip: walking.anim.clip, pos: snap().player.pos, cameraYaw: snap().camera.yaw, state: snap().state }))
