import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to every network interface so other devices on the same Wi-Fi/LAN
    // can reach the dev server at http://<your-local-ip>:5173
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        // The browser only ever talks to Vite (same origin), and Vite forwards
        // /api to the backend here on your machine — so you only expose 5173.
        target: 'http://localhost:5400',
        changeOrigin: true,
        secure: false,
      },
      // Live telemetry WebSocket (/ws/telemetry). ws:true tells Vite to proxy
      // the HTTP Upgrade handshake through to the backend, so the browser can
      // open a same-origin socket at ws://localhost:5173/ws/telemetry.
      '/ws': {
        target: 'http://localhost:5400',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET') return;
            console.error('[ws proxy]', err.message);
          });
        },
      },
    }
  }
})
