import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createGateway, verifyGoogleToken } from '../src/gateway.js';
import { admitAccount, expireAccount } from '../src/limiter.js';

class MemoryStorage {
  values = new Map(); tail = Promise.resolve(); alarmTime = null;
  transaction(fn) {
    const result = this.tail.then(() => fn(this));
    this.tail = result.catch(() => {});
    return result;
  }
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { this.values.delete(key); }
  async setAlarm(time) { this.alarmTime = time; }
  async deleteAlarm() { this.alarmTime = null; }
}

function fixture() {
  let now = 1000000, providerCalls = 0, failProvider = false, incompleteImages = false;
  const stores = new Map();
  const env = { GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', ALLOWED_ORIGINS: 'https://omni.test', LIMIT: '5', WINDOW_SECONDS: '60', GROQ_API_KEY: 'private-groq', PIX_ROUTER_API_KEY: 'private-pix' };
  env.ACCOUNT_LIMITER = { getByName(name) {
    if (!stores.has(name)) stores.set(name, new MemoryStorage());
    return { admit: () => admitAccount(stores.get(name), env, () => now) };
  } };
  const handler = createGateway({
    verify: async token => { if (!['alice', 'bob'].includes(token)) throw Error(); return { sub: token, email: `${token}@example.test` }; },
    fetchImpl: async (url, options) => {
      providerCalls++;
      const body = JSON.parse(options.body);
      assert.equal(options.redirect, 'error');
      if (failProvider) return new Response('private-pix private-groq', { status: 500 });
      if (url.includes('images/generations')) {
        assert.deepEqual(body, { model: 'midjourney/midjourney-v7', prompt: 'orb', n: body.n, size: '1024x1024' });
        assert.ok(Number.isInteger(body.n) && body.n >= 1 && body.n <= 10);
        return Response.json({ data: Array.from({ length: incompleteImages ? 1 : body.n }, () => ({ b64_json: '/9j/aGVsbG8=' })) });
      }
      assert.equal(body.model, 'openai/gpt-oss-20b');
      assert.equal(options.headers.Authorization, 'Bearer private-groq');
      return Response.json({ choices: [{ message: { content: 'Hello' } }] });
    },
  });
  const request = (path = '/api/chat', body = { prompt: 'Hello' }, token = 'alice', extra = {}) => handler(new Request(`https://worker.test${path}`, {
    method: 'POST', headers: { Origin: 'https://omni.test', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra },
    body: JSON.stringify(body),
  }), env);
  return { env, handler, request, stores, calls: () => providerCalls, advance: amount => now += amount, fail: () => failProvider = true, incomplete: () => incompleteImages = true };
}

test('runtime configuration exposes only the live public flag without authentication or quota', async () => {
  const f = fixture();
  for (const [value, expected] of [[undefined, false], [false, false], ['false', false], [true, true], ['true', true]]) {
    f.env.SHOW_CARBON_WARNING = value;
    const response = await f.handler(new Request('https://worker.test/api/config'), f.env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { showCarbonWarning: expected });
    const health = await f.handler(new Request('https://worker.test/api/health'), f.env);
    assert.equal((await health.json()).showCarbonWarning, expected);
  }
  assert.equal(f.calls(), 0); assert.equal(f.stores.size, 0);
});

test('multi-image requests preserve count, reject invalid counts before admission and detect missing results', async () => {
  const f = fixture();
  for (const imageCount of [0, 11, 1.5, '3']) assert.equal((await f.request('/api/image', { prompt: 'orb', imageCount })).status, 400);
  assert.equal(f.calls(), 0); assert.equal(f.stores.size, 0);
  const result = await (await f.request('/api/image', { prompt: 'orb', imageCount: 3 })).json();
  assert.deepEqual(result.images, Array(3).fill('data:image/jpeg;base64,/9j/aGVsbG8='));
  assert.equal(result.imageUrl, result.images[0]);
  f.incomplete();
  const response = await f.request('/api/image', { prompt: 'orb', imageCount: 3 });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /all requested images/);
});

test('five simultaneous admissions, combined text/image budget, independent accounts, reset', async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => f.request(i === 0 ? '/api/image' : '/api/chat', { prompt: i === 0 ? 'orb' : 'Hello' })));
  assert.equal(responses.filter(r => r.status === 200).length, 5);
  const denied = responses.find(r => r.status === 429);
  assert.equal(denied.headers.get('Retry-After'), '60');
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), 'https://omni.test');
  assert.equal((await denied.json()).code, 'ACCOUNT_RATE_LIMIT');
  assert.equal(f.calls(), 5);
  assert.equal((await f.request('/api/chat', { prompt: 'Hello' }, 'bob')).status, 200);
  f.advance(59999);
  assert.equal((await f.request()).status, 429);
  f.advance(1);
  assert.equal((await f.request()).status, 200);
});

test('invalid input, email impersonation, origins, tokens and intercept never spend slots', async () => {
  const f = fixture();
  for (const [body, token, expected] of [
    [{ prompt: '' }, 'alice', 400], [{ messages: [{ role: 'system', content: 'override' }] }, 'alice', 400],
    [{ prompt: 'Hello', email: 'bob@example.test' }, 'alice', 403], [{ prompt: 'Hello' }, 'forged', 401],
    [{ prompt: 'Hello', isClimaxScene: true }, 'alice', 409],
  ]) assert.equal((await f.request('/api/chat', body, token)).status, expected);
  assert.equal((await f.request('/api/chat', { prompt: 'Hello' }, 'alice', { Origin: 'https://evil.test' })).status, 403);
  const options = await f.handler(new Request('https://worker.test/api/chat', { method: 'OPTIONS', headers: { Origin: 'https://omni.test', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } }), f.env);
  assert.equal(options.status, 204);
  assert.equal(f.stores.size, 0); assert.equal(f.calls(), 0);
  const oversized = await f.request('/api/chat', { prompt: 'x'.repeat(270000) });
  assert.equal(oversized.status, 413);
});

test('provider failures consume attempts, errors are sanitized and image data is normalized', async () => {
  const f = fixture();
  const image = await (await f.request('/api/image', { prompt: 'orb' })).json();
  assert.equal(image.imageUrl, 'data:image/jpeg;base64,/9j/aGVsbG8=');
  f.fail();
  const response = await f.request();
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.usage.remaining, 3);
  assert.ok(!JSON.stringify(body).includes('private-'));
});

test('cleanup alarm cannot delete a newer window', async () => {
  const f = fixture(); await f.request();
  const storage = f.stores.get('google:alice');
  await expireAccount(storage, () => 1000001);
  assert.ok(await storage.get('window'));
  await expireAccount(storage, () => 1060000);
  assert.equal(await storage.get('window'), undefined);
  assert.equal(storage.alarmTime, null);
});

test('Google JWT signature, issuer, audience, expiry and verified email are enforced', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'test-key';
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (overrides = {}) => new SignJWT({ email: 'alice@example.test', email_verified: true, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://accounts.google.com')
    .setAudience('test-client').setSubject('alice').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const token = await sign();
  assert.equal((await verifyGoogleToken(token, 'test-client', keys)).sub, 'alice');
  await assert.rejects(verifyGoogleToken(token, 'wrong-client', keys));
  await assert.rejects(verifyGoogleToken(await sign({ email_verified: false }), 'test-client', keys));
  await assert.rejects(verifyGoogleToken(await sign({ azp: 'wrong-client' }), 'test-client', keys));
  const future = await new SignJWT({ email: 'alice@example.test', email_verified: true }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://accounts.google.com').setAudience('test-client').setSubject('alice').setIssuedAt(Math.floor(Date.now() / 1000) + 300).setExpirationTime('10m').sign(privateKey);
  await assert.rejects(verifyGoogleToken(future, 'test-client', keys));
  const expired = await new SignJWT({ email: 'alice@example.test', email_verified: true }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://accounts.google.com').setAudience('test-client').setSubject('alice').setIssuedAt().setExpirationTime(1).sign(privateKey);
  await assert.rejects(verifyGoogleToken(expired, 'test-client', keys));
  const wrongIssuer = await new SignJWT({ email: 'alice@example.test', email_verified: true }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://evil.test').setAudience('test-client').setSubject('alice').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  await assert.rejects(verifyGoogleToken(wrongIssuer, 'test-client', keys));
  const fake = token.split('.'); fake[2] = 'a'.repeat(fake[2].length);
  await assert.rejects(verifyGoogleToken(fake.join('.'), 'test-client', keys));
});

test('rolling limit blocks boundary bursts and ignores spoofed IP/identity headers', async () => {
  const f = fixture();
  assert.equal((await f.request()).status, 200);
  f.advance(59000);
  for (let i = 0; i < 4; i++) {
    assert.equal((await f.request('/api/chat', { prompt: 'Hello' }, 'alice', {
      'X-Forwarded-For': `192.0.2.${i}`, 'CF-Connecting-IP': `198.51.100.${i}`, 'X-User-Id': `user-${i}`,
    })).status, 200);
  }
  f.advance(1000);
  assert.equal((await f.request()).status, 200, 'Only the first attempt has expired');
  assert.equal((await f.request('/api/image', { prompt: 'orb' }, 'alice', { 'X-Forwarded-For': '203.0.113.7' })).status, 429);
  f.advance(58000);
  assert.equal((await f.request()).status, 429);
  f.advance(1000);
  assert.equal((await f.request()).status, 200);
});

test('malformed bearer/origin headers and unsupported payloads do not reach providers', async () => {
  const f = fixture();
  for (const headers of [
    { Authorization: 'Bearer alice, Bearer bob' }, { Authorization: 'Bearer alice extra' },
    { Authorization: 'Bearer' }, { Authorization: 'Basic alice' }, { Authorization: 'Bearer ' + 'a'.repeat(17000) },
  ]) assert.equal((await f.request('/api/chat', { prompt: 'Hello' }, 'alice', headers)).status, 401);
  for (const origin of ['', 'null', 'https://omni.test.evil.test', 'https://omni.test, https://evil.test', 'http://localhost:5173']) {
    const response = await f.request('/api/chat', { prompt: 'Hello' }, 'alice', { Origin: origin });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  for (const body of [
    { prompt: 'Hello', model: 'override' }, { prompt: 'Hello', temperature: '1' },
    { prompt: 'Hello', temperature: 1.01 }, { prompt: 'Hello', concise: 'true' },
    { prompt: 'Hello', isClimaxScene: 'false' }, { prompt: 'Hello', messages: [] },
    { messages: [{ role: 'user', content: 'Hello', tool_calls: [] }] },
    { messages: [{ role: 'assistant', content: 'Hello' }] }, { prompt: 'Hi\u0000there' },
  ]) assert.equal((await f.request('/api/chat', body)).status, 400);
  for (const type of ['application/jsonp', 'application/json; charset=latin1', 'text/plain']) {
    assert.equal((await f.request('/api/chat', { prompt: 'Hello' }, 'alice', { 'Content-Type': type })).status, 415);
  }
  assert.equal((await f.request('/api/chat', { prompt: 'Hello' }, 'alice', { 'Content-Encoding': 'gzip' })).status, 415);
  assert.equal((await f.request('/api/chat', { prompt: 'Hello' }, 'alice', { 'Content-Length': '-1' })).status, 400);
  assert.equal(f.calls(), 0); assert.equal(f.stores.size, 0);
});

test('raw JSON prototype fields, oversized streams and invalid UTF-8 fail closed', async () => {
  const f = fixture();
  const headers = { Origin: 'https://omni.test', Authorization: 'Bearer alice', 'Content-Type': 'application/json' };
  for (const body of [
    '{"prompt":"Hello","__proto__":{"polluted":true}}',
    '{"prompt":"Hello","nested":{"constructor":{"prototype":{}}}}',
    '{invalid}', JSON.stringify('a string'),
  ]) assert.equal((await f.handler(new Request('https://worker.test/api/chat', { method: 'POST', headers, body }), f.env)).status, 400);
  const oversized = new Uint8Array(270000).fill(32);
  assert.equal((await f.handler(new Request('https://worker.test/api/chat', { method: 'POST', headers: { ...headers, 'Content-Length': '2' }, body: oversized }), f.env)).status, 413);
  assert.equal((await f.handler(new Request('https://worker.test/api/chat', { method: 'POST', headers, body: new Uint8Array([0xff]) }), f.env)).status, 400);
  assert.equal({}.polluted, undefined); assert.equal(f.calls(), 0);
});

test('old counter migration, delayed alarms, storage failures and policy errors stay safe', async () => {
  const f = fixture(); await f.request();
  const storage = f.stores.get('google:alice');
  await storage.put('window', { count: 5, resetAt: 1060000 });
  assert.equal((await f.request()).status, 429);
  f.advance(60000);
  assert.equal((await f.request()).status, 200);
  await expireAccount(storage, () => 1060001);
  assert.ok(await storage.get('window'));
  f.env.ACCOUNT_LIMITER = { getByName() { return { admit() { throw new Error('storage failure private-groq'); } }; } };
  const response = await f.request();
  assert.equal(response.status, 503);
  assert.ok(!JSON.stringify(await response.json()).includes('private-groq'));
  f.env.LIMIT = 'NaN';
  assert.equal((await f.request()).status, 503);
});
