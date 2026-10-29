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
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/.cache/**', '**/.tmp/**', '**/evidence/**', '**/licenses/**'] } },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.cache/**', '**/.tmp/**', '**/evidence/**'],
  },
})
