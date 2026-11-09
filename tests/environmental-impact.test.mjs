import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateEnvironmentalImpact, requestedImageCount, formatImpact } from '../environmental-impact.mjs';
import { carbonWarningEnabled, publicFeatureFlags } from '../feature-flags.mjs';

test('text scales to rounded input tokens and reproduces the documented baseline', () => {
  const small = estimateEnvironmentalImpact({ prompt: 'Hello' });
  assert.equal(small.tokens, 2);
  assert.equal(small.waterMl, 0.04);
  assert.equal(small.carbonGrams, 0.004);
  const standard = estimateEnvironmentalImpact({ prompt: 'x'.repeat(2000) });
  assert.equal(standard.waterMl * 50, 500);
  assert.equal(standard.carbonGrams * 50, 50);
  assert.equal(formatImpact(0.002), '0.002');
});

test('image counts describe outputs, not objects in the scene', () => {
  assert.equal(requestedImageCount('Generate three images of a forest'), 3);
  assert.equal(requestedImageCount('Create 2 different portraits'), 2);
  assert.equal(requestedImageCount('Generate a picture of 3 cats'), 1);
  assert.equal(requestedImageCount('a forest with 5 trees'), 1);
  const impact = estimateEnvironmentalImpact({ kind: 'image', prompt: 'Generate three images of a forest' });
  assert.equal(impact.waterMl, 45);
  assert.equal(impact.carbonGrams, 30);
  assert.throws(() => requestedImageCount('Generate 11 images'), RangeError);
  assert.throws(() => requestedImageCount('', 1.5), RangeError);
});

test('Cloudflare booleans and dashboard strings parse without Boolean("false") mistakes', () => {
  for (const flag of [true, 'true', ' TRUE ']) assert.equal(carbonWarningEnabled(flag), true);
  for (const flag of [false, 'false', undefined, '', 'yes', 1]) assert.equal(carbonWarningEnabled(flag), false);
  assert.deepEqual(publicFeatureFlags({ SHOW_CARBON_WARNING: 'true', PRIVATE_KEY: 'secret' }), { showCarbonWarning: true });
});
