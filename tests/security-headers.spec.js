import { test, expect } from '@playwright/test';

// Read local Worker assets, intercept Google/provider traffic, and test the real
// browser's CSP enforcement. No account sign-in or paid API request is made.
test('Worker CSP loads the app, blocks injected scripts, and renders text as text', async ({ page }) => {
  const violations = [];
  await page.addInitScript(() => {
    window.cspViolations = [];
    window.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective + ':' + event.blockedURI));
  });
  await page.route('https://accounts.google.com/gsi/client*', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.google = { accounts: { id: {
      initialize: options => window.testGoogleCallback = options.callback,
      renderButton: host => { const button = document.createElement('button'); button.textContent = 'Google test sign-in'; host.append(button); },
      disableAutoSelect() {}
    } } };
  ` }));
  const xss = '<img src=x onerror="window.xssExecuted=true"><script>window.xssExecuted=true</script>';
  await page.route('**/api/chat', route => route.fulfill({ json: { reply: xss, usage: { remaining: 4, resetAt: Date.now() + 60000 } } }));
  await page.route('**/api/image', async route => {
    const imageUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
      canvas.getContext('2d').fillRect(0, 0, 80, 60);
      return canvas.toDataURL('image/jpeg');
    });
    await route.fulfill({ json: { imageUrl } });
  });
  const response = await page.goto('http://127.0.0.1:8788/app-responsive.html');
  const headers = response.headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toContain("script-src 'nonce-");
  await expect(page.locator('.login-screen')).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Google test sign-in', exact: true })).toBeVisible();
  await page.evaluate(() => window.testGoogleCallback({ credential: 'header.' + btoa(JSON.stringify({ email: 'alice@example.test', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 })) + '.signature' }));
  await expect(page.locator('.bottom-nav .profile-avatar')).toBeVisible();
  await page.locator('textarea').fill('Check safe text rendering');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.locator('[role=log]')).toContainText(xss);
  expect(await page.evaluate(() => window.xssExecuted)).toBeUndefined();
  await page.getByLabel('Generation type', { exact: true }).selectOption('image');
  await page.locator('textarea').fill('A test orb');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect.poll(() => page.locator('.generated-image img').evaluate(img => img.complete && img.naturalWidth === 80)).toBe(true);
  await page.getByRole('button', { name: 'View image', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('omni-image.jpg');
  expect(await page.evaluate(() => window.cspViolations)).toEqual(violations);
  await page.evaluate(() => {
    const script = document.createElement('script'); script.textContent = 'window.injectedScriptExecuted=true'; document.head.append(script);
  });
  expect(await page.evaluate(() => window.injectedScriptExecuted)).toBeUndefined();
  await expect.poll(() => page.evaluate(() => window.cspViolations)).toContain('script-src-elem:inline');
  await page.evaluate(() => {
    const style = document.createElement('style'); style.textContent = 'body{--injected-style:blocked}'; document.head.append(style);
  });
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--injected-style'))).toBe('');
  await expect.poll(() => page.evaluate(() => window.cspViolations)).toContain('style-src-elem:inline');
});
