import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor'
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor'
            }
            if (id.includes('@supabase/supabase-js')) {
              return 'supabase-vendor'
            }
            if (id.includes('@radix-ui')) {
              return 'radix-vendor'
            }
            if (id.includes('lucide-react') || id.includes('sonner')) {
              return 'ui-vendor'
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 550,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['archive/**', 'dist/**', 'node_modules/**'],
  },
})
