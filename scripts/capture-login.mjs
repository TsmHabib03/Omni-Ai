import { chromium } from '@playwright/test';
import { installGoogleFixture, signIn } from '../tests/google-fixture.js';
import { mkdirSync } from 'node:fs';
mkdirSync('.impeccable/review', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, locale: 'en-US', reducedMotion: 'reduce' });
    await page.goto('http://127.0.0.1:5173/');
    await page.locator('.google-signin [role="button"]').first().waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `.impeccable/review/${name}.png`, fullPage: true });
    console.log(name + ': real Google button loaded');
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await installGoogleFixture(page);
  await page.route('**/api/config', route => route.fulfill({ json: { showCarbonWarning: false } }));
  await page.goto('http://127.0.0.1:5173/');
  await signIn(page);
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '.impeccable/review/mobile-account.png', fullPage: true });
  await page.getByRole('button', { name: 'Manage account', exact: true }).click();
  await page.screenshot({ path: '.impeccable/review/account-dialog.png', fullPage: true });
  await page.close();
} finally { await browser.close(); }
