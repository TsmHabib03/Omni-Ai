import { imageSource as normalizeImageSource } from './image-utils.mjs';
import { MAX_BODY_BYTES, RequestError, parseBody, validateBodyHeaders, validateGenerationBody } from './request-validation.mjs';
import { securityHeaders } from './security-headers.mjs';
import { publicFeatureFlags } from './feature-flags.mjs';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-20b';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function sendJson(res, status, body) {
  if (res.destroyed) return;
  res.writeHead(status, { ...securityHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  validateBodyHeaders(req.headers['content-type'], req.headers['content-length'], req.headers['content-encoding']);
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new ApiError(413, 'This conversation is too large. Please start a new chat.');
    chunks.push(chunk);
  }
  return parseBody(Buffer.concat(chunks));
}

function imageSource(data) {
  const source = normalizeImageSource(data);
  if (source) return source;
  throw new ApiError(502, 'Pix Router did not return a supported image URL or image data. Please try again.');
}

async function callProvider(endpoint, key, body, signal, provider, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal,
      redirect: 'error',
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError(502, `Unable to reach ${provider}. Check the endpoint and your connection.`);
  }
  if (!response.ok) {
    // Inspect known error codes, never forward raw upstream text or credentials.
    let providerCode;
    try { providerCode = (await response.json())?.error?.code; } catch { /* Some gateways return HTML. */ }
    if (['insufficient_user_quota', 'insufficient_quota', 'insufficient_balance'].includes(providerCode)) throw new ApiError(402, `${provider} has no generation credits or quota remaining. Add credits or renew your plan in its dashboard.`);
    if (providerCode === 'model_not_found') throw new ApiError(502, `${provider} does not provide access to the configured model. Check model availability in its dashboard.`);
    if (response.status === 401 || response.status === 403) throw new ApiError(502, `${provider} rejected the API key. Check your .env.local settings.`);
    if (response.status === 429) throw new ApiError(429, `${provider} is rate-limited or out of credits. Please try again later.`);
    throw new ApiError(502, `${provider} returned HTTP ${response.status}. Check the model and provider configuration.`);
  }
  try { return await response.json(); }
  catch { throw new ApiError(502, `${provider} returned an unreadable response.`); }
}

/** Keys remain in this server module; never returned to the browser. */
export function createApiHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return async function handleApi(req, res) {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!path.startsWith('/api/')) return false;
    if (req.method === 'GET' && path === '/api/config') {
      sendJson(res, 200, publicFeatureFlags(env));
      return true;
    }
    if (req.method === 'GET' && path === '/api/health') {
      sendJson(res, 200, { ok: true, textConfigured: Boolean(env.GROQ_API_KEY), imageConfigured: Boolean(env.PIX_ROUTER_API_KEY && env.PIX_ROUTER_IMAGE_ENDPOINT && env.PIX_ROUTER_IMAGE_MODEL) });
      return true;
    }
    if (!['/api/chat', '/api/image'].includes(path)) { sendJson(res, 404, { error: 'API route not found.' }); return true; }
    const publicHost = env.HOST && !['127.0.0.1', 'localhost', '::1'].includes(env.HOST);
    if (env.DISABLE_LOCAL_GENERATION === 'true' || env.VITE_API_BASE_URL || publicHost || env.NODE_ENV === 'production') {
      sendJson(res, 503, { error: 'Local generation is disabled. Use the authenticated Cloudflare gateway.' }); return true;
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(res, 405, { error: 'Use POST for generation.' }); return true; }
    // No cross-origin API access. This prevents other websites from using a local key.
    const origin = req.headers.origin;
    try {
      const loopback = new URL(`http://${req.headers.host}`);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(loopback.hostname)) throw new Error();
      const allowed = [loopback.origin, 'http://localhost:5173', 'http://127.0.0.1:5173'];
      if (!origin || !allowed.includes(origin) || req.headers['sec-fetch-site'] === 'cross-site') throw new Error();
    } catch { sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' }); return true; }
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    const timeout = setTimeout(() => controller.abort(new Error('Provider timeout')), path === '/api/image' ? 120000 : 60000);
    try {
      const body = await readBody(req);
      const input = validateGenerationBody(path, body);
      if (path === '/api/chat') {
        if (!env.GROQ_API_KEY) throw new ApiError(503, 'Add GROQ_API_KEY to .env.local and restart the server.');
        const data = await callProvider(GROQ_ENDPOINT, env.GROQ_API_KEY, {
          model: GROQ_MODEL,
          messages: [{ role: 'system', content: `You are Omni.AI, a helpful assistant.${input.concise ? ' Keep responses concise and focused.' : ''}` }, ...input.messages],
          temperature: input.temperature, max_completion_tokens: 2048, stream: false,
        }, controller.signal, 'Groq', fetchImpl);
        const reply = data?.choices?.[0]?.message?.content;
        if (typeof reply !== 'string' || !reply.trim()) throw new ApiError(502, 'Groq returned an empty response. Please try again.');
        sendJson(res, 200, { reply, model: GROQ_MODEL });
      } else {
        if (!env.PIX_ROUTER_API_KEY || !env.PIX_ROUTER_IMAGE_ENDPOINT || !env.PIX_ROUTER_IMAGE_MODEL) throw new ApiError(503, 'Add PIX_ROUTER_API_KEY, PIX_ROUTER_IMAGE_ENDPOINT, and PIX_ROUTER_IMAGE_MODEL to .env.local and restart the server.');
        let endpoint;
        try { endpoint = new URL(env.PIX_ROUTER_IMAGE_ENDPOINT); } catch { throw new ApiError(503, 'PIX_ROUTER_IMAGE_ENDPOINT must be a valid HTTPS URL.'); }
        if (endpoint.href !== 'https://pixrouter.com/v1/images/generations') throw new ApiError(503, 'PIX_ROUTER_IMAGE_ENDPOINT must be the documented Pix Router HTTPS endpoint.');
        // PixRouter's documented OpenAI-compatible /v1/images/generations contract.
        const data = await callProvider(endpoint.href, env.PIX_ROUTER_API_KEY, {
          model: env.PIX_ROUTER_IMAGE_MODEL, prompt: input.prompt, n: input.imageCount, size: '1024x1024',
        }, controller.signal, 'Pix Router', fetchImpl);
        const images = Array.from({ length: input.imageCount }, (_, index) => imageSource({ data: [data?.data?.[index]], images: [data?.images?.[index]], ...(index === 0 ? { imageUrl: data?.imageUrl } : {}) }));
        sendJson(res, 200, { imageUrl: images[0], images, model: env.PIX_ROUTER_IMAGE_MODEL });
      }
    } catch (error) {
      const expected = error instanceof ApiError || error instanceof RequestError;
      if (!res.destroyed) sendJson(res, controller.signal.aborted ? 504 : expected ? error.status : 500, { error: controller.signal.aborted ? 'Generation timed out. Please try again.' : expected ? error.message : 'Generation failed. Please try again.' });
    } finally { clearTimeout(timeout); res.off('close', disconnect); }
    return true;
  };
}
