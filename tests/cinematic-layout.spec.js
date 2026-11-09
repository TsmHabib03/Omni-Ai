import { test, expect } from '@playwright/test';
import { installGoogleFixture, signIn } from './google-fixture.js';
test.beforeEach(async ({ page }) => {
  await installGoogleFixture(page);
  await page.route('**/api/config', route => route.fulfill({ json: { showCarbonWarning: false } }));
});

const viewports = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'small-mobile', width: 360, height: 640 },
  { name: 'landscape', width: 844, height: 390 },
];

for (const theme of ['light', 'dark']) {
for (const viewport of viewports) {
  test(`${theme} ${viewport.name}: docked navigation and full proportional images`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // Real raster images created in the browser; no paid provider calls.
    await page.route('**/api/image', async route => {
      const prompt = route.request().postDataJSON().prompt;
      const imageUrl = await page.evaluate(shape => {
        const canvas = document.createElement('canvas');
        canvas.width = shape === 'portrait' ? 640 : shape === 'landscape' ? 1600 : 1024;
        canvas.height = shape === 'portrait' ? 1600 : shape === 'landscape' ? 640 : 1024;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#122934'); gradient.addColorStop(.5, '#655779'); gradient.addColorStop(1, '#14252a');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#c5b2d4'; ctx.lineWidth = 12;
        ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
        ctx.beginPath(); ctx.ellipse(canvas.width / 2, canvas.height / 2, canvas.width * .3, canvas.height * .3, -.2, 0, Math.PI * 2); ctx.stroke();
        return canvas.toDataURL('image/png');
      }, prompt);
      await route.fulfill({ json: { imageUrl, model: 'layout-test' } });
    });
    await page.goto('/app-responsive.html');
  await signIn(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.avatar, .mini-avatar')).toHaveCount(0);
    await page.screenshot({ path: `test-results/${theme}-${viewport.name}-chat.png` });
    const bounds = await page.evaluate(() => {
      const rect = selector => {
        const { x, y, width, height, bottom } = document.querySelector(selector).getBoundingClientRect();
        return { x, y, width, height, bottom };
      };
      return { chat: rect('.chat-panel'), grid: rect('.bento-grid'), composer: rect('.composer'), nav: rect('.bottom-nav'), navPosition: getComputedStyle(document.querySelector('.bottom-nav')).position, scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, bodyHeight: document.body.scrollHeight, screenHeight: innerHeight, chatFont: parseFloat(getComputedStyle(document.querySelector('.user-bubble p')).fontSize) };
    });
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.viewport);
    expect(bounds.bodyHeight).toBeLessThanOrEqual(bounds.screenHeight + 1);
    expect(bounds.nav.bottom).toBeLessThanOrEqual(viewport.height);
    expect(bounds.navPosition).toBe('fixed');
    expect(viewport.height - bounds.nav.bottom).toBeLessThanOrEqual(11);
    expect(bounds.composer.bottom).toBeLessThan(bounds.nav.y);
    expect(bounds.chat.bottom).toBeLessThan(bounds.composer.y);
    expect(bounds.chat.width / bounds.grid.width).toBeGreaterThan(.64);
    expect(bounds.chatFont).toBeGreaterThanOrEqual(18);
    for (const shape of ['square', 'portrait', 'landscape']) {
      if (await page.locator('.new-chat').isVisible()) await page.locator('.new-chat').click();
      else {
        await page.getByRole('button', { name: 'Conversation options', exact: true }).click();
        await page.getByRole('button', { name: 'Start a new conversation', exact: true }).click();
      }
      await page.getByLabel('Generation type', { exact: true }).selectOption('image');
      await page.getByLabel('Message Omni.AI').fill(shape);
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      const image = page.locator('.generated-image img');
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      // Let the effect/scroll animation settle before inspecting visibility.
      await expect.poll(async () => page.evaluate(() => {
        const img = document.querySelector('.generated-image img');
        const image = img.getBoundingClientRect();
        const feed = document.querySelector('.chat-feed').getBoundingClientRect();
        return image.top >= feed.top && image.bottom <= feed.bottom;
      })).toBe(true);
      const geometry = await image.evaluate(img => {
        const r = img.getBoundingClientRect();
        const feed = document.querySelector('.chat-feed').getBoundingClientRect();
        return { width: r.width, height: r.height, naturalRatio: img.naturalWidth / img.naturalHeight, feedHeight: feed.height, objectFit: getComputedStyle(img).objectFit };
      });
      expect(geometry.width / geometry.height).toBeCloseTo(geometry.naturalRatio, 2);
      expect(geometry.height).toBeLessThanOrEqual(viewport.height * .55 + 1);
      expect(geometry.height).toBeLessThan(geometry.feedHeight);
      if (shape === 'square') expect(geometry.height).toBeGreaterThanOrEqual(85);
      expect(geometry.objectFit).toBe('contain');
      if (shape === 'square') await page.screenshot({ path: `test-results/${theme}-${viewport.name}-image.png` });
      await page.getByRole('button', { name: 'View image', exact: true }).click();
      const viewer = page.getByRole('dialog', { name: 'Your generated image', exact: true });
      await expect(viewer.locator('img')).toBeVisible();
      await expect.poll(() => viewer.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      const viewerBounds = await viewer.locator('img').boundingBox();
      expect(viewerBounds.y).toBeGreaterThanOrEqual(0);
      expect(viewerBounds.y + viewerBounds.height).toBeLessThanOrEqual(viewport.height);
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    }
  });
}
}

test('white default, saved theme, and settings switch persist without changing conversation', async ({ page }) => {
  await page.goto('/app-responsive.html');
  await signIn(page);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
  const messages = await page.getByRole('log').innerText();
  await page.getByLabel('Message Omni.AI').fill('Keep my draft');
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.getByLabel('Message Omni.AI')).toHaveValue('Keep my draft');
  expect(await page.getByRole('log').innerText()).toBe(messages);
  await page.reload();
  await signIn(page);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  await page.locator('.header-actions').getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByRole('button', { name: 'White', exact: true }).click();
  await expect(page.getByRole('button', { name: 'White', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await signIn(page);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
});

test('JPEG text payload renders and downloads without exposing base64', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app-responsive.html');
  await signIn(page);
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#202337'; ctx.fillRect(0, 0, 1024, 1024);
    ctx.fillStyle = '#b9a6d2'; ctx.fillRect(400, 400, 224, 224);
    return canvas.toDataURL('image/jpeg');
  });
  await page.route('**/api/chat', route => route.fulfill({ json: { reply: `Here is your image:\n${jpeg}` } }));
  await page.getByLabel('Message Omni.AI').fill('Show my result');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const image = page.locator('.generated-image img');
  await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth === 1024)).toBe(true);
  await expect(page.getByRole('log')).not.toContainText('data:image/');
  await page.getByRole('button', { name: 'View image', exact: true }).click();
  await expect.poll(() => page.locator('.image-viewer img').evaluate(img => img.complete && img.naturalWidth === 1024)).toBe(true);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('omni-image.jpg');
  expect(await download.failure()).toBeNull();
  await page.screenshot({ path: 'test-results/mobile-jpeg-viewer.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View image', exact: true })).toBeFocused();
});

test('explicit image commands use PixRouter and multiline composer reserves dock space', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.route('**/api/chat', () => { throw new Error('An explicit image command must bypass text generation'); });
  await page.route('**/api/image', async route => {
    const b64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 400;
      return canvas.toDataURL('image/jpeg').split(',')[1];
    });
    await route.fulfill({ json: { data: [{ b64_json: b64 }] } });
  });
  await page.goto('/app-responsive.html');
  await signIn(page);
  await page.getByLabel('Message Omni.AI').fill('Generate an image of a pixel art skyline');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const image = page.locator('.generated-image img');
  await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth === 200)).toBe(true);
  await expect(page.getByLabel('Generation type', { exact: true })).toHaveValue('image');
  const input = page.getByLabel('Message Omni.AI');
  await input.fill('First line\nSecond line\nThird line\nFourth line');
  await expect.poll(() => page.evaluate(() => {
    const chat = document.querySelector('.chat-panel').getBoundingClientRect();
    const composer = document.querySelector('.composer').getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    return chat.bottom < composer.top && composer.bottom < nav.top && Math.abs(chat.left - composer.left) < 1 && Math.abs(chat.width - composer.width) < 1;
  })).toBe(true);
});
