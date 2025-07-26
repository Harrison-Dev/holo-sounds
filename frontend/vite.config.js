import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API requests to the backend server
      '/api': {
        target: 'http://localhost:8080', // Your backend server address
        changeOrigin: true,
        // The rewrite is not needed if your backend endpoints already have /api prefix
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})