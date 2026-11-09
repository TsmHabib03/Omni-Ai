import { test, expect } from '@playwright/test';
import { installGoogleFixture, signIn } from './google-fixture.js';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`Google-only entrance and bottom avatar at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installGoogleFixture(page);
    await page.goto('/app-responsive.html#/app');
    await expect(page.locator('.login-screen')).toBeVisible();
    await expect(page.locator('.login-screen')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('light');
    await expect(page).toHaveURL(/#\/login$/);
    await expect(page.locator('textarea, .bottom-nav')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Omni AI', exact: true })).toBeVisible();
    await expect(page.locator('.login-action button')).toHaveCount(1);
    expect(await page.evaluate(() => window.testGoogleButtonOptions.theme)).toBe('outline');
    await expect(page.locator('.login-footer')).toContainText('Terms of Service');
    await expect(page.locator('.login-footer')).toContainText('Privacy Policy');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const button = await page.getByRole('button', { name: 'Sign in with Google', exact: true }).boundingBox();
    expect(button.x).toBeGreaterThanOrEqual(0);
    expect(button.x + button.width).toBeLessThanOrEqual(viewport.width);
    await signIn(page);
    await expect(page).toHaveURL(/#\/app$/);
    const avatar = page.locator('.bottom-nav .profile-avatar img');
    await expect.poll(() => avatar.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const photo = await avatar.boundingBox();
    expect(photo.width).toBe(photo.height);
    expect(photo.y + photo.height).toBeLessThanOrEqual(viewport.height);
    await avatar.dispatchEvent('error');
    await expect(page.locator('.bottom-nav .profile-avatar svg')).toBeVisible();
    await page.getByRole('button', { name: 'Manage account', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Alice Example');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('.login-screen')).toBeVisible();
    await page.evaluate(() => location.hash = '#/app');
    await expect(page).toHaveURL(/#\/login$/);
    await signIn(page);
    await page.reload();
    await expect(page.locator('.login-screen')).toBeVisible();
    expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('.signature')))).toBe(false);
  });
}

test('Google network failure has a working retry', async ({ page }) => {
  await installGoogleFixture(page, { failFirst: true });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Check your connection');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await signIn(page);
});

test('Signing out of a dark workspace returns to white login and preserves the preference', async ({ page }) => {
  await installGoogleFixture(page);
  await page.goto('/');
  await signIn(page);
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.getByRole('button', { name: 'Manage account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('.login-screen')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('light');
  await signIn(page);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
});
