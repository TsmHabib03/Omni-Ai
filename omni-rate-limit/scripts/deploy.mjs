import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { userInfo } from 'node:os';
import { oauthClientId } from './oauth-config.mjs';

const workerRoot = fileURLToPath(new URL('../', import.meta.url));
const appRoot = resolve(workerRoot, '..');
const clientId = oauthClientId();
const wrangler = resolve(workerRoot, 'node_modules/wrangler/bin/wrangler.js');
const build = spawnSync(process.execPath, [resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: appRoot, stdio: 'inherit', env: { ...process.env, VITE_REQUIRE_AUTH: 'true', VITE_GOOGLE_CLIENT_ID: clientId, VITE_API_BASE_URL: '' },
});
if (build.status !== 0) process.exit(build.status || 1);
// The deployment helper invokes Vite directly, so run the artifact/index/history
// secret check explicitly before uploading any browser assets.
const scan = spawnSync(process.execPath, [resolve(appRoot, 'scripts/security-scan.mjs')], { cwd: appRoot, stdio: 'inherit' });
if (scan.status !== 0) process.exit(scan.status || 1);
// Publish OAuth configuration with the same Worker version. A separate secret
// put cannot replace the plain-text binding from older deployments.
// --secrets-file preserves omitted provider secrets and replaces this binding.
const dryRun = process.argv.includes('--dry-run');
let privateDir, secretsFile;
let status = 1;
try {
  const args = [wrangler, 'deploy'];
  if (dryRun) args.push('--dry-run');
  else {
    const stateDir = resolve(workerRoot, '.wrangler');
    mkdirSync(stateDir, { recursive: true });
    privateDir = mkdtempSync(resolve(stateDir, 'deploy-secrets-'));
    if (process.platform === 'win32') {
      // Restrict inheritance before writing private configuration. POSIX mode
      // alone does not protect files on Windows.
      const acl = spawnSync('icacls.exe', [privateDir, '/inheritance:r', '/grant:r', `${userInfo().username}:(OI)(CI)F`], { stdio: 'pipe' });
      if (acl.error || acl.status !== 0) throw new Error('Could not restrict deployment configuration permissions.');
    }
    secretsFile = resolve(privateDir, 'oauth.json');
    writeFileSync(secretsFile, JSON.stringify({ GOOGLE_CLIENT_ID: clientId }), { mode: 0o600, flag: 'wx' });
    args.push('--secrets-file', secretsFile);
    console.log('Publishing the app, Worker, and OAuth Secret together. Existing provider secrets are preserved.');
  }
  const deploy = spawnSync(process.execPath, args, { cwd: workerRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  // Keep the actual client ID out of terminal output, even on Wrangler errors.
  const redact = value => (value || '').split(clientId).join('[OAuth client ID withheld]');
  if (deploy.stdout) process.stdout.write(redact(deploy.stdout));
  if (deploy.stderr) process.stderr.write(redact(deploy.stderr));
  if (deploy.error) throw new Error('Wrangler could not start.');
  status = deploy.status ?? 1;
} finally {
  if (secretsFile) rmSync(secretsFile, { force: true });
  if (privateDir) rmdirSync(privateDir);
}
process.exit(status);
