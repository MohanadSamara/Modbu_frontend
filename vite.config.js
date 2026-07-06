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
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
