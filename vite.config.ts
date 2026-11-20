/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { DEFAULT_SLOTS, stubViverseDefaults } from './scripts/stub-viverse-defaults.ts'

// All default slots (mannequin + 6 clips + jump-forward) are replaced by project assets (D-044, D-047, protagonist-f).
const GAP_SLOTS = DEFAULT_SLOTS.filter((s) => s === 'mannequin')

// Spec: docs/directive/ref/01-templates.md §vite.config.ts. G5 adds the license plugin.
export default defineConfig({
  base: './',
  appType: 'mpa',
  plugins: [react(), stubViverseDefaults(GAP_SLOTS)],
  resolve: { dedupe: ['three', '@react-three/fiber'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/three/') || id.includes('\\three\\')) return 'vendor-three'
          if (id.includes('/@react-three/') || id.includes('\\@react-three\\') || id.includes('/@pmndrs/') || id.includes('\\@pmndrs\\')) return 'vendor-r3f'
          if (id.includes('/react/') || id.includes('\\react\\') || id.includes('/react-dom/') || id.includes('\\react-dom\\') || id.includes('/zustand/') || id.includes('\\zustand\\')) return 'vendor-react'
          return undefined
        },
      },
    },
  },
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
