import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Shown small in a screen corner (.version in src/ui/styles.css): package version plus the
// short commit, so a glance tells which build a device is running. Vercel
// builds have no .git, but they provide the commit in VERCEL_GIT_COMMIT_SHA.
function buildVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  if (!sha) {
    try { sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git */ }
  }
  return sha ? `v${pkg.version} · ${sha.slice(0, 7)}` : `v${pkg.version}`;
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },
  build: {
    target: 'es2022',
    // three.js is the bulk of the bundle; keep it in its own long-cached chunk.
    rolldownOptions: {
      // gallery.html is a review page for item icons and 3D gear (/gallery.html).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gallery: fileURLToPath(new URL('./gallery.html', import.meta.url)),
      },
      output: {
        codeSplitting: {
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
        theme_color: '#170f1d',
        background_color: '#170f1d',
        id: '/',
        // Standalone with no orientation: on Xiaomi (HyperOS/MIUI) a WebAPK installed
        // with display "fullscreen" or any fixed orientation never launches. The game
        // goes fullscreen and locks landscape itself on a tap (src/ui/fullscreen.ts).
        display: 'standalone',
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
