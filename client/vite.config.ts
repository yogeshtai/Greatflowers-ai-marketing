import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  preview: {
    port: 3006,
    host: true,
    strictPort: true,
    allowedHosts: ['marketing-admin.greatflowers.net', 'localhost']
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild'
  }
})
