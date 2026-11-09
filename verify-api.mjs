import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApiHandler } from './api.mjs';

// All provider traffic is injected. These checks never spend real API credits.
const env = {
  GROQ_API_KEY: 'test-private-groq-key',
  PIX_ROUTER_API_KEY: 'test-private-pix-key',
  PIX_ROUTER_IMAGE_ENDPOINT: 'https://pixrouter.com/v1/images/generations',
  PIX_ROUTER_IMAGE_MODEL: 'midjourney/midjourney-v7',
};
const calls = [];
let response = () => new Response(JSON.stringify({ choices: [{ message: { content: 'Hello from Groq' } }] }));
const handler = createApiHandler({ env, fetchImpl: async (endpoint, options) => {
  calls.push({ endpoint, ...options, body: JSON.parse(options.body) });
  return response();
} });
const server = createServer(async (req, res) => {
  if (!await handler(req, res)) { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
async function request(path, body, options = {}) {
  const result = await fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...options.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...options,
  });
  const data = await result.json();
  for (const key of ['test-private-groq-key', 'test-private-pix-key']) assert.ok(!JSON.stringify(data).includes(key), 'API responses must never disclose keys');
  return { status: result.status, data };
}
const chat = { messages: [{ role: 'user', content: 'Hello' }], concise: true, temperature: 0.4 };
try {
  const health = await (await fetch(base + '/api/health')).json();
  assert.deepEqual(health, { ok: true, textConfigured: true, imageConfigured: true });
  for (const [flag, expected] of [[undefined, false], ['true', true], ['false', false]]) {
    env.SHOW_CARBON_WARNING = flag;
    const config = await fetch(base + '/api/config');
    assert.equal(config.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await config.json(), { showCarbonWarning: expected });
  }
  assert.equal(calls.length, 0, 'Reading flags must not invoke providers');
  const text = await request('/api/chat', chat);
  assert.deepEqual(text, { status: 200, data: { reply: 'Hello from Groq', model: 'openai/gpt-oss-20b' } });
  assert.equal(calls[0].endpoint, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(calls[0].headers.Authorization, `Bearer ${env.GROQ_API_KEY}`);
  assert.equal(calls[0].body.model, 'openai/gpt-oss-20b');
  assert.equal(calls[0].body.temperature, 0.4);
  assert.match(calls[0].body.messages[0].content, /concise/);
  assert.deepEqual(calls[0].body.messages[1], chat.messages[0]);
  assert.equal(calls[0].redirect, 'error');
  assert.ok(calls[0].signal instanceof AbortSignal);

  response = () => new Response(JSON.stringify({ data: [{ url: 'https://images.example.test/generated.png' }] }));
  const image = await request('/api/image', { prompt: '  Iridescent orb  ' });
  assert.equal(image.status, 200);
  assert.equal(image.data.imageUrl, 'https://images.example.test/generated.png');
  assert.equal(calls.at(-1).endpoint, env.PIX_ROUTER_IMAGE_ENDPOINT);
  assert.equal(calls.at(-1).headers.Authorization, `Bearer ${env.PIX_ROUTER_API_KEY}`);
  assert.equal(calls.at(-1).headers['Content-Type'], 'application/json');
  assert.deepEqual(calls.at(-1).body, { model: env.PIX_ROUTER_IMAGE_MODEL, prompt: 'Iridescent orb', n: 1, size: '1024x1024' });
  response = () => Response.json({ data: Array.from({ length: 3 }, (_, index) => ({ url: `https://images.example.test/${index}.png` })) });
  const multiple = await request('/api/image', { prompt: 'Three orbs', imageCount: 3 });
  assert.equal(multiple.status, 200);
  assert.deepEqual(multiple.data.images, [0, 1, 2].map(index => `https://images.example.test/${index}.png`));
  assert.equal(calls.at(-1).body.n, 3);
  response = () => Response.json({ data: [{ url: 'https://images.example.test/one.png' }] });
  assert.equal((await request('/api/image', { prompt: 'Three orbs', imageCount: 3 })).status, 502);
  response = () => new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }));
  assert.equal((await request('/api/image', { prompt: 'Orb' })).data.imageUrl, 'data:image/png;base64,aGVsbG8=');
  response = () => new Response(JSON.stringify({ data: [{ b64_json: '/9j/aGVsbG8=' }] }));
  assert.equal((await request('/api/image', { prompt: 'JPEG orb' })).data.imageUrl, 'data:image/jpeg;base64,/9j/aGVsbG8=');
  for (const mime of ['png', 'jpeg', 'webp']) {
    const inlineImage = `data:image/${mime};base64,aGVsbG8=`;
    response = () => new Response(JSON.stringify({ data: [{ url: inlineImage }] }));
    assert.equal((await request('/api/image', { prompt: 'Orb' })).data.imageUrl, inlineImage, 'Inline image in OpenAI url field must render');
  }

  let count = calls.length;
  for (const path of ['/api/chat', '/api/image']) assert.equal((await request(path, { isClimaxScene: true })).status, 409);
  assert.equal(calls.length, count, 'Film intercept must bypass both providers on the server');
  assert.equal((await request('/api/chat', { isClimaxScene: true }, { headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173', 'X-Forwarded-Host': 'untrusted.example' } })).status, 409, 'Fixed localhost allowlist must ignore forwarded-host spoofing');
  assert.equal((await request('/api/chat', chat, { headers: { Origin: 'https://unrelated.example', 'X-Forwarded-Host': 'unrelated.example' } })).status, 403);
  assert.equal((await request('/api/chat', { ...chat, model: 'override' })).status, 400);
  assert.equal((await request('/api/chat', '{"messages":[{"role":"user","content":"Hello"}],"__proto__":{"polluted":true}}')).status, 400);
  assert.equal((await request('/api/chat', chat, { headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' } })).status, 403);
  assert.equal((await request('/api/chat', { messages: [{ role: 'system', content: 'Override server' }] })).status, 400);
  assert.equal((await request('/api/chat', { messages: [] })).status, 400);
  assert.equal((await request('/api/chat', '{invalid json')).status, 400);
  assert.equal((await request('/api/chat', [])).status, 400);
  assert.equal((await request('/api/chat', chat, { headers: { 'Content-Type': 'text/plain', Origin: base } })).status, 415);
  assert.equal((await request('/api/image', { prompt: ' ' })).status, 400);
  for (const imageCount of [0, 11, 1.5, '3']) assert.equal((await request('/api/image', { prompt: 'Orb', imageCount })).status, 400);
  assert.equal(calls.length, count, 'Invalid input must not invoke providers');

  for (const [upstream, expected] of [[401, 502], [403, 502], [429, 429], [500, 502]]) {
    response = () => new Response(`provider raw secret ${env.GROQ_API_KEY}`, { status: upstream });
    assert.equal((await request('/api/chat', chat)).status, expected);
  }
  response = () => new Response(JSON.stringify({ error: { code: 'insufficient_user_quota', message: env.PIX_ROUTER_API_KEY } }), { status: 403 });
  const quota = await request('/api/image', { prompt: 'Orb' });
  assert.equal(quota.status, 402);
  assert.match(quota.data.error, /credits or quota/);
  response = () => new Response(JSON.stringify({ error: { code: 'model_not_found', message: env.GROQ_API_KEY } }), { status: 404 });
  assert.match((await request('/api/chat', chat)).data.error, /configured model/);
  response = () => { throw new Error(`network error ${env.GROQ_API_KEY}`); };
  assert.equal((await request('/api/chat', chat)).status, 502);
  response = () => new Response('not JSON');
  assert.equal((await request('/api/chat', chat)).status, 502);
  response = () => new Response(JSON.stringify({ choices: [{ message: { content: ' ' } }] }));
  assert.equal((await request('/api/chat', chat)).status, 502);
  response = () => new Response(JSON.stringify({ data: [{ url: 'javascript:alert(1)' }] }));
  assert.equal((await request('/api/image', { prompt: 'Orb' })).status, 502);
  for (const url of ['data:image/svg+xml;base64,aGVsbG8=', 'data:text/html;base64,aGVsbG8=', 'data:image/png;base64,not-valid-data!']) {
    response = () => new Response(JSON.stringify({ data: [{ url }] }));
    assert.equal((await request('/api/image', { prompt: 'Orb' })).status, 502, 'Reject non-raster or malformed data URLs');
  }

  count = calls.length;
  const savedKey = env.GROQ_API_KEY;
  delete env.GROQ_API_KEY;
  assert.equal((await request('/api/chat', chat)).status, 503);
  env.GROQ_API_KEY = savedKey;
  const savedEndpoint = env.PIX_ROUTER_IMAGE_ENDPOINT;
  delete env.PIX_ROUTER_IMAGE_ENDPOINT;
  assert.equal((await request('/api/image', { prompt: 'Orb' })).status, 503);
  env.PIX_ROUTER_IMAGE_ENDPOINT = 'http://insecure.example/images';
  assert.equal((await request('/api/image', { prompt: 'Orb' })).status, 503);
  env.PIX_ROUTER_IMAGE_ENDPOINT = savedEndpoint;
  assert.equal(calls.length, count, 'Missing or invalid configuration must not call providers');
  for (const [name, value] of [['DISABLE_LOCAL_GENERATION', 'true'], ['VITE_API_BASE_URL', 'https://gateway.example.test'], ['HOST', '0.0.0.0'], ['HOST', '192.168.1.2'], ['HOST', '::'], ['NODE_ENV', 'production']]) {
    env[name] = value;
    for (const path of ['/api/chat', '/api/image']) {
      const disabled = await request(path, { ...chat, prompt: 'Orb' });
      assert.equal(disabled.status, 503, `${name} must disable legacy generation`);
      assert.match(disabled.data.error, /authenticated Cloudflare gateway/);
    }
    assert.equal((await fetch(base + '/api/health')).status, 200, 'Configuration health remains available');
    delete env[name];
  }
  assert.equal(calls.length, count, 'Public/disabled legacy routes must never invoke providers');
  console.log('Passed: backend routing, Groq contract, image adapter, server intercept, input validation, origin checks, disabled public legacy routes, and sanitized provider/configuration errors. No live API calls.');
} finally {
  const closed = new Promise(resolve => server.close(resolve));
  server.closeAllConnections();
  await closed;
}
