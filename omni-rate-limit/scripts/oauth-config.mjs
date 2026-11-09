import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function oauthClientId(env = process.env) {
  if (env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID) return validateClientId(env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID);
  const appRoot = fileURLToPath(new URL('../../', import.meta.url));
  const local = {};
  for (const name of ['.env.local', '.env.oauth.local']) {
    const file = resolve(appRoot, name);
    if (existsSync(file)) Object.assign(local, parseEnv(readFileSync(file, 'utf8')));
    if (local.GOOGLE_CLIENT_ID || local.VITE_GOOGLE_CLIENT_ID) return validateClientId(local.GOOGLE_CLIENT_ID || local.VITE_GOOGLE_CLIENT_ID);
  }
  const clientId = env.GOOGLE_CLIENT_ID || local.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || local.VITE_GOOGLE_CLIENT_ID || '';
  return validateClientId(clientId);
}

function validateClientId(clientId) {
  if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Set GOOGLE_CLIENT_ID privately in .env.local or the process environment before deployment.');
  return clientId;
}
