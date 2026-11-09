import { existsSync, openSync, writeFileSync, closeSync, unlinkSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userInfo } from 'node:os';

const workerRoot = fileURLToPath(new URL('../', import.meta.url));
const file = resolve(workerRoot, '../.env.local');
if (existsSync(file)) loadEnvFile(file);
const keys = { GROQ_API_KEY: process.env.GROQ_API_KEY, PIX_ROUTER_API_KEY: process.env.PIX_ROUTER_API_KEY };
if (!keys.GROQ_API_KEY || !keys.PIX_ROUTER_API_KEY) throw new Error('Add both server-only provider keys to the app .env.local first.');
if (process.argv.includes('--local')) {
  const target = resolve(workerRoot, '.dev.vars');
  if (existsSync(target)) throw new Error('.dev.vars already exists. Update it privately rather than overwrite it.');
  // Create an empty exclusive file, restrict its ACL, then write through the
  // original descriptor. POSIX mode alone does not protect Windows secrets.
  const descriptor = openSync(target, 'wx', 0o600);
  let secured = false;
  try {
    if (process.platform === 'win32') {
      const acl = spawnSync('icacls.exe', [target, '/inheritance:r', '/grant:r', `${userInfo().username}:F`], { stdio: 'pipe' });
      if (acl.error || acl.status !== 0) throw new Error('Could not restrict local Worker secret permissions.');
    }
    writeFileSync(descriptor, Object.entries(keys).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n') + '\n');
    secured = true;
  } finally {
    closeSync(descriptor);
    if (!secured) unlinkSync(target);
  }
  console.log('Created ignored local Worker secrets without displaying their values.');
} else {
  const result = spawnSync(process.execPath, [resolve(workerRoot, 'node_modules/wrangler/bin/wrangler.js'), 'secret', 'bulk'], {
    cwd: workerRoot, input: JSON.stringify(keys), stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Wrangler output is intentionally withheld because it handles private input.
  if (result.error || result.status !== 0) throw new Error('Secret upload failed. Use Wrangler secret put privately to finish setup.');
  console.log('Uploaded both provider secrets to Cloudflare. Values were never printed.');
}
