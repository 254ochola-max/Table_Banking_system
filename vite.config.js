import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Split large vendor libraries into their own chunks so browsers can
    // cache them independently from the app code.
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Put all node_modules into a single stable vendor chunk so the
          // browser caches vendor code independently from app code.
          if (id.includes('node_modules')) {
            // Supabase is large — give it its own chunk
            if (id.includes('@supabase')) return 'vendor-supabase';
            // Everything else vendor
            return 'vendor';
          }
        },
      },
    },
  },
});
