// One-off G2 probe: the slice loads, bodies bake, Play works, the player can walk. Not evidence.
import { bootToPlaying, game, logRenderer, sleep } from '/vitexec/lib/move-smoke.ts'
import { keyboard } from 'vitexec'
type Full = { state: string; bvh: unknown; platforms: unknown; player: { pos: number[] }; hud: unknown; camera: unknown }
const full = () => (window as unknown as { __game: { snapshot(): Full } }).__game.snapshot()
logRenderer()
await bootToPlaying()
console.log('loaded ' + JSON.stringify({ bvh: full().bvh, platforms: full().platforms, hudText: document.querySelector('[data-testid=hud-height]')?.textContent }))
await keyboard.down('KeyW', { releaseAfterMs: 900 })
await sleep(1200)
console.log('after walk ' + JSON.stringify({ state: full().state, pos: game().snapshot().player.pos, cam: full().camera }))
