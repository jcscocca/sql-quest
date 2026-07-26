/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.DEPLOY_BASE ?? '/'

// Pyodide is served from our own origin (dev middleware + dist/pyodide/) so the
// app has no runtime CDN dependency and the version always matches the package.
const pyodideCopy = viteStaticCopy({
  targets: [
    {
      src: [
        'node_modules/pyodide/pyodide.mjs',
        'node_modules/pyodide/pyodide.asm.js',
        'node_modules/pyodide/pyodide.asm.wasm',
        'node_modules/pyodide/python_stdlib.zip',
        'node_modules/pyodide/pyodide-lock.json',
      ],
      dest: 'pyodide',
      rename: { stripBase: 2 }, // strips node_modules/pyodide/
    },
  ],
})

// Precache only the app shell; the heavyweights (engines, worlds, sprites) are
// cached on first use so the initial visit doesn't download ~50 MB up front.
const pwa = VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'SQL Quest',
    short_name: 'SQL Quest',
    description: 'A single-player coding trainer: SQL, JavaScript, and Python tracks, all in-browser.',
    theme_color: '#151521',
    background_color: '#151521',
    display: 'standalone',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html}', 'icons/*.png'],
    globIgnores: ['pyodide/**'],
    navigateFallback: `${base}index.html`,
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    runtimeCaching: [
      {
        // DuckDB wasm (only the selected bundle) and everything Pyodide fetches.
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin && (url.pathname.endsWith('.wasm') || url.pathname.includes('/pyodide/')),
        handler: 'CacheFirst',
        options: { cacheName: 'engines', expiration: { maxEntries: 20 } },
      },
      {
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin && (url.pathname.includes('/worlds/') || url.pathname.includes('/sprites/')),
        handler: 'CacheFirst',
        options: { cacheName: 'world-data', expiration: { maxEntries: 600 } },
      },
      {
        // Content is append-only: serve cached instantly, refresh in the background.
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/content/'),
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'content' },
      },
    ],
  },
})

export default defineConfig({
  base,
  plugins: [react(), pyodideCopy, pwa],
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
