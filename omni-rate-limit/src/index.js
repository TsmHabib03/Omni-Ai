import { DurableObject } from 'cloudflare:workers';
import { createGateway } from './gateway.js';
import { admitAccount, expireAccount } from './limiter.js';
import { securityHeaders, documentCsp } from '../../security-headers.mjs';
import { publicFeatureFlags } from '../../feature-flags.mjs';

export class AccountLimiter extends DurableObject {
  async admit() { return admitAccount(this.ctx.storage, this.env); }
  async alarm() { await expireAccount(this.ctx.storage); }
}

const gateway = createGateway();
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return gateway(request, env);
    try {
      let response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
      if ((headers.get('content-type') || '').includes('text/html')) {
        const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));
        response = new HTMLRewriter().on('head', {
          element(element) { element.prepend(`<meta name="csp-nonce" content="${nonce}"><meta name="omni-carbon-warning" content="${publicFeatureFlags(env).showCarbonWarning}">`, { html: true }); },
        }).on('script, style', {
          element(element) { element.setAttribute('nonce', nonce); },
        }).transform(response);
        headers.set('Content-Security-Policy', documentCsp(nonce));
        headers.set('Cache-Control', 'no-store');
        headers.delete('etag');
        headers.delete('content-length');
      }
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch {
      return new Response('Application temporarily unavailable.', { status: 503, headers: { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  },
};
