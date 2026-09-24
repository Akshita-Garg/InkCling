import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Each Electron renderer has its own Vite server and dependency graph.
  // Sharing the optimizer cache can strand the other window on stale chunks.
  cacheDir: 'node_modules/.vite/main-window',
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
