import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { credentialLabels, auditGit } from './secret-detection.mjs';

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
const envFiles = [...readdirSync(root).filter(name => /^\.env(?:\.|$)/.test(name) && name !== '.env.oauth.local'), ...readdirSync(resolve(root, 'omni-rate-limit')).filter(name => /^\.dev.vars(?:\.|$)/.test(name)).map(name => `omni-rate-limit/${name}`)];
for (const vars of [process.env, ...envFiles.map(file => parseEnv(readFileSync(resolve(root, file), 'utf8')))]) {
  for (const [name, value] of Object.entries(vars)) {
    if (/(?:API_KEY|TOKEN|SECRET|PASSWORD)$/.test(name) && value?.length >= 16 && !known.some(entry => entry.name === name && entry.value === value)) known.push({ name, value });
  }
}
// Use only project-local Git metadata; never scan an unrelated parent repo.
const repository = existsSync(resolve(root, '.git')) ? auditGit(root, known) : { tracked: new Set(), findings: [], scannedBlobs: 0 };

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
  const artifact = path.startsWith('dist/') || path === 'browser-extension/content.js';
  const labels = credentialLabels(content, known, { includePublicOAuth: !artifact });
  if (labels.length) findings.push({ path, labels, ignored: ignored.has(path), tracked: repository.tracked.has(path), browserArtifact: artifact });
}

for (const path of required) assert.ok(ignored.has(path), `${path} must be ignored`);
const leaks = findings.filter(finding => !finding.ignored || finding.tracked || finding.browserArtifact);
const report = { scannedTextFiles: scanned, sourceControlCandidates: candidates, scannedGitBlobs: repository.scannedBlobs, exactCredentialValuesChecked: known.length, findings, gitFindings: repository.findings, sourceControlLeaks: leaks.filter(finding => !finding.browserArtifact || !finding.ignored).length + repository.findings.length, browserArtifactLeaks: leaks.filter(finding => finding.browserArtifact).length, unreadableIgnoredFiles, dependencyDirectoriesExcluded: true };
writeFileSync(resolve(root, 'test-results/security-scan.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (leaks.length || repository.findings.length) process.exitCode = 1;
