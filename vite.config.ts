import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is injected at build time by the GitHub Pages workflow (e.g. "/reponame/").
// Falls back to "/" for local dev and previews.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  plugins: [react()],
})
