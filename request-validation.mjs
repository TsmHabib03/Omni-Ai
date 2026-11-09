// Shared by the Worker and the loopback development API. Never spread input
// into provider payloads: validate the complete shape and construct fields anew.
export const MAX_BODY_BYTES = 256 * 1024;
export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateBodyHeaders(contentType, contentLength, contentEncoding) {
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(contentType || '')) {
    throw new RequestError(415, 'Send UTF-8 application/json.');
  }
  if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') throw new RequestError(415, 'Compressed request bodies are not supported.');
  if (contentLength !== null && contentLength !== undefined) {
    if (!/^(0|[1-9]\d*)$/.test(contentLength)) throw new RequestError(400, 'Invalid Content-Length.');
    if (!Number.isSafeInteger(Number(contentLength)) || Number(contentLength) > MAX_BODY_BYTES) throw new RequestError(413, 'This conversation is too large. Please start a new chat.');
  }
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fields(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new RequestError(400, 'The request contains unsupported fields.');
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new RequestError(400, `${label} must contain non-empty text within the supported length.`);
  }
  return value;
}

export function parseBody(bytes) {
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), (key, value) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe field');
      return value;
    });
  } catch { throw new RequestError(400, 'Invalid JSON request.'); }
  if (!object(body)) throw new RequestError(400, 'Send a JSON object.');
  return body;
}

export function validateGenerationBody(path, body) {
  const common = ['email', 'isClimaxScene'];
  fields(body, path === '/api/image' ? [...common, 'prompt', 'imageCount'] : [...common, 'prompt', 'messages', 'concise', 'temperature']);
  if (body.email !== undefined) text(body.email, 320, 'Email');
  if (body.isClimaxScene !== undefined && typeof body.isClimaxScene !== 'boolean') throw new RequestError(400, 'isClimaxScene must be a boolean.');
  if (body.isClimaxScene === true) throw new RequestError(409, 'Generation is paused for the film scene. No provider request was made.');
  if (path === '/api/image') {
    const imageCount = body.imageCount ?? 1;
    if (!Number.isSafeInteger(imageCount) || imageCount < 1 || imageCount > 10) throw new RequestError(400, 'Request between 1 and 10 images.');
    return { prompt: text(body.prompt, 4000, 'Image prompt').trim(), imageCount };
  }
  if (body.prompt !== undefined && body.messages !== undefined) throw new RequestError(400, 'Send prompt or messages, not both.');
  if (body.concise !== undefined && typeof body.concise !== 'boolean') throw new RequestError(400, 'concise must be a boolean.');
  if (body.temperature !== undefined && (typeof body.temperature !== 'number' || !Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 1)) {
    throw new RequestError(400, 'temperature must be a number from 0 to 1.');
  }
  const source = body.messages ?? [{ role: 'user', content: text(body.prompt, 20000, 'Prompt').trim() }];
  if (!Array.isArray(source) || source.length < 1 || source.length > 100) throw new RequestError(400, 'Send between 1 and 100 chat messages.');
  const messages = source.map(message => {
    fields(message, ['role', 'content']);
    if (!['user', 'assistant'].includes(message.role)) throw new RequestError(400, 'Chat messages must use user or assistant roles.');
    return { role: message.role, content: text(message.content, 20000, 'Chat message') };
  });
  if (messages.at(-1).role !== 'user') throw new RequestError(400, 'End the conversation with a user message.');
  return { messages, concise: body.concise === true, temperature: body.temperature ?? 0.7 };
}
