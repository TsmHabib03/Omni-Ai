import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.toml" },
			miniflare: { bindings: { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', ALLOWED_ORIGINS: 'https://worker.test', GROQ_API_KEY: 'test-only-groq', PIX_ROUTER_API_KEY: 'test-only-pix' } },
		}),
	],
	test: { include: ["test/runtime.spec.js"] },
});
