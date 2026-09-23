import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    // Cache hors ligne de la page (PLAN §3) : page web sans installation, donc aucun manifeste.
    VitePWA({ registerType: 'autoUpdate', injectRegister: 'script', manifest: false }),
  ],
});
