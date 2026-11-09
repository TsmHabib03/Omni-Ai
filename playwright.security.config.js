import config from './playwright.config.js';

export default {
  ...config,
  testMatch: 'security-headers.spec.js',
  webServer: {
    command: 'npm --prefix omni-rate-limit run dev -- --local',
    url: 'http://127.0.0.1:8788',
    reuseExistingServer: true,
    env: { CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' },
  },
};
