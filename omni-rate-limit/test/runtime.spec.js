import { env, SELF } from 'cloudflare:test';
import { it, expect } from 'vitest';

it('real Durable Object admits exactly five concurrent requests and isolates accounts', async () => {
  const limiter = env.ACCOUNT_LIMITER.getByName('runtime-concurrency');
  const results = await Promise.all(Array.from({ length: 6 }, () => limiter.admit()));
  expect(results.filter(r => r.allowed)).toHaveLength(5);
  expect(results.find(r => !r.allowed).retryAfter).toBeGreaterThan(0);
  expect((await env.ACCOUNT_LIMITER.getByName('another-account').admit()).allowed).toBe(true);
});

it('deployed handler fails closed without Google credentials or configuration', async () => {
  const response = await SELF.fetch('https://worker.test/api/chat', { method: 'POST', headers: { Origin: 'https://worker.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Hello' }) });
  expect(response.status).toBe(env.GOOGLE_CLIENT_ID ? 401 : 503);
  expect((await response.json()).error).toMatch(/authentication|Sign in/);
});

it('static HTML and API errors carry enforced security headers', async () => {
  for (const path of ['/', '/app-responsive.html', '/api/unknown']) {
    const response = await SELF.fetch(`https://worker.test${path}`);
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000');
    const csp = response.headers.get('content-security-policy');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
    if (!path.startsWith('/api/')) {
      expect(response.status).toBe(200);
      const nonce = csp.match(/script-src 'nonce-([^']+)'/)[1];
      const html = await response.text();
      expect(html).toContain(`nonce="${nonce}"`);
      expect(html).toContain('<meta name="omni-carbon-warning" content="false">');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  }
});

it('runtime exposes a boolean feature flag without secrets or authentication', async () => {
  const response = await SELF.fetch('https://worker.test/api/config');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ showCarbonWarning: false });
});

it('CSP nonces differ between responses and rejected origins have no CORS grants', async () => {
  const a = await SELF.fetch('https://worker.test/');
  const b = await SELF.fetch('https://worker.test/');
  expect(a.headers.get('content-security-policy')).not.toBe(b.headers.get('content-security-policy'));
  const response = await SELF.fetch('https://worker.test/api/chat', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}' });
  expect(response.status).toBe(403);
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
});
