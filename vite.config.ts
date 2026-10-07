import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    target: 'es2022',
    // three.js is the bulk of the bundle; keep it in its own long-cached chunk.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [{ name: 'three', test: /node_modules[\\/](three|postprocessing)/ }],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Clashborn — Auto Duel Arena',
        short_name: 'Clashborn',
        description: 'Fully automatic 1v1 arena battles driven by gear, abilities and adaptive AI.',
        theme_color: '#0d0f1a',
        background_color: '#0d0f1a',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
