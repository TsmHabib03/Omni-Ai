// Only raster images are accepted. Never treat arbitrary chat text as an image.
export function rasterSource(value, { bareBase64 = false } = {}) {
  if (typeof value !== 'string') return null;
  const source = value.trim();
  const inline = source.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/\r\n]+={0,2})$/i);
  if (inline) return `data:image/${inline[1].toLowerCase().replace('jpg', 'jpeg')};base64,${inline[2].replace(/[\r\n]/g, '')}`;
  if (bareBase64 && /^[A-Za-z0-9+/\r\n]+={0,2}$/.test(source)) {
    const base64 = source.replace(/[\r\n]/g, '');
    // OpenAI b64_json has no MIME field. Detect JPEG/WebP rather than labeling every image PNG.
    const mime = base64.startsWith('/9j/') ? 'jpeg' : base64.startsWith('UklGR') ? 'webp' : 'png';
    return `data:image/${mime};base64,${base64}`;
  }
  try {
    const url = new URL(source);
    if (url.protocol === 'https:' && !url.username && !url.password) return source;
  } catch { /* Unsupported source. */ }
  return null;
}

export function imageSource(result) {
  if (typeof result === 'string') return rasterSource(result);
  const image = result?.data?.[0] ?? result?.images?.[0];
  for (const candidate of [result?.imageUrl, result?.image_url, image?.url, typeof image === 'string' ? image : null]) {
    const source = rasterSource(candidate);
    if (source) return source;
  }
  return rasterSource(image?.b64_json ?? result?.b64_json, { bareBase64: true });
}

export function inlineImageReply(text) {
  if (typeof text !== 'string') return { content: '', imageUrl: null };
  let imageUrl = null;
  // Handle Markdown images and raw data URLs that arrive through a text adapter.
  let content = text.replace(/!\[([^\]]*)\]\((data:image\/[^)\s]+|https:\/\/[^)\s]+)\)/g, (match, alt, source) => {
    const valid = rasterSource(source);
    if (!valid || imageUrl) return match;
    imageUrl = valid;
    return alt;
  });
  content = content.replace(/data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}/gi, source => {
    const valid = rasterSource(source);
    if (!valid) return source;
    imageUrl ??= valid;
    return '';
  });
  if (imageUrl) content = content.replace(/```(?:\w+)?\s*```/g, '').replace(/`\s*`/g, '').trim();
  return { content, imageUrl };
}

export function isImagePrompt(prompt) {
  // Only explicit creation commands change mode; questions about images stay text.
  return /^(?:(?:please|can you|could you|would you|i want you to)\s+)*(?:generate|create|draw|render|make|paint|design)\b[^\n]{0,100}\b(?:images?|pictures?|photos?|photographs?|illustrations?|artworks?|portraits?|wallpapers?|pixel art)\b/i.test(prompt);
}
