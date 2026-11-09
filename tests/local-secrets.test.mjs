import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { userInfo } from 'node:os';

test('local secret provisioning restricts permissions before writing and refuses overwrite', async () => {
  const root = resolve('test-results');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, 'local-secrets-'));
  const script = resolve(directory, 'worker/scripts/sync-secrets.mjs');
  const target = resolve(directory, 'worker/.dev.vars');
  const env = { ...process.env, GROQ_API_KEY: 'synthetic-groq-value', PIX_ROUTER_API_KEY: 'synthetic-pix-value' };
  try {
    await mkdir(resolve(script, '..'), { recursive: true });
    await copyFile('omni-rate-limit/scripts/sync-secrets.mjs', script);
    await writeFile(resolve(directory, '.env.local'), '');
    const create = spawnSync(process.execPath, [script, '--local'], { env, encoding: 'utf8' });
    assert.equal(create.status, 0, 'Synthetic local secrets should be provisioned');
    assert.ok(!create.stdout.includes(env.GROQ_API_KEY));
    assert.ok((await readFile(target, 'utf8')).includes(env.GROQ_API_KEY));
    if (process.platform === 'win32') {
      const quote = value => `'${value.replaceAll("'", "''")}'`;
      const code = `$acl = Get-Acl -LiteralPath ${quote(target)}; [bool]($acl.AreAccessRulesProtected -and $acl.Access.Count -eq 1 -and $acl.Access[0].IdentityReference.Value.EndsWith(${quote('\\' + userInfo().username)}))`;
      const permissions = spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], {
        encoding: 'utf8',
      });
      assert.equal(permissions.status, 0);
      assert.equal(permissions.stdout.trim(), 'True', 'Only the current Windows user should have access');
    } else assert.equal((await stat(target)).mode & 0o777, 0o600);
    const original = await readFile(target, 'utf8');
    const overwrite = spawnSync(process.execPath, [script, '--local'], { env, encoding: 'utf8' });
    assert.notEqual(overwrite.status, 0, 'Existing secrets must not be overwritten');
    assert.equal(await readFile(target, 'utf8'), original);
  } finally {
    assert.ok(directory.startsWith(root + (process.platform === 'win32' ? '\\' : '/')));
    await rm(directory, { recursive: true, force: true });
  }
});
