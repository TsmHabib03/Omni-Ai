# Environmental warning and Footprint extension

The host controls the warning through `SHOW_CARBON_WARNING`, defaulting to `false` in `omni-rate-limit/wrangler.toml`. The Worker injects a boolean into HTML and serves `GET /api/config` as `{ "showCarbonWarning": true }` or `false`, with `Cache-Control: no-store`. This endpoint exposes no credentials and consumes no generation allowance. The frontend refreshes on load, account changes, focus, visibility changes, and every five seconds while visible. Each Generate action checks the current flag again before contacting a generation provider.

## Live presentation control

Deploy the updated app and Worker first using the project's existing Cloudflare deployment workflow. Then open Cloudflare Dashboard → Workers & Pages → `omni-rate-limit` → Settings → Variables and Secrets, set the text variable `SHOW_CARBON_WARNING` to `true`, and save/deploy the settings change. Set it to `false` to disable warnings. Existing tabs discover the setting without a frontend rebuild; every new generation checks it immediately. A request already approved or sent is not interrupted. A dialog already open retains its decision until dismissed.

The checked-in `wrangler.toml` defaults to `false`. A later Wrangler deployment can overwrite a value edited in the dashboard; check this variable before the presentation and after redeploying. For the Node development server, set `SHOW_CARBON_WARNING=true` in ignored `.env.local` and restart `npm run dev`.

## Install the Chrome/Edge extension

An unpacked Manifest V3 extension is provided in `browser-extension/`, including its built `content.js`. To rebuild after editing the shared dialog, run `npm run build:extension`.

1. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select this project's `browser-extension` folder.
3. Reload the Omni AI tab. The extension toolbar popup links to Omni AI; actual per-prompt consent appears on the page so it can hold the request open.

The extension supports the configured production Worker origin and loopback development pages. If you use a different production hostname, update `content_scripts.matches` in `manifest.json` and reload the extension. It does not intercept prompts on unrelated websites. It uses no broad browsing, storage, or network permissions and does not send prompt data to another service.

When installed, Footprint renders the warning inside a Shadow DOM to isolate it from the app's styling. An explicit event bridge carries only the calculated impact and a request identifier; the app retains the prompt and controls API resumption. The extension honors the same Worker flag. Without the extension, the app renders the same independent dialog. Neither version issues provider requests before consent. Losing the extension while consent is pending cancels after five minutes; it never automatically proceeds.

## Estimation assumptions

These are **illustrative presentation estimates**, not measured provider usage or a universal industry standard. The dialog's expandable methodology explains that actual usage depends on model, output length, hardware, and location. Carbon values are expressed as grams of CO₂ equivalent (CO₂e).

| Request | Estimate |
| --- | --- |
| Text tokens | `ceil(trimmedPrompt.length / 4)` |
| Text water | `tokens × 0.02 ml` |
| Text carbon | `tokens × 0.002 g CO₂e` |
| Image water | `imageCount × 15 ml` |
| Image carbon | `imageCount × 10 g CO₂e` |

The text baseline is 50 prompts of 500 input tokens each → 500 ml water and 50 g CO₂e. Only the submitted prompt is estimated; prior conversation, generated output, and system messages are excluded. For example, “Hello” estimates two tokens, 0.04 ml water, and 0.004 g CO₂e. “Generate three images of a forest” estimates 45 ml water and 30 g CO₂e.

Explicit counts such as “Generate three images” and “Create 2 different portraits” control both the estimate and the provider's `n` parameter. “Generate a picture of 3 cats” requests one image. Requests support 1–10 images; invalid counts are rejected before providers or allowance checks. Provider support and available credits still determine whether a multi-image request succeeds. All requested results must be returned to count as a successful response.

## Implementation and verification

`environmental-impact.mjs` contains the shared formulas; `CarbonWarning.jsx` and `carbon-warning.css` contain the dialog markup and independent visual styling. `extension-warning.mjs` implements the optional extension bridge. `App.jsx` captures immutable request settings, checks the live flag, and resumes once on consent, rechecking session and quota. Configuration lookup failures preserve the draft and show a retry message.

Run `npm run build`, `npm test`, `npm run test:worker`, `npm run build:extension`, and `npm run test:carbon`. Browser tests cover pause/cancel/proceed, live toggling, configuration failure, keyboard focus, multi-image counts, desktop/mobile/landscape layout, and loading the actual unpacked extension. All generation provider traffic is mocked.

The extension's scoped design system is recorded in `browser-extension/DESIGN.md` and `browser-extension/.impeccable/design.json`. Omni AI's root design system is preserved. The supplied dialog captures received a scoped visual review; the toolbar popup is source-reviewed. Delegated Impeccable review/documentation messages could not be read reliably, so the scoped completion used the skill's degraded workflow.
