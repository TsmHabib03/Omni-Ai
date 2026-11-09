import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { userInfo } from 'node:os';
import { parseEnv } from 'node:util';
import { oauthClientId } from './oauth-config.mjs';

const workerRoot = fileURLToPath(new URL('../', import.meta.url));
const appRoot = resolve(workerRoot, '..');
const clientId = oauthClientId();
const secrets = { GOOGLE_CLIENT_ID: clientId };
// Opt in when provisioning a renamed/new Worker; ordinary releases preserve
// its existing provider secrets without replacing them from local files.
if (process.argv.includes('--sync-provider-secrets')) {
  const envFile = resolve(appRoot, '.env.local');
  const local = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  for (const name of ['GROQ_API_KEY', 'PIX_ROUTER_API_KEY']) {
    const value = process.env[name] || local[name];
    if (!value) throw new Error(`Set ${name} privately before provisioning the Worker.`);
    secrets[name] = value;
  }
}
const wrangler = resolve(workerRoot, 'node_modules/wrangler/bin/wrangler.js');
const workerConfig = resolve(workerRoot, 'wrangler.toml');
if (!existsSync(wrangler)) throw new Error('Install Worker dependencies first: npm ci --prefix omni-rate-limit (from the repository root).');
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
  // Always select the authenticated Worker, including in root-based CI builds.
  // Without a config, Wrangler tries to auto-configure the frontend Vite app.
  const args = [wrangler, 'deploy', '--config', workerConfig];
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
    secretsFile = resolve(privateDir, 'secrets.json');
    writeFileSync(secretsFile, JSON.stringify(secrets), { mode: 0o600, flag: 'wx' });
    args.push('--secrets-file', secretsFile);
    console.log(process.argv.includes('--sync-provider-secrets')
      ? 'Publishing the app, Worker, OAuth Secret, and both provider secrets together.'
      : 'Publishing the app, Worker, and OAuth Secret together. Existing provider secrets are preserved.');
  }
  const deploy = spawnSync(process.execPath, args, { cwd: workerRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  // Keep private input out of terminal output, even on Wrangler errors.
  const redact = value => Object.values(secrets).reduce((output, secret) => output.split(secret).join('[configuration value withheld]'), value || '');
  if (deploy.stdout) process.stdout.write(redact(deploy.stdout));
  if (deploy.stderr) process.stderr.write(redact(deploy.stderr));
  if (deploy.error) throw new Error('Wrangler could not start.');
  status = deploy.status ?? 1;
} finally {
  if (secretsFile) rmSync(secretsFile, { force: true });
  if (privateDir) rmdirSync(privateDir);
}
process.exit(status);
