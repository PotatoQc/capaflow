import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    // Cache hors ligne de la page (PLAN §3) : page web sans installation, donc aucun manifeste.
    VitePWA({
      registerType: 'autoUpdate', injectRegister: 'script', manifest: false,
      // La nouvelle version prend le contrôle tout de suite (sinon elle attend la fermeture de tous les onglets).
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,png}'], skipWaiting: true, clientsClaim: true },
    }),
  ],
});
