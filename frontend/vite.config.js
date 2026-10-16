import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), 'VITE_SERVER_URL').VITE_SERVER_URL || 'http://127.0.0.1:5000'
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target },
        '/socket.io': { target, ws: true },
      },
    },
  }
})
