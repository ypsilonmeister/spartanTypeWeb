import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { VitePWA } from 'vite-plugin-pwa'

// base is injected at build time by the GitHub Pages workflow (e.g. "/reponame/").
// Falls back to "/" for local dev and previews.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        // MediaPipe のモデル(~10MB)と WASM は CDN から取得するため、
        // precache せず実行時に CacheFirst でキャッシュする。
        // 一度オンラインで読み込めば以降はオフラインでも手の検出が動作する。
        runtimeCaching: [
          {
            // モデルファイル: https://storage.googleapis.com/mediapipe-models/...
            urlPattern: /^https:\/\/storage\.googleapis\.com\/mediapipe-models\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mediapipe-model-cache',
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 日
              },
              cacheableResponse: {
                // jsDelivr / Google Storage は CORS ヘッダを返すため 200 のみ許可する。
                // opaque(0) を許可すると CORS リクエストに opaque を返してしまい
                // "an opaque response was used for a request whose type is not no-cors"
                // エラーで MediaPipe の WASM/モデル読み込みが失敗するため 0 は含めない。
                statuses: [200],
              },
            },
          },
          {
            // WASM ローダー: https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@.../wasm
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mediapipe-wasm-cache',
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 日
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
        ],
      },
      manifest: {
        name: 'SpartanType Web',
        short_name: 'SpartanType',
        description: 'Cybernetic Typing Analysis & Calibration Tool',
        theme_color: '#111116',
        background_color: '#111116',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
