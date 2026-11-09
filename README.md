# Omni.AI

React + Tailwind cinematic chat workspace with white and dark glass themes, an embedded iridescent logo, custom orbital SVG icons, Groq text generation, an image-generation adapter, and a live environmental warning with an optional browser extension.

The conversation dominates the responsive bento grid. Chat text is 20–22px on desktop and 18px on mobile, with a fixed composer and bottom tab navigation. The dock reserves its measured height so multiline input and device safe areas cannot cover the conversation. Subtle pixel constellations, square status lights, and monospace labels complement the iridescent orbital branding. Generated images preserve their aspect ratio and fit within both 55% of the viewport and the measured chat-feed height. Image loading follows the latest response when automatic scrolling is enabled.

The default entrance is a white pearl glass **Omni AI** login screen with Google as the only sign-in option. Signed-out users stay at `#/login`; signed-in users enter `#/app`. Credentials stay in memory, so reloading requires sign-in again. Session expiry or an API authentication failure returns to login. The bottom navigation shows the Google profile photo, with a circular fallback when the photo is missing or cannot load. Open it to view the account and sign out.

**White mode is the workspace default.** Use the moon/sun control in the header or **Settings → Appearance → White / Dark** to switch. White mode uses pearl glass with readable dark text; dark mode retains the low-glare film styling. Explicit choices persist in local storage under `omni-color-mode`. The login screen always uses white mode, including after signing out of a dark workspace. Switching workspace themes preserves the conversation and input draft.

Set `VITE_TERMS_URL` and `VITE_PRIVACY_URL` to published HTTPS policies when available. The footer displays their names as plain text until those destinations are configured.

Open `http://127.0.0.1:5173/app-responsive.html` during development. `app-responsive.html` is a React entry point; the UI source remains in `App.jsx`. The production build emits an identical, self-contained `dist/app-responsive.html` alongside `dist/index.html`, so both URLs show the same application. Serve these files through the app server rather than opening the source HTML directly from the filesystem.

## Cloudflare deployment and Google Sign-In

The app and authenticated generation gateway are deployed together at **https://omni-rate-limit.jaudianhabib879.workers.dev/app-responsive.html**. Both provider keys are Cloudflare Worker secrets. The audited implementation requires a verified Google ID token and enforces five generation attempts per account in a rolling 60 seconds, shared across text and images. Durable Objects enforce atomic admission; KV is provisioned for optional cache/settings.

**The white login screen and security hardening are deployed** in version `1c1f58f0-c544-4f96-9ac7-1d0455909048` on November 9, 2026. Production configuration, asset/header, unauthorized-request, and desktop/mobile rendering checks passed. Google still rejects the deployed origin for the configured client, so real sign-in and text/image generation await the exact Google Console origin setting below. The client ID is configured in ignored `.env.local` or the process environment; deployment builds it into the authenticated frontend and publishes the backend value as a Cloudflare Secret with the same Worker version. An OAuth client ID is public browser configuration. See [CLOUDFLARE_PLAN.md](CLOUDFLARE_PLAN.md) for setup and [SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md) for findings and verification limits.

## Add your API keys and run locally

Use Node.js 22.12 or newer. Open PowerShell in this project folder:

```powershell
npm install
if (!(Test-Path -LiteralPath .env.local)) { Copy-Item -LiteralPath .env.example -Destination .env.local }
notepad .env.local
```

Fill in the following entries privately, save the file, and close the editor:

```dotenv
GOOGLE_CLIENT_ID=your_public_google_client_id
GROQ_API_KEY=your_groq_key
PIX_ROUTER_API_KEY=your_pix_router_key
PIX_ROUTER_IMAGE_ENDPOINT=https://pixrouter.com/v1/images/generations
PIX_ROUTER_IMAGE_MODEL=midjourney/midjourney-v7
API_PORT=8787
```

PixRouter's [API documentation](https://pixrouter.com/docs.html#description/introduction) and [OpenAPI schema](https://pixrouter.com/openapi.json) confirm `POST https://pixrouter.com/v1/images/generations` with Bearer authentication and the fields `model`, `prompt`, `n: 1`, and `size: "1024x1024"`. The app uses `midjourney/midjourney-v7`. Successful responses provide `data[0].url`, which can contain either an HTTPS URL or a base64 data URL. The adapter accepts PNG, JPEG, and WebP inline images as well as `data[0].b64_json`; it rejects executable URLs and SVG data URLs.

Groq uses `POST https://api.groq.com/openai/v1/chat/completions`, matching its [OpenAI compatibility documentation](https://console.groq.com/docs/openai). The app uses `openai/gpt-oss-20b`, which is available to this account. The same model is used in the server, React callback payload, and UI.

```powershell
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://127.0.0.1:5173`). This command starts both the frontend and backend. Authorize this local JavaScript origin in Google Cloud Console, then sign in with Google. Choose **Text** beside the composer for Groq or **Image** for Pix Router, type a prompt, and click **Generate**. Explicit creation commands such as “Generate an image of a pixel art skyline” also switch to Image automatically. Questions about images remain text requests. The backend listens on `http://127.0.0.1:8787`; `/api/health` reports whether configuration is present without exposing keys. This checks configuration presence, not provider authentication. For the authenticated Cloudflare gateway in development, set `VITE_API_BASE_URL` and configure its allowed local origin deliberately.

Restart `npm run dev` after editing `.env.local`. Vite uses port 5173 with `strictPort` so it cannot silently move to an unauthorized OAuth origin. If it is occupied, stop the previous frontend process before restarting; change `API_PORT` if the backend port is occupied.

### Google Sign-In: `400 origin_mismatch`

Google validates the page's exact **scheme, hostname, and port**, regardless of which Google account you choose. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), edit the Web application OAuth client used by `.env.local`. Under **Authorized JavaScript origins**, add the origins you use:

```text
http://127.0.0.1:5173
http://localhost:5173
https://omni-rate-limit.jaudianhabib879.workers.dev
```

Keep existing production origins. Origins have no path, query, or hash: do not add `/app-responsive.html` or `#/login`. Authorized redirect URIs are a separate setting and do not fix this Google Identity Services popup flow. Save, allow time for Google's settings to propagate, and reload the app at `http://127.0.0.1:5173`.

If a different account is still blocked after the origin error is resolved, check **Google Auth Platform → Audience**. An Internal app restricts accounts to its organization; an External app in Testing may restrict access to configured test users. Handle any audience changes deliberately; do not disable backend token verification. The app itself has no email allowlist.

### How the keys are referenced

Secrets use **server-only names**: `GROQ_API_KEY` and `PIX_ROUTER_API_KEY`. Do not use `VITE_GROQ_API_KEY`, `VITE_PIX_ROUTER_API_KEY`, or `NEXT_PUBLIC_*` for secrets: Vite and Next.js include those public variables in browser code. Putting a public-prefixed key in an env file does not protect it.

`server.mjs` loads `.env.local` with Node's built-in env loader. `api.mjs` reads the values on the server and adds the provider authorization header:

```js
// Server only; createApiHandler defaults env to process.env.
const key = process.env.GROQ_API_KEY;
const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'openai/gpt-oss-20b',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: false,
  }),
});
```

The image branch similarly uses `env.PIX_ROUTER_API_KEY`, `env.PIX_ROUTER_IMAGE_ENDPOINT`, and `env.PIX_ROUTER_IMAGE_MODEL`. The React component sends prompts to `/api/chat` and `/api/image` without provider keys. `.env.local` is ignored by Git; `.env.example` contains only the empty template.

Before committing, ensure the project `.gitignore` contains:

```gitignore
.env
.env.*
!.env.example
```

Run `npm run audit:secrets` before publication. It scans exact local credential values and credential patterns, and verifies Git ignore behavior using isolated temporary metadata without staging files. In an existing repository, also use `git check-ignore -- .env.local omni-rate-limit/.dev.vars`; ignore rules do not remove already tracked files. On this Windows workspace, both local key files are restricted to the current user's account. Credentials shared previously must be rotated in their provider dashboards, then replaced locally and synced privately.

## React generation hooks

`App.jsx` contains the complete interface. `handleGenerateText` appends user text, calls `/api/chat`, and appends `{ role: 'assistant', content: reply }`. `handleGenerateImage` calls `/api/image` and appends `{ role: 'assistant', imageUrl, imagePrompt }`, rendered in the existing glass bubble. Both handle loading, retryable failures, and cancellation when starting a new chat.

The opening conversation is a UI sample. It and image/error responses are excluded from Groq's text context. Optional `onGenerate` and `onGenerateImage` props can override the default backend handlers; they receive a prompt and an AbortSignal. The text callback additionally receives conversation messages, the fixed Groq model, temperature, and concise preference.

The shared `image-utils.mjs` adapter accepts `imageUrl`, OpenAI `data[0].url`, and `data[0].b64_json`, detecting JPEG and WebP rather than labeling every base64 payload PNG. Inline raster data URLs returned in text replies are extracted into image cards instead of printed as raw base64 or forwarded to Groq. **View image** opens an accessible in-app viewer, avoiding browsers blocking top-level data-URL navigation. **Download image** saves a local image file; remote hosts must allow CORS for fetch-based downloads.

The environmental warning is controlled by the host's `SHOW_CARBON_WARNING` setting. Generation checks its current value before any API or callback runs. **Proceed Anyway** resumes the captured request once; **Cancel**, Escape, or dismissing the dialog preserves the draft. The browser extension and the app fallback share a sage-and-ivory design independent of Omni AI's theme. See [the setup and estimation guide](ENVIRONMENTAL_WARNING.md).

## Build and run the server

```powershell
npm run build
npm start
```

Open `http://127.0.0.1:8787`. This Node server is for loopback development. Its provider routes return 503 when `NODE_ENV=production`, a non-loopback `HOST` is used, `DISABLE_LOCAL_GENERATION=true`, or `VITE_API_BASE_URL` is set. Public hosting uses the authenticated Cloudflare deployment described above. A static HTML deployment alone cannot invoke generation without the gateway.

## Verify

```powershell
npm run build
npm test
npm run test:worker
npm run build:extension
npm run test:carbon
npm run test:layout
npx playwright test auth-flow
npm run audit:secrets
node omni-rate-limit/scripts/deploy.mjs --dry-run
npm run test:security-browser
```

Automated tests use mocked provider responses and make no live paid requests. They cover text/image handlers, conversation filtering, environmental warning pause/cancel/proceed and live toggling, white default and saved theme selection, custom SVGs, image structure, error recovery, callback payloads, navigation, dialog focus, provider request formats, configuration errors, and sanitized API responses.

Authentication tests cover sign-in gating, Google token headers, draft preservation, account sign-out, expired sessions, and 429 countdowns. Worker tests verify signed JWTs, concurrent account admission, rolling-window boundary bursts, combined text/image budgets, spoofed headers, malformed payloads, storage failures, live feature configuration, and secure asset headers. Five tests run in Cloudflare's actual Worker/Durable Object runtime. The separate security browser test uses the authenticated build and local Worker to verify nonce CSP, escaped output, and image viewing/downloads with mocked sign-in and providers.

The browser suite checks six viewport sizes in both themes, including short landscape screens, with square, portrait, and landscape raster images. It verifies that every image is fully visible, preserves its proportions, and stays below 55% of viewport height. Additional regressions check theme persistence, real JPEG rendering from text and OpenAI base64 responses, viewer/download behavior, explicit image-command routing, and multiline input keeping the fixed dock clear of the chat. Screenshots are written to `test-results/`. If Chromium is not installed, run `npx playwright install chromium` once.

Earlier live checks authenticated both provider model catalogs and exercised local text/image generation. Groq's unavailable `llama-3.1-8b-instant` model was replaced with `openai/gpt-oss-20b`; PixRouter generation used `midjourney/midjourney-v7`. Those checks predate this audit. Real Google sign-in followed by production generation through the hardened Worker remains unverified.

Library, conversation history, and feedback remain local mock-up state and reset on reload. Voice capture remains a preview dialog. Appearance persists independently of the mock-up session.

## Google Sign-In implementation and setup

See [CLOUDFLARE_PLAN.md](CLOUDFLARE_PLAN.md) for the architecture, Windows commands, Google OAuth setup, secret management, CORS, and verification steps. `auth.jsx` holds the Google sign-in integration; `omni-rate-limit/src/` holds the Worker backend. The source repository is [TsmHabib03/Omni-Ai](https://github.com/TsmHabib03/Omni-Ai); Cloudflare deployment is managed separately.
