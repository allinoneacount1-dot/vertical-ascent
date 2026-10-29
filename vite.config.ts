/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { DEFAULT_SLOTS, stubViverseDefaults } from './scripts/stub-viverse-defaults.ts'

// Slots still waiting for a licensed replacement (gaps, ref/05 §Stub). The six clips are replaced by the UAL1 clips
// (D-047) and jump-forward is only used by SimpleCharacter, which the game does not render (D-001, D-044); the
// mannequin stays until the final character (TEST-03). Remove a slot once its replacement is integrated.
const GAP_SLOTS = DEFAULT_SLOTS.filter((slot) => slot === 'mannequin')

// Spec: docs/directive/ref/01-templates.md §vite.config.ts. G5 adds the license plugin.
export default defineConfig({
  base: './',
  appType: 'mpa',
  plugins: [react(), stubViverseDefaults(GAP_SLOTS)],
  resolve: { dedupe: ['three', '@react-three/fiber'] },
  // include: vitexec harness scripts import '@pmndrs/viverse' directly; without pre-bundling, the first cold run
  // discovers it, re-optimizes and reloads the page mid-script (D-031).
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      '@pmndrs/viverse',
      '@react-three/drei',
      '@react-three/fiber',
      '@react-three/viverse',
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-dev-runtime',
      'react/jsx-runtime',
      'three',
      'zustand',
    ],
  },
  server: { watch: { ignored: ['**/.cache/**', '**/.tmp/**', '**/evidence/**', '**/licenses/**'] } },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.cache/**', '**/.tmp/**', '**/evidence/**'],
  },
})
