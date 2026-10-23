import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The console as a single-page app (R-96). In development the dashboard (FastAPI, port 8765)
// serves the JSON API; Vite proxies `/api` to it so the app and the API share one origin.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8765' },
  },
  build: { outDir: 'dist', sourcemap: true },
});
