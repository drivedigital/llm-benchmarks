import { expect, test } from "@playwright/test";

// API fixtures are intercepted only inside these isolated test browser contexts.
// They are never connected to, saved in, or served by the user's dashboard.
test("starts blank, stays idle, and has one combined settings button", async ({
  page,
}, testInfo) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiRequests.push(request.url());
  });
  await page.clock.install();
  await page.goto("/");
  await expect(
    page.getByText("Benchmarks idle", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(15_000);
  expect(apiRequests).toEqual([]);
  await expect(
    page.getByRole("banner").getByRole("button", { name: /Server & models/ }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Start benchmarks" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Run now" })).toBeDisabled();
  await expect(page.getByText(/No runs yet/)).toBeVisible();
  await expect(page.getByText(/No benchmark results yet/)).toBeVisible();
  await expect(
    page.locator(".animate-spin, .animate-ping, .animate-pulse"),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("blank-dashboard.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Server & models/ }).click();
  await expect(page.getByLabel("API Server", { exact: true })).toHaveValue(
    "http://127.0.0.1:1337/v1",
  );
  await expect(
    page.getByText(/No models loaded. Test the connection/),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("blank-settings.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Test connection" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a failed connection does not generate tests or claim live activity", async ({
  page,
}) => {
  let completions = 0;
  await page.route("**/api/v1/models", (route) =>
    route.fulfill({ status: 502, body: "Jan is unavailable" }),
  );
  await page.route("**/api/v1/chat/completions", (route) => {
    completions += 1;
    return route.abort();
  });
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: /Server & models/ }).click();
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("status")).toContainText("No new tests will run");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.clock.fastForward(15_000);
  await expect(
    page.getByRole("button", { name: "Start benchmarks" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Run now" })).toBeDisabled();
  await expect(page.getByText("Idle", { exact: true })).toBeVisible();
  await expect(page.getByText(/No runs yet/)).toBeVisible();
  expect(completions).toBe(0);
});

test("only explicit API requests populate results; purge returns to a stable empty board", async ({
  page,
}) => {
  let completions = 0;
  let requestBody: unknown;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/v1/models", (route) =>
    route.fulfill({ json: { data: [{ id: "test-context/served-model" }] } }),
  );
  await page.route("**/api/v1/chat/completions", async (route) => {
    completions += 1;
    requestBody = route.request().postDataJSON();
    await gate;
    // A non-streaming response has actual content/usage but no measurable TTFT.
    await route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: "Response from the isolated API test fixture.",
            },
          },
        ],
        usage: { completion_tokens: 12 },
      },
    });
  });
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: /Server & models/ }).click();
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Connected — 1 model(s)",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.clock.fastForward(15_000);
  expect(completions).toBe(0);
  await expect(page.getByText(/No runs yet/)).toBeVisible();
  await page
    .getByLabel("Ad-hoc model")
    .selectOption("test-context/served-model");
  await page.getByLabel("Ad-hoc test").selectOption("t1_code");
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText("1 API request in flight")).toBeVisible();
  await expect.poll(() => completions).toBe(1);
  expect(requestBody).toMatchObject({
    model: "test-context/served-model",
    stream: true,
    max_tokens: 620,
  });
  // Open the running request, then verify the drawer tracks its actual completion.
  await page.locator("button.animate-feedin").click();
  release();
  await expect(
    page.getByText("Response from the isolated API test fixture."),
  ).toBeVisible();
  await expect(
    page.getByText(/A dash means the measurement is unavailable/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close run details" }).click();
  await expect(page.getByText("0 API requests in flight")).toBeVisible();
  await expect(page.getByText("No throughput measurements yet.")).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Purge data" }).click();
  await page.getByRole("button", { name: "Purge 1 run" }).click();
  await page.clock.fastForward(15_000);
  await expect(page.getByText(/No runs yet/)).toBeVisible();
  await expect(page.getByText(/No benchmark results yet/)).toBeVisible();
  await expect(page.getByText("No duration measurements yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Purge data" })).toBeDisabled();
  expect(completions).toBe(1);
  expect(pageErrors).toEqual([]);
});
