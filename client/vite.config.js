import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
      // In-app calling's WebSocket signaling channel (server/src/realtime/call-signaling.js).
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
