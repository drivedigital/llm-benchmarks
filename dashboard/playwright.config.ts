import { defineConfig } from "@playwright/test";

const externalServer = process.env.E2E_BASE_URL;
const baseURL = externalServer ?? "http://127.0.0.1:4173";
const launchOptions = process.env.CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
  : undefined;
const serverURL = new URL(baseURL);
const lanURL = new URL(baseURL);
lanURL.hostname = "dashboard.test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    launchOptions,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "default" },
    // A non-localhost HTTP origin is genuinely non-secure, even though DNS
    // resolves to the test server. Do not mock randomUUID or mark it as secure:
    // this catches browser capability differences hidden by localhost tests.
    ...(serverURL.protocol === "http:"
      ? [
          {
            name: "http-lan",
            use: {
              baseURL: lanURL.toString(),
              launchOptions: {
                ...launchOptions,
                args: [
                  `--host-resolver-rules=MAP dashboard.test ${serverURL.hostname}`,
                ],
              },
            },
          },
        ]
      : []),
  ],
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
