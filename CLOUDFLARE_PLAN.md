# Omni.AI Cloudflare setup

Status on November 9, 2026: the white login screen and audited security hardening are deployed in version `1c1f58f0-c544-4f96-9ac7-1d0455909048`. Production asset, security-header, API rejection, and desktop/mobile browser checks passed. Google still reports that the deployed origin is not allowed for the configured client; real sign-in and production text/image generation remain blocked pending Google Console configuration. See [SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md).

App: https://omni-rate-limit.jaudianhabib879.workers.dev/app-responsive.html

Gateway and only permitted production frontend origin: https://omni-rate-limit.jaudianhabib879.workers.dev

## Request security and rate policy

Generation follows exact origin/method checks, Google token verification, bounded JSON validation, atomic account admission, and a provider call. There is no separate check-limit endpoint a caller can skip.

- Google RS256 signature, issuer, audience, authorized party when present, expiry, issued-at time, subject, and verified email are checked on every generation request. Tokens stay in browser memory. A supplied email must match the verified account.
- One SQLite-backed Durable Object per verified Google `sub` allows five attempts in a rolling 60 seconds, shared across text and images. Transactions prevent concurrent over-admission. IP and forwarded identity headers cannot change the account budget. Old fixed-window records migrate while retaining their unexpired usage.
- The sixth unexpired attempt receives HTTP 429 with `ACCOUNT_RATE_LIMIT`, `remaining`, `resetAt`, and `Retry-After`. Provider failures consume admitted attempts. Invalid auth/input, preflights, and the film intercept do not. Storage errors fail closed.
- Bodies are capped at 256 KiB while streaming. Only UTF-8 JSON with supported fields, roles, lengths, and types is accepted. Client payloads cannot supply provider endpoints, models, tools, or system messages. Provider redirects are refused and raw upstream errors are not returned.
- Production generation requires the exact configured Origin. Missing, null, joined, and other origins are rejected. Cross-site fetches are rejected. CORS permits only Authorization and Content-Type for generation and exposes Retry-After. Origin checks complement verified tokens; non-browser clients can forge Origin.
- All deployed assets pass through the Worker. HTML uses a fresh CSP nonce for scripts/styles and disables caching. APIs, assets, and errors carry CSP, HSTS, nosniff, frame denial, no-referrer, Permissions Policy, and cross-origin policies compatible with Google popups.
- CSP permits the required Google sign-in and font hosts, plus the exact inspected GIS button stylesheet by SHA-256 hash. Arbitrary inline script/style elements still require the document nonce. Images/downloads allow HTTPS and raster data URLs; downloadable remote images require their host's CORS permission. Executable/SVG data image URLs are rejected.

KV is already provisioned for optional cache/settings. Atomic quota storage uses Durable Objects because KV read/increment/write is eventually consistent and not atomic. Resource IDs in TOML are public identifiers.

## Private configuration and deployment

The Google Web OAuth client is already created. In Google Cloud Console → Credentials, edit the Web application client matching the private `GOOGLE_CLIENT_ID`. Under Authorized JavaScript origins, save the exact production origin above, without a path, query, hash, or trailing slash. Live GIS checks still reject that origin. For Vite development also authorize `http://127.0.0.1:5173` and `http://localhost:5173`. This GIS callback flow requires no Google client secret. If account access remains blocked after fixing the origin, check Google Auth Platform → Audience and permitted test users.

Preserve provider keys in ignored `.env.local` and add `GOOGLE_CLIENT_ID` privately there, or supply it through the process environment. The deploy helper reads this value, enforces authenticated frontend mode, uses same-origin API requests, and publishes the backend client ID with the same Worker version using `wrangler deploy --secrets-file`. The short-lived JSON file is created in ignored `.wrangler` state with a user-only Windows ACL before its contents are written; the helper removes it afterward and redacts the client ID from deployment output. This also replaces the old plain-text binding, which a separate `secret put` rejected. Never put actual values in TOML or documentation. The client ID must be visible in the browser for Google sign-in; storing its backend configuration as a Secret does not make the browser value confidential.

From PowerShell in the root, validate the authenticated build without modifying Cloudflare:

```powershell
node omni-rate-limit/scripts/deploy.mjs --dry-run
```

When deployment is authorized, publish the app and Worker together:

```powershell
npm run deploy:cloudflare
```

Remote inspection after deployment confirms `GOOGLE_CLIENT_ID`, `GROQ_API_KEY`, and `PIX_ROUTER_API_KEY` are all `secret_text` bindings. Existing provider secrets were preserved and temporary deployment configuration was removed. To sync rotated provider keys from the ignored root file when authorized:

```powershell
npm --prefix omni-rate-limit run secrets:sync
```

The helper passes secret JSON via stdin and withholds Wrangler output that handles private input. Alternatively use `wrangler secret put` privately. Local Worker keys belong in ignored `omni-rate-limit/.dev.vars`. `npm --prefix omni-rate-limit run secrets:local` creates that file if absent; it refuses to overwrite it. Existing local files have Windows ACLs restricted to Habib. When creating new files on Windows, apply an equivalent user-only ACL; POSIX file mode alone does not establish Windows ACL protection.

Provider keys must use server-only names. `VITE_*` and `NEXT_PUBLIC_*` variables are public browser configuration. `.gitignore` excludes environment files, Worker secrets/state, builds, test artifacts, credential exports, private keys, and backups. Run `npm run audit:secrets` before publication. Existing repositories must separately remove any already tracked secret files and rotate previously exposed credentials.

## Local development

Use Node.js 22.12 or newer and install dependencies in both the root and Worker folders.

For the loopback provider sandbox, copy `.env.example` to `.env.local` if absent, enter provider values privately, and run `npm run dev`. The frontend normally uses http://127.0.0.1:5173 and proxies `/api` to the loopback Node server. Local provider routes are disabled under `NODE_ENV=production`, a non-loopback HOST, `DISABLE_LOCAL_GENERATION=true`, or a configured `VITE_API_BASE_URL`. These development routes are not the public authenticated service.

For authenticated Worker development, build the authenticated frontend with the dry-run command, then provide a matching `GOOGLE_CLIENT_ID` in ignored `.dev.vars`. Override `ALLOWED_ORIGINS` there with only the local origin being tested, such as `http://localhost:8788`, and authorize that local origin in Google Cloud Console. Override production origin rules only in local private configuration. Run:

```powershell
$env:CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
npm --prefix omni-rate-limit run dev -- --local
```

Open http://localhost:8788/app-responsive.html. Local Durable Object state is isolated from production. The production allowlist intentionally rejects a separate localhost frontend calling the deployed gateway.

## Verification

```powershell
npm test
npm run test:worker
node omni-rate-limit/scripts/deploy.mjs --dry-run
npm run test:security-browser
npm run audit:secrets
npm audit
npm --prefix omni-rate-limit audit
```

Automated checks mock Google sign-in/provider traffic and spend no credits. The security browser test starts a local Worker, uses the existing authenticated build, and checks actual Chromium CSP enforcement, escaped hostile text, and JPEG viewing/downloads. `npm run test:layout` separately exercises layout through Vite.

`GET /api/health` exposes configuration-presence booleans only. Production returns true for authentication, text, image, and limiter configuration. The deployed assets match the authenticated build; eight live origin/auth/preflight rejection checks passed without provider requests. Desktop and mobile Chromium checks loaded the actual GIS script and white button with no CSP violations or runtime errors. Google explicitly rejects the deployed origin, so a healthy configuration does not establish sign-in or generation readiness. After saving the matching client's authorized origin, sign in on the live app and generate one text response and one image to verify the complete production flow.

## Official references

- [Cloudflare KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
