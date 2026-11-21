import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `/api` is forwarded to the Python backend (backend/, port 8000). Going through
// Vite means a phone on HTTPS reaches the backend without mixed-content errors.
//
// Having a proxy also makes Vite serve HTTPS with node:https (HTTP/1.1) rather
// than node:http2, whose compat server crashes on Node 22.21 with
// "shouldUpgradeCallback is not a function".
const BACKEND = process.env.DIGIHER_BACKEND ?? 'http://127.0.0.1:8000'

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  // three.js + the XR runtime make a large main chunk; the emulator rooms load lazily.
  build: { chunkSizeWarningLimit: 2500 },
}))
