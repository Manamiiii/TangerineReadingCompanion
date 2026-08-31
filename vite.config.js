import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { offlineBundlePlugin } from './scripts/build-offline.mjs'

// https://vite.dev/config/
// base: './' keeps built asset URLs relative so the same dist/ output works
// whether the app is served from a domain root (Cloudflare Pages) or a
// project sub-path (GitHub Pages, e.g. https://user.github.io/repo/).
export default defineConfig({
  base: './',
  plugins: [react(), offlineBundlePlugin()],
  server: {
    port: 5174,
    strictPort: true,
  },
})
