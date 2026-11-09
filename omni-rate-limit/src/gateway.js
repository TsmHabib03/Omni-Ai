import { createRemoteJWKSet, jwtVerify } from 'jose';
import { imageSource } from '../../image-utils.mjs';
import { MAX_BODY_BYTES, RequestError, parseBody, validateBodyHeaders, validateGenerationBody } from '../../request-validation.mjs';
import { securityHeaders } from '../../security-headers.mjs';
import { publicFeatureFlags } from '../../feature-flags.mjs';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function verifyGoogleToken(token, clientId, keys = googleKeys) {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId,
    requiredClaims: ['exp', 'iat', 'sub', 'email', 'email_verified'],
    clockTolerance: 5,
  });
  if (payload.email_verified !== true || typeof payload.email !== 'string' || !payload.email ||
      typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
      !Number.isInteger(payload.iat) || payload.iat > Math.floor(Date.now() / 1000) + 5 ||
      (payload.azp !== undefined && payload.azp !== clientId)) throw new Error('Invalid Google identity');
  return payload;
}

export function ratePolicy(env) {
  const limit = Number(env.LIMIT ?? 5), windowSeconds = Number(env.WINDOW_SECONDS ?? 60);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) throw new HttpError(503, 'Usage limits are not configured correctly.');
  return { limit, windowMs: windowSeconds * 1000 };
}

async function readJson(request) {
  validateBodyHeaders(request.headers.get('content-type'), request.headers.get('content-length'), request.headers.get('content-encoding'));
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Send a JSON object.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new HttpError(413, 'This conversation is too large. Please start a new chat.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return parseBody(bytes);
}

function providerRequest(path, body, env) {
  const input = validateGenerationBody(path, body);
  if (path === '/api/image') {
    return {
      endpoint: 'https://pixrouter.com/v1/images/generations', provider: 'Pix Router', key: env.PIX_ROUTER_API_KEY,
      body: { model: env.PIX_ROUTER_IMAGE_MODEL || 'midjourney/midjourney-v7', prompt: input.prompt, n: input.imageCount, size: '1024x1024' },
    };
  }
  return {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions', provider: 'Groq', key: env.GROQ_API_KEY,
    body: { model: env.GROQ_MODEL || 'openai/gpt-oss-20b', messages: [{ role: 'system', content: `You are Omni.AI, a helpful assistant.${input.concise ? ' Keep responses concise and focused.' : ''}` }, ...input.messages], temperature: input.temperature, max_completion_tokens: 2048, stream: false },
  };
}

async function invokeProvider(config, signal, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: JSON.stringify(config.body), signal, redirect: 'error',
    });
  } catch {
    throw new HttpError(signal.aborted ? 504 : 502, signal.aborted ? 'Generation timed out. Please try again.' : `Unable to reach ${config.provider}. Please try again.`);
  }
  if (!response.ok) {
    let code;
    try { code = (await response.json())?.error?.code; } catch { /* Never forward upstream text. */ }
    if (['insufficient_user_quota', 'insufficient_quota', 'insufficient_balance'].includes(code)) throw new HttpError(402, `${config.provider} has no generation credits or quota remaining.`);
    if (code === 'model_not_found') throw new HttpError(502, `${config.provider} does not provide access to the configured model.`);
    if ([401, 403].includes(response.status)) throw new HttpError(502, `${config.provider} rejected the server API key.`);
    if (response.status === 429) throw new HttpError(429, `${config.provider} is temporarily rate-limited. Please try again later.`);
    throw new HttpError(502, `${config.provider} returned HTTP ${response.status}. Please try again.`);
  }
  try { return await response.json(); } catch { throw new HttpError(502, `${config.provider} returned an unreadable response.`); }
}

export function createGateway({ verify = verifyGoogleToken, fetchImpl = globalThis.fetch } = {}) {
  return async function gateway(request, env) {
    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const headers = { ...securityHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin && allowed.includes(origin)) Object.assign(headers, {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Expose-Headers': 'Retry-After',
    });
    const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
    if (origin && !allowed.includes(origin)) return json(403, { error: 'This origin is not allowed.' });
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/api/config') return json(200, publicFeatureFlags(env));
    if (request.method === 'GET' && path === '/api/health') return json(200, {
      ok: true, authConfigured: Boolean(env.GOOGLE_CLIENT_ID), textConfigured: Boolean(env.GROQ_API_KEY),
      imageConfigured: Boolean(env.PIX_ROUTER_API_KEY), limiterConfigured: Boolean(env.ACCOUNT_LIMITER),
      ...publicFeatureFlags(env),
    });
    if (!['/api/chat', '/api/image'].includes(path)) return json(404, { error: 'API route not found.' });
    if (!origin || !allowed.includes(origin)) return json(403, { error: 'This origin is not allowed.' });
    if (request.headers.get('sec-fetch-site') === 'cross-site') return json(403, { error: 'Cross-site requests are not allowed.' });
    if (request.method === 'OPTIONS') {
      if (request.headers.get('access-control-request-method') !== 'POST') return json(405, { error: 'Use POST for generation.' });
      const requested = (request.headers.get('access-control-request-headers') || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (requested.some(h => !['authorization', 'content-type'].includes(h))) return json(403, { error: 'Request headers are not allowed.' });
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return json(405, { error: 'Use POST for generation.' }, { Allow: 'POST, OPTIONS' });
    let rate;
    try {
      if (!env.GOOGLE_CLIENT_ID || !env.ACCOUNT_LIMITER) throw new HttpError(503, 'Account authentication is not configured yet.');
      const { limit } = ratePolicy(env);
      const auth = request.headers.get('authorization');
      if (!auth || auth.length > 16384 || !/^Bearer [A-Za-z0-9._~-]+$/.test(auth)) throw new HttpError(401, 'Sign in with Google to generate.');
      let identity;
      try { identity = await verify(auth.slice(7), env.GOOGLE_CLIENT_ID); } catch { throw new HttpError(401, 'Your Google session has expired or is invalid. Please sign in again.'); }
      const body = await readJson(request);
      if (body.email !== undefined && body.email !== identity.email) throw new HttpError(403, 'The supplied email does not match your signed-in account.');
      const config = providerRequest(path, body, env);
      if (!config.key) throw new HttpError(503, `${config.provider} is not configured on the server yet.`);
      rate = await env.ACCOUNT_LIMITER.getByName(`google:${identity.sub}`).admit();
      if (!rate.allowed) return json(429, { error: `You have used all ${limit} generations in this window. Try again shortly.`, code: 'ACCOUNT_RATE_LIMIT', ...rate }, { 'Retry-After': String(rate.retryAfter) });
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(path === '/api/image' ? 120000 : 60000)]);
      const data = await invokeProvider(config, signal, fetchImpl);
      const result = { model: config.body.model, usage: rate };
      if (path === '/api/image') {
        result.images = Array.from({ length: config.body.n }, (_, index) => imageSource({ data: [data?.data?.[index]], images: [data?.images?.[index]], ...(index === 0 ? { imageUrl: data?.imageUrl } : {}) })).filter(Boolean);
        result.imageUrl = result.images[0];
        if (result.images.length !== config.body.n) throw new HttpError(502, 'Pix Router did not return all requested images. Please try again.');
      } else {
        result.reply = data?.choices?.[0]?.message?.content;
        if (typeof result.reply !== 'string' || !result.reply.trim()) throw new HttpError(502, 'Groq returned an empty response. Please try again.');
      }
      return json(200, result);
    } catch (error) {
      const expected = error instanceof HttpError || error instanceof RequestError;
      return json(expected ? error.status : 503, {
        error: expected ? error.message : 'Generation is temporarily unavailable. Please try again.',
        ...(rate ? { usage: rate } : {}),
      });
    }
  };
}
