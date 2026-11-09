/** Illustrative input-only estimates, not measurements of any provider.
 * Baseline: 50 prompts of 500 input tokens use 500 ml water and 50 g CO2e.
 * Images: 15 ml water and 10 g CO2e each, independent of prompt length.
 */
export const IMPACT_ASSUMPTIONS = Object.freeze({
  tokensPerPrompt: 500, baselinePrompts: 50, waterMl: 500, carbonGrams: 50,
  imageWaterMl: 15, imageCarbonGrams: 10,
});

export function requestedImageCount(prompt, explicitCount) {
  if (explicitCount !== undefined) {
    if (!Number.isSafeInteger(explicitCount) || explicitCount < 1 || explicitCount > 10) throw new RangeError('Request between 1 and 10 images.');
    return explicitCount;
  }
  const words = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  // Require a creation command so "a picture of 3 cats" stays one image.
  const match = String(prompt).match(/\b(?:generate|create|draw|render|make|paint|design)\s+(?:(?:me|us)\s+)?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:different|separate|distinct|unique)\s+)?(?:images?|pictures?|photos?|photographs?|illustrations?|portraits?|wallpapers?)\b/i);
  return match ? requestedImageCount(prompt, words[match[1].toLowerCase()] ?? Number(match[1])) : 1;
}

export function estimateEnvironmentalImpact({ kind = 'text', prompt = '', imageCount } = {}) {
  if (kind !== 'text' && kind !== 'image') throw new TypeError('Unknown generation type.');
  const tokens = Math.ceil(String(prompt).length / 4);
  const count = kind === 'image' ? requestedImageCount(prompt, imageCount) : 0;
  const scale = tokens / (IMPACT_ASSUMPTIONS.tokensPerPrompt * IMPACT_ASSUMPTIONS.baselinePrompts);
  return Object.freeze({ kind, tokens, imageCount: count,
    waterMl: kind === 'image' ? count * IMPACT_ASSUMPTIONS.imageWaterMl : scale * IMPACT_ASSUMPTIONS.waterMl,
    carbonGrams: kind === 'image' ? count * IMPACT_ASSUMPTIONS.imageCarbonGrams : scale * IMPACT_ASSUMPTIONS.carbonGrams,
  });
}

export function formatImpact(value) {
  if (value > 0 && value < 0.001) return value.toPrecision(2);
  return new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(value);
}
