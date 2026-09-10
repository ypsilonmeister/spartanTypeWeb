import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { VitePWA } from 'vite-plugin-pwa'

// 計測 (profile) ビルドかどうか。`npm run build:profile` (= vite build --mode profile)。
// mode で判定するのはシェル非依存にするため (bash の `VAR=1 cmd` は PowerShell で動かない)。
// 併せて .env.profile が VITE_ANALYSIS_PROFILE=1 を供給し、解析の計測コードが有効になる。
const isProfileBuild = (mode: string) => mode === 'profile'
  || process.env.VITE_ANALYSIS_PROFILE === '1'
  || process.env.VITE_ANALYSIS_PROFILE === 'true';

// デバイスプローブ (probe.html) は常に独立エントリとしてビルドする。
// 本体 (index.html) とは別ページなので、開かない限り読み込まれない。
// ただし PWA の precache には入れない (MediaPipe を含むプローブワーカー ~137KB を
// 全ユーザーに先読みさせない) ので、下の workbox 設定で除外している。
//
// dev サーバは root の HTML を常に配信するので `/probe.html` は素で開けるが、
// 現状 dev はクラシックワーカーをバンドルしないため実測は preview で行うこと
// (docs/analysis-profiling.md 参照)。
// base is injected at build time by the GitHub Pages workflow (e.g. "/reponame/").
// Falls back to "/" for local dev and previews.
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const input: Record<string, string> = { index: 'index.html', probe: 'probe.html' };

  return {
    base: process.env.GITHUB_PAGES_BASE ?? '/',
    build: {
      rollupOptions: { input },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        // 計測ビルドでは Service Worker を「自己破壊型」にする: 起動時に自分を unregister して
        // precache を消す。再ビルド/再デプロイ後も古い版が配信され続ける事故を防ぐ。
        // 通常ビルドでは false なので本番の PWA 挙動は変わらない。
        selfDestroying: isProfileBuild(mode),
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        workbox: {
          // probe.html とその資産 (プローブページ本体・MediaPipe を含むプローブワーカー) は
          // 開いたときだけ取りに行けばよいので precache しない。
          globIgnores: ['probe.html', 'assets/probe-*', 'assets/deviceProbe.worker-*'],
          // precache に無い URL への遷移は既定で index.html (アプリシェル) に差し替えられる。
          // probe.html は別ページなので対象から外す。
          navigateFallbackDenylist: [/\/probe\.html$/],
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
  };
})
