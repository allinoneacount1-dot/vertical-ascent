// Vite plugin (ref/05 §Stub default paket): replaces the library's bundled default mannequin and clips (data-URL
// chunks) with a stub, except the slots listed in `keep` (slots that still wait for a licensed replacement = gaps).
import type { Plugin } from 'vite'

export const DEFAULT_SLOTS = ['mannequin', 'idle', 'walk', 'run', 'jump-up', 'jump-loop', 'jump-down', 'jump-forward'] as const

export const stubViverseDefaults = (keep: readonly string[] = []): Plugin => ({
  name: 'stub-viverse-default-assets',
  enforce: 'pre',
  load(id) {
    const m = id.split('?')[0].match(/@pmndrs[\\/]viverse[\\/]dist[\\/]assets[\\/](mannequin|idle|walk|run|jump-[a-z]+)\.js$/)
    if (m && !keep.includes(m[1])) return 'export const url = "data:,stubbed"'
    return null
  },
})
