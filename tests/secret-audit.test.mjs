import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditGit, credentialLabels } from '../scripts/secret-detection.mjs';

test('secret audit catches ignored tracked files, staged-only secrets and deleted history', async () => {
  await mkdir(resolve('test-results'), { recursive: true });
  const directory = await mkdtemp(resolve('test-results/secret-audit-'));
  const known = [{ name: 'TEST_API_KEY', value: 'synthetic-private-value-for-regression' }];
  const git = args => {
    const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, 'Fixture Git operation must succeed');
  };
  try {
    git(['init', '--quiet']);
    await writeFile(resolve(directory, '.gitignore'), '.env.local\n');
    await writeFile(resolve(directory, '.env.local'), known[0].value);
    git(['add', '--force', '.env.local']);
    await writeFile(resolve(directory, '.env.local'), 'sanitized working copy');
    const staged = auditGit(directory, known);
    assert.ok(staged.tracked.has('.env.local'));
    assert.deepEqual(staged.findings, [{ path: '.env.local', labels: ['TEST_API_KEY'], source: 'Git index/history' }]);
    assert.ok(!JSON.stringify(staged.findings).includes(known[0].value));
    git(['-c', 'user.name=Audit fixture', '-c', 'user.email=audit@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'Fixture secret']);
    git(['rm', '--force', '.env.local']);
    git(['-c', 'user.name=Audit fixture', '-c', 'user.email=audit@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'Fixture removal']);
    const history = auditGit(directory, known);
    assert.equal(history.tracked.has('.env.local'), false);
    assert.equal(history.findings.length, 1, 'Deleting a secret must not hide historical exposure');
  } finally {
    assert.ok(directory.startsWith(resolve('test-results') + (process.platform === 'win32' ? '\\' : '/')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser artifact scanning permits public OAuth configuration and detects provider secrets', () => {
  const key = { name: 'TEST_API_KEY', value: 'synthetic-private-value-for-regression' };
  const publicId = `${'123456789'}-${'publicclient'}.apps.googleusercontent.com`;
  assert.deepEqual(credentialLabels(publicId, [], { includePublicOAuth: false }), []);
  assert.deepEqual(credentialLabels(publicId + key.value, [key], { includePublicOAuth: false }), ['TEST_API_KEY']);
});
