import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// L'app è pubblicata su https://filippocorno-hash.github.io/ricettario/
export default defineConfig({
  base: '/ricettario/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Ricettario',
        short_name: 'Ricettario',
        description: 'Ricette, menu settimanale e lista della spesa',
        lang: 'it',
        start_url: '/ricettario/',
        scope: '/ricettario/',
        display: 'standalone',
        background_color: '#faf6ef',
        theme_color: '#2f5d3a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/ricettario/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
})
