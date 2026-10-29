/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Spec: docs/directive/ref/01-templates.md §vite.config.ts.
// G2 adds stubViverseDefaults (./scripts/stub-viverse-defaults.ts), G5 adds the license plugin.
export default defineConfig({
  base: './',
  appType: 'mpa',
  plugins: [react()],
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
