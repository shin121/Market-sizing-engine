import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const browserChannel = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1" ? "chrome" : undefined;
const systemChrome = browserChannel
  ? { browserName: "chromium" as const, channel: browserChannel }
  : {};

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], ...systemChrome, viewport: { width: 1440, height: 1000 } } },
    { name: "chromium-tablet", use: { ...devices["Desktop Chrome"], ...systemChrome, viewport: { width: 1024, height: 768 } } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"], ...systemChrome } },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `npm run dev -- --hostname localhost --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
