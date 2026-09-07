import { defineConfig } from "@playwright/test";

const externalServer = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: externalServer ?? "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    trace: "retain-on-failure",
  },
  webServer: externalServer
    ? undefined
    : {
        // Exercise the production bundle without sharing a dev optimizer cache.
        command: "npm run build && npm run preview -- --port 4173 --strictPort",
        env: { API_UPSTREAM: "http://127.0.0.1:1337/v1" },
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
      },
});
