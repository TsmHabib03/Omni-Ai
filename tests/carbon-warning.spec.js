import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { installGoogleFixture, signIn } from './google-fixture.js';

async function setup(page, enabled = true) {
  const state = { enabled, configFails: false, calls: [] };
  await installGoogleFixture(page);
  await page.route('**/api/config', route => route.fulfill(state.configFails ? { status: 503, json: { error: 'Unavailable' } } : { json: { showCarbonWarning: state.enabled } }));
  await page.route('**/api/chat', route => { state.calls.push(route.request().postDataJSON()); return route.fulfill({ json: { reply: 'Approved request completed.' } }); });
  await page.route('**/api/image', route => {
    const body = route.request().postDataJSON(); state.calls.push(body);
    return route.fulfill({ json: { images: Array.from({ length: body.imageCount }, () => 'data:image/png;base64,aGVsbG8=') } });
  });
  await page.goto('/');
  await signIn(page);
  return state;
}

test('warning pauses text, preserves cancellation, traps focus and resumes once', async ({ page }) => {
  const state = await setup(page);
  const input = page.getByLabel('Message Omni.AI');
  await input.fill('Hello');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('text prompt of 2 tokens');
  await expect(dialog).toContainText('0.04 ml of water');
  await expect(dialog).toContainText('0.004 grams of carbon');
  expect(state.calls).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Proceed Anyway' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close environmental warning' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.locator('summary')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(input).toHaveValue('Hello');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await page.getByRole('button', { name: 'Proceed Anyway' }).click();
  await expect(page.getByRole('log')).toContainText('Approved request completed.');
  expect(state.calls).toHaveLength(1);
  expect(state.calls[0].messages.at(-1).content).toBe('Hello');
});

test('live toggle and configuration failures are checked before requests', async ({ page }) => {
  const state = await setup(page, false);
  await page.getByLabel('Message Omni.AI').fill('First prompt');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Approved request completed.');
  state.enabled = true;
  await page.getByLabel('Message Omni.AI').fill('Second prompt');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(state.calls).toHaveLength(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  state.configFails = true;
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Unable to check');
  expect(state.calls).toHaveLength(1);
});

test('explicit plural image prompts estimate and request the same count', async ({ page }) => {
  const state = await setup(page);
  await page.getByLabel('Message Omni.AI').fill('Generate three images of a forest');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('3 images');
  await expect(dialog).toContainText('45 ml of water');
  await expect(dialog).toContainText('30 grams of carbon');
  await page.getByRole('button', { name: 'Proceed Anyway' }).click();
  await expect(page.locator('.generated-image')).toHaveCount(3);
  expect(state.calls).toHaveLength(1);
  expect(state.calls[0].imageCount).toBe(3);
});

for (const viewport of [{ name: 'desktop', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }, { name: 'landscape', width: 844, height: 390 }]) {
  test(`extension warning fits ${viewport.name} and retains its own appearance`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setup(page);
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await page.getByLabel('Message Omni.AI').fill('Generate three images of a quiet woodland at sunrise');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: `.impeccable/review/${viewport.name}.png` });
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await expect(dialog).toHaveCSS('background-color', 'rgb(249, 250, 246)');
    await dialog.getByText('How is this estimated?').click();
    await expect(dialog).toContainText('not provider measurements');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeFocused();
  });
}

test('installed Chrome extension owns consent and leaves the app fallback closed', async () => {
  const extensionPath = resolve('browser-extension');
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    baseURL: 'http://127.0.0.1:5173',
  });
  try {
    const page = await context.newPage();
    const state = await setup(page);
    await page.getByLabel('Message Omni.AI').fill('Hello from the installed extension');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    const host = page.locator('#footprint-extension-host');
    await expect(host.getByRole('alertdialog')).toBeVisible();
    expect(state.calls).toHaveLength(0);
    await host.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(host).toHaveCount(0);
    await expect(page.getByLabel('Message Omni.AI')).toHaveValue('Hello from the installed extension');
    await page.getByLabel('Message Omni.AI').fill('Generate 2 images of a forest');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(host.getByRole('alertdialog')).toContainText('30 ml of water');
    await expect(page.locator('body > .impact-overlay')).toHaveCount(0);
    await host.getByRole('button', { name: 'Proceed Anyway' }).click();
    await expect(page.locator('.generated-image')).toHaveCount(2);
    expect(state.calls).toHaveLength(1);
    state.enabled = false;
    await page.getByLabel('Generation type', { exact: true }).selectOption('text');
    await page.getByLabel('Message Omni.AI').fill('Disabled warning prompt');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('log')).toContainText('Approved request completed.');
    await expect(host).toHaveCount(0);
    expect(state.calls).toHaveLength(2);
  } finally { await context.close(); }
});
