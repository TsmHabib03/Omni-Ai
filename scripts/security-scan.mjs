import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
// Use isolated Git metadata to test Git's actual ignore rules without creating
// a repository, index, commit, or remote in the project itself.
const auditDir = resolve(root, 'test-results/security-ignore');
mkdirSync(auditDir, { recursive: true });
const gitDir = resolve(auditDir, '.git');
const git = args => spawnSync('git', ['--git-dir', gitDir, '--work-tree', root, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: root } });
const init = git(['init', '--quiet']);
assert.equal(init.status, 0, 'Temporary ignore-check Git metadata must initialize');

const known = [];
for (const file of ['.env.local', 'omni-rate-limit/.dev.vars']) {
  if (!existsSync(resolve(root, file))) continue;
  const vars = parseEnv(readFileSync(resolve(root, file), 'utf8'));
  for (const [name, value] of Object.entries(vars)) {
    if (/(?:API_KEY|TOKEN|SECRET|PASSWORD)$/.test(name) && value.length >= 16) known.push({ name, value });
  }
}

const skip = new Set(['node_modules', '.git']);
const binary = /\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf|eot|wasm|exe|dll|sqlite|db|zip|gz)$/i;
const findings = [];
const paths = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(path); }
    else paths.push(relative(root, path).replaceAll('\\', '/'));
  }
}
walk(root);
const required = ['.env.local', '.env.oauth.local', 'omni-rate-limit/.dev.vars', 'dist/index.html'];
const ignoredResult = spawnSync('git', ['--git-dir', gitDir, '--work-tree', root, 'check-ignore', '--no-index', '--stdin'], {
  cwd: root, encoding: 'utf8', input: [...new Set([...paths, ...required])].join('\n') + '\n',
});
assert.ok([0, 1].includes(ignoredResult.status), 'Git ignore check must complete');
const ignored = new Set(ignoredResult.stdout.trim().split(/\r?\n/));

let scanned = 0, candidates = 0;
const unreadableIgnoredFiles = [];
for (const path of paths) {
  if (!ignored.has(path)) candidates++;
  if (binary.test(path)) continue;
  // The old OAuth-only file can have a sandbox-account ACL. It contains only a
  // public identifier and is ignored; the deploy script uses .env.local now.
  let content;
  try { content = readFileSync(resolve(root, path), 'utf8'); }
  catch (error) {
    if (path === '.env.oauth.local' && ignored.has(path) && ['EPERM', 'EACCES'].includes(error.code)) { unreadableIgnoredFiles.push(path); continue; }
    throw error;
  }
  scanned++;
  const labels = new Set();
  for (const credential of known) if (content.includes(credential.value)) labels.add(credential.name);
  if (/\b(?:gsk_[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AIza[\w-]{30,}|gh[pousr]_[\w]{30,}|github_pat_[\w]{30,}|AKIA[0-9A-Z]{16})\b/.test(content)) labels.add('credential pattern');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) labels.add('private key');
  if (/\b\d+-[a-z0-9]+\.apps\.googleusercontent\.com\b/.test(content)) labels.add('public OAuth client ID');
  if (labels.size) findings.push({ path, labels: [...labels], ignored: ignored.has(path) });
}

for (const path of required) assert.ok(ignored.has(path), `${path} must be ignored`);
const leaks = findings.filter(finding => !finding.ignored);
const report = { scannedTextFiles: scanned, sourceControlCandidates: candidates, exactCredentialValuesChecked: known.length, findings, sourceControlLeaks: leaks.length, unreadableIgnoredFiles, dependencyDirectoriesExcluded: true };
writeFileSync(resolve(root, 'test-results/security-scan.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (leaks.length) process.exitCode = 1;
