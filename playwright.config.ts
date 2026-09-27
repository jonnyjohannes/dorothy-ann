import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:15173", trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: [
    { command: "PORT=18787 DOROTHY_FIXTURE_MODE=true DOROTHY_FIXTURE_SYNTHESIS_DELAY_MS=750 NODE_TLS_REJECT_UNAUTHORIZED=1 npm run dev:server", url: "http://127.0.0.1:18787/api/health", reuseExistingServer: !process.env.CI, timeout: 30_000 },
    { command: "DOROTHY_E2E_API_ORIGIN=http://127.0.0.1:18787 npm run dev -- --host 127.0.0.1 --port 15173 --strictPort", url: "http://127.0.0.1:15173", reuseExistingServer: !process.env.CI, timeout: 30_000 },
  ],
});
