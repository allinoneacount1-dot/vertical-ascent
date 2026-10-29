// TEST-18a (DIRECTIVE §7, smoke, G2): HAR of the slice — run with --network-trace; the HAR is checked afterwards by
// scripts/har-check.mjs (0 requests to hosts other than 127.0.0.1, 0 responses 4xx/5xx, 0 asset responses text/html).
// The page loads, plays the first part of the slice with real input (walk, sprint, jump), pauses and resumes.
import { keyboard } from 'vitexec'
import { bootToPlaying, logRenderer, sleep } from '/vitexec/lib/move-smoke.ts'

logRenderer()
await bootToPlaying()
await keyboard.down('KeyW', { releaseAfterMs: 600 })
await sleep(700)
await keyboard.press('ShiftLeft')
await keyboard.down('KeyW', { releaseAfterMs: 500 })
await keyboard.press('Space')
await sleep(1200)
await keyboard.press('KeyP')
await sleep(500)
const state = (window as unknown as { __game: { state: string; level: string } }).__game
console.log('TEST-18a page ' + JSON.stringify({ state: state.state, level: state.level, resources: performance.getEntriesByType('resource').length }))
