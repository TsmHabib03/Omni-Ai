import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function responsiveEntry() {
  let outputDir;
  return {
    name: 'omni-responsive-entry',
    configResolved(config) { outputDir = resolve(config.root, config.build.outDir); },
    // Dev uses the canonical entry, with the requested URL preserved.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/app-responsive.html') req.url = req.url.replace('/app-responsive.html', '/index.html');
        next();
      });
    },
    // Run after the single-file bundle is written to avoid duplicating source.
    async closeBundle() { await copyFile(resolve(outputDir, 'index.html'), resolve(outputDir, 'app-responsive.html')); },
  };
}

export default defineConfig(({ mode }) => {
  const local = loadEnv(mode, process.cwd(), 'GOOGLE_CLIENT_ID');
  // Expose only the public OAuth audience. Provider credentials stay server-side.
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || local.GOOGLE_CLIENT_ID || '';
  return {
  define: { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(clientId) },
  plugins: [tailwindcss(), viteSingleFile(), responsiveEntry()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT || 8787}`, changeOrigin: false, xfwd: true } } },
  preview: { proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT || 8787}`, changeOrigin: false, xfwd: true } } },
  build: { target: 'es2020', cssCodeSplit: false },
}; });
