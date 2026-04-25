import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      // Coverage spans backend, lib, and all pure UI components.
      // WorkspaceShell.tsx (the stateful orchestrator with Realtime/polling
      // effects) is excluded — it needs Playwright-level E2E testing (Phase 6).
      // Every pure component extracted into components/ is individually tested.
      include: [
        'lib/**/*.ts',
        'app/api/**/*.ts',
        'app/w/[slug]/components/**/*.tsx',
        'app/w/[slug]/WorkspaceShell.tsx',
      ],
      exclude: [
        'lib/supabase/types.ts',
        'lib/supabase/client.ts',
        'lib/supabase/server.ts',
        'lib/supabase/middleware.ts',
        'lib/utils.ts',
        'lib/templates/seed.ts',
        'app/w/[slug]/components/types.ts', // shared type definitions only
      ],
      reporter: ['text', 'html', 'json-summary'],
      // Thresholds are a ratchet — only move them up, never down.
      // Update these when a phase lands new covered code; CI blocks merge if
      // coverage drops below the floor.
      //
      // Phase 1–5 baseline (153 tests, 16 files):
      //   statements 99%, branches 89%, functions 100%, lines 99%
      thresholds: {
        statements: 95,
        lines: 95,
        functions: 95,
        branches: 80,
      },
    },
  },
})
