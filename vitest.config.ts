import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: [
        'lib/supabase/types.ts',
        'lib/supabase/client.ts',    // browser Supabase setup — no logic
        'lib/supabase/server.ts',    // server Supabase setup — no logic
        'lib/supabase/middleware.ts',// Next.js middleware helper — no logic
        'lib/utils.ts',              // just cn() tailwind helper
        'lib/templates/seed.ts',     // DB seed script — requires live DB
      ],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
})
