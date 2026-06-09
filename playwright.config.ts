import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright end-to-end test configuration.
 *
 * The dev server already runs on port 8000 (see `npm run dev`); we reuse it when
 * it's up and otherwise start one ourselves. `globalSetup` seeds a fixture
 * SQLite database the tests upload, so a run doesn't depend on whatever happens
 * to be in `.data` or the configured presets.
 */
const PORT = 8000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Fail fast in CI if someone leaves a `test.only` behind.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
