import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createApiHandler } from './api.mjs';
import { randomBytes } from 'node:crypto';
import { securityHeaders, documentCsp } from './security-headers.mjs';
import { publicFeatureFlags } from './feature-flags.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(projectRoot, '.env.local');
if (existsSync(envFile)) loadEnvFile(envFile);

export function startServer({ port = Number(process.env.API_PORT || 8787), host = process.env.HOST || '127.0.0.1' } = {}) {
  const api = createApiHandler({ env: { ...process.env, HOST: host } });
  const server = createServer(async (req, res) => {
    if (await api(req, res)) return;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { ...securityHeaders(), Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }); res.end(); return; }
    try {
      // The frontend is a single built file. Never serve env files or project sources.
      const nonce = randomBytes(18).toString('base64');
      const html = (await readFile(resolve(projectRoot, 'dist/index.html'), 'utf8')).replace('<head>', `<head><meta name="csp-nonce" content="${nonce}"><meta name="omni-carbon-warning" content="${publicFeatureFlags(process.env).showCarbonWarning}">`).replace(/<(script|style)(\s|>)/gi, `<$1 nonce="${nonce}"$2`);
      res.writeHead(200, { ...securityHeaders(), 'Content-Security-Policy': documentCsp(nonce, { https: false }), 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : html);
    } catch { res.writeHead(503, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('Build the frontend first with npm run build.'); }
  });
  server.requestTimeout = 150000;
  server.listen(port, host, () => console.log(`Omni.AI backend: http://${host}:${server.address().port}`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) startServer();
