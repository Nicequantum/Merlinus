import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png', 'icon-1024.png'],
      manifest: {
        name: 'Benz Tech - Mercedes-Benz Warranty Stories',
        short_name: 'BenzTech',
        description: 'Mercedes-Benz technician tool: improved RO scan + prefill, Xentry photo analysis, smart defaults, encrypted xAI key, one-click audit-resistant warranty stories.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-1024.png',
            sizes: '1024x1024',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173
  },
  build: {
    // Force esbuild minifier (avoids terser/serialize-javascript crypto issues in some envs)
    minify: 'esbuild',
    sourcemap: false,
    // Extra: prevent any terser fallback
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  // Help esbuild in restricted envs
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  }
})
