/**
 * dev 専用デバイスプローブの独立エントリ (probe.html)。
 *
 * 本番アプリ (index.html / App.tsx) とはエントリごと分離してある。
 * 通常の `npm run build` では vite.config.ts がこのエントリを input に含めないため、
 * 本番バンドルにはこのページも MediaPipe プローブワーカーも一切入らない。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { DeviceProbePage } from './components/dev/DeviceProbePage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeviceProbePage />
  </StrictMode>,
)
