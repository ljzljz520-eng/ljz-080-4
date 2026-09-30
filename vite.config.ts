import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 生产构建由 Express 托管；开发期 /api 代理到后端 4000
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/health': { target: 'http://localhost:4000', changeOrigin: true }
    }
  },
  build: { outDir: 'dist' }
})
