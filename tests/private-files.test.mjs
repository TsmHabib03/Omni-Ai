import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

test('Vite refuses credential files through normal, raw and filesystem URLs', async () => {
  await mkdir(resolve('test-results'), { recursive: true });
  const directory = await mkdtemp(resolve('test-results/private-files-'));
  const sentinel = 'private-file-regression-sentinel';
  const files = ['.env.local', '.dev.vars', '.dev.vars.preview', 'credentials-demo.json', 'server.key', 'server.pem', 'private.local', 'old.backup', '.wrangler/deploy-secrets/oauth.json', '.git/config'];
  let server;
  try {
    for (const file of files) {
      const target = resolve(directory, file);
      await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(target, sentinel);
    }
    server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'silent' });
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (const file of files) {
      const path = relative(process.cwd(), resolve(directory, file)).replaceAll('\\', '/');
      for (const url of [`/${path}`, `/${path}?raw`, `/@fs/${resolve(directory, file).replaceAll('\\', '/')}`]) {
        const response = await fetch(base + url);
        assert.equal(response.status, 403, `Private file must be blocked: ${file}`);
        assert.ok(!(await response.text()).includes(sentinel), 'Private file contents must never be served');
      }
    }
    assert.equal((await fetch(base + '/')).status, 200, 'Application entry remains accessible');
  } finally {
    await server?.close();
    assert.ok(directory.startsWith(resolve('test-results') + (process.platform === 'win32' ? '\\' : '/')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('Vite rejects provider keys accidentally put in public environment variables', async () => {
  const name = 'VITE_GROQ_API_KEY';
  const original = process.env[name];
  process.env[name] = 'synthetic-public-provider-key';
  try {
    await assert.rejects(createServer({ logLevel: 'silent' }), error =>
      error.message.includes(name) && !error.message.includes(process.env[name]));
  } finally {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});
