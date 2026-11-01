import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works under GitHub Pages' /TaxiQ/ path (no router, single page).
  base: './',
  // Built into docs/ and committed: GitHub Pages serves the v2 branch's /docs folder.
  build: { outDir: 'docs' },
  plugins: [react(), tailwindcss()],
})
