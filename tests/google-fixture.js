import { expect } from '@playwright/test';

// Browser-only interception: never included in the application or Worker bundle.
export async function installGoogleFixture(page, { failFirst = false } = {}) {
  let attempts = 0;
  await page.route('https://accounts.google.com/gsi/client*', async route => {
    if (failFirst && attempts++ === 0) return route.abort();
    return route.fulfill({ contentType: 'application/javascript', body: `
      window.google = { accounts: { id: {
        initialize: options => window.testGoogleCallback = options.callback,
        renderButton: (host, options) => {
          window.testGoogleButtonOptions = options;
          const button = document.createElement('button'); button.textContent = 'Sign in with Google';
          button.style.cssText = 'height:44px;width:100%;border:1px solid #dadce0;border-radius:24px;font:500 14px Arial;cursor:pointer';
          button.style.background = options.theme === 'filled_black' ? '#131314' : 'white';
          button.style.color = options.theme === 'filled_black' ? 'white' : '#3c4043';
          button.onclick = () => window.testGoogleCallback({ credential: 'header.' + btoa(JSON.stringify({ sub: 'test-alice', email: 'alice@example.test', email_verified: true, name: 'Alice Example', picture: 'https://lh3.googleusercontent.com/test-avatar', exp: Math.floor(Date.now() / 1000) + 3600 })) + '.signature' });
          host.append(button);
        },
        disableAutoSelect() {}
      } } };
    ` });
  });
  await page.route('https://lh3.googleusercontent.com/test-avatar', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=', 'base64') }));
}

export async function signIn(page) {
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
}
