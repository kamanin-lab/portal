import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['archive/**', 'dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: [
        'src/modules/tickets/lib/**',
        'src/modules/projects/lib/**',
        'src/shared/lib/**',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/mock-data.ts',
        'src/**/dictionary.ts',
        'src/**/workspace-routes.ts',
        'src/**/supabase.ts',
        'src/**/hilfe-faq-data.ts',
        'src/**/utils.ts',
        // Infrastructure files: XHR browser API, React JSX utility, timer-based
        'src/**/upload-with-progress.ts',
        'src/**/linkify.tsx',
        'src/**/session-timeout.ts',
      ],
      thresholds: {
        lines: 85,       // enforced — line coverage is the clearest indicator
        functions: 90,   // enforced — every exported function must be callable by tests
        branches: 70,    // pragmatic — defensive ?? null-checks in transforms inflate denominator
        statements: 80,  // pragmatic — complex store/transform code has reachable but low-risk paths
      },
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
