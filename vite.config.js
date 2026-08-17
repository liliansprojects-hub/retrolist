import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
// note: the original config called a base44() plugin here for Base44's
// hosted preview/editor only (live HMR messaging, analytics, visual-edit
// agent, and legacy @/integrations + @/entities import shims). Nothing in
// this codebase uses those legacy imports, and none of that machinery
// serves any purpose on an independent Netlify deploy, so it's removed
// rather than patched — this avoids depending on a Base44-only package.
// That plugin was also quietly providing the "@" -> "src/" path alias
// (jsconfig.json's "paths" entry is IDE-only, Vite/Rollup need their own
// resolve.alias), so it's added back explicitly below.
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
