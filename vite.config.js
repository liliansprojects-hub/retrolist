import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// note: the original config called a base44() plugin here for Base44's
// hosted preview/editor only (live HMR messaging, analytics, visual-edit
// agent, and legacy @/integrations + @/entities import shims). Nothing in
// this codebase uses those legacy imports, and none of that machinery
// serves any purpose on an independent Netlify deploy, so it's removed
// rather than patched — this avoids depending on a Base44-only package.
export default defineConfig({
  plugins: [
    react(),
  ]
});
