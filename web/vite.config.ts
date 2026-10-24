import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The browser only ever talks to this origin. /api is forwarded to the FastAPI backend on the same laptop,
// so the page makes zero requests to third parties (the Privacy page proves it with the egress log).
const apiProxy = {
  '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // node_modules may be a junction to another checkout; keep Vite's cache inside this project.
  cacheDir: '.vite',
  // Pre-bundle in one pass so React is never duplicated between dependency chunks.
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'lucide-react', 'clsx'],
  },
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5173, strictPort: true, host: true, proxy: apiProxy },
  preview: { port: 4173, host: true, proxy: apiProxy },
})
