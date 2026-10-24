import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** The two fonts every page uses (designer T-14, FE-V45): preloaded, so their swap moves nothing. */
const FIRST_FONTS = /(Archivo-Variable|IBMPlexMono-Regular)-[\w-]+\.woff2$/;

/** Preload links for the built fonts (their names are hashed, so the HTML gets them at build time). */
function preloadFonts(): Plugin {
  return {
    name: 'mudpuppy-preload-fonts',
    apply: 'build',
    transformIndexHtml(_html, ctx) {
      const files = Object.keys(ctx.bundle ?? {}).filter((f) => FIRST_FONTS.test(f));
      return files.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `/app/${f}` }, injectTo: 'head' }));
    },
  };
}

// The console as a single-page app (R-96). In development the dashboard (FastAPI, port 8765)
// serves the JSON API; Vite proxies `/api` to it so the app and the API share one origin.
export default defineConfig({
  plugins: [react(), preloadFonts()],
  base: '/app/',
  server: {
    port: 5173,
    strictPort: true,
    // `/evidence`: recorded screenshots and wireframes the pages show; `/chat`: the assistant's
    // relay to the chat service.
    proxy: {
      // `ws`: the live Workbench's WebSocket (spec 075) goes through the same proxy
      '/api': { target: 'http://127.0.0.1:8765', ws: true },
      '/evidence': 'http://127.0.0.1:8765',
      '/chat': 'http://127.0.0.1:8765',
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
