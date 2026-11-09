# Omni.AI Cloudflare Worker

This folder contains the deployed authenticated generation gateway, strict per-account Durable Object limiter, optional KV binding, and static frontend deployment configuration.

See [the project setup guide](../CLOUDFLARE_PLAN.md) for the deployed URL, Google OAuth configuration status, PowerShell commands, local development, secret management, and request contracts.

The audited implementation enforces five attempts per verified Google account in a rolling 60 seconds, shared across text and images. All asset and API responses pass through the Worker for security headers and HTML nonce CSP. Production CORS permits only the origin in `wrangler.toml`.

From this folder: `npm test`, `npm run dev -- --local`, `npm run check`, and `npm run deploy -- --dry-run`. The deploy dry-run builds the root frontend with enforced Google authentication and validates the Worker without uploading secrets or deploying.

For Git-connected Cloudflare builds, use the **repository root**, build command `npm ci --prefix omni-rate-limit`, and deploy command `npm run deploy:cloudflare`. Add `GOOGLE_CLIENT_ID` as a private build secret. The helper explicitly selects this folder's `wrangler.toml`; bare root-level `npx wrangler deploy` instead attempts to auto-configure Vite. See [the build settings](../CLOUDFLARE_PLAN.md#cloudflare-workers-builds-github).

When deployment is authorized, `npm run deploy` reads `GOOGLE_CLIENT_ID` from ignored root `.env.local` or the process environment, builds the public frontend client configuration, and publishes the backend OAuth Secret, assets, and Worker together using `--secrets-file`. Temporary configuration uses a user-only Windows ACL and is removed afterward. No Google client secret is used. Provider keys belong only in ignored local files or Cloudflare Worker secrets; deployment preserves existing provider secrets.

The white login and security hardening are deployed on Worker `omni-ai` in version `6e41ebe7-f3e3-466e-a2b6-26c2741c9687`. Production presence checks, secure headers, rejected requests, and real GIS button rendering passed. Google still rejects the configured client's production origin; real sign-in and generation remain pending that Google Console setting. This folder retains its original source-directory name. The user approved publication of the rename and deployment fixes on November 9, 2026.

`SHOW_CARBON_WARNING` defaults to `false`. HTML and `GET /api/config` expose only its parsed boolean to the frontend. Change this variable in Cloudflare's dashboard to control the presentation warning live. See [the environmental warning guide](../ENVIRONMENTAL_WARNING.md) for toggle behavior, formulas, and extension installation.
