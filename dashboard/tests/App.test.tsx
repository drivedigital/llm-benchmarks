import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import LeaderboardTable from "../src/components/LeaderboardTable";
import StatCard from "../src/components/StatCard";
import { Gauge } from "lucide-react";
import { DEFAULT_TESTS } from "../src/data/tests";
import type { RunResult } from "../src/types";

const fetchMock = vi.fn<typeof fetch>();
const tick = (ms = 500) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const isDisabled = (name: string) =>
  (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function connect() {
  fireEvent.click(screen.getByRole("button", { name: /Server & models/ }));
  fetchMock.mockResolvedValueOnce(
    Response.json({ data: [{ id: "actual-jan-model" }] }),
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
  });
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
}

describe("dashboard activity reflects actual requests", () => {
  it("has one server/models header button and a genuinely empty, idle initial screen", async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    const header = screen.getByRole("banner");
    expect(
      within(header).getAllByRole("button", { name: /Server & models/ }),
    ).toHaveLength(1);
    expect(within(header).getAllByRole("button")).toHaveLength(3); // settings, purge, tests
    expect(screen.getByText("Benchmarks idle")).toBeTruthy();
    expect(screen.getByText("0 API requests in flight")).toBeTruthy();
    expect(screen.getByText("Idle", { exact: true })).toBeTruthy();
    expect(screen.queryByText("live", { exact: true })).toBeNull();
    expect(screen.queryByText("Simulated", { exact: true })).toBeNull();
    expect(screen.getByText(/No benchmark results yet/)).toBeTruthy();
    expect(screen.getByText("No throughput measurements yet.")).toBeTruthy();
    expect(screen.getByText("No duration measurements yet.")).toBeTruthy();
    expect(isDisabled("Start benchmarks")).toBe(true);
    expect(isDisabled("Run now")).toBe(true);
    expect(isDisabled("Purge data")).toBe(true);
    await tick(20_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      document.querySelector(".animate-spin, .animate-pulse, .animate-ping"),
    ).toBeNull();
    fireEvent.click(
      within(header).getByRole("button", { name: /Server & models/ }),
    );
    expect(
      (screen.getByLabelText("API Server") as HTMLInputElement).value,
    ).toBe("http://127.0.0.1:1337/v1");
    expect(
      screen.getByText(/No models loaded. Test the connection/),
    ).toBeTruthy();
  });

  it("displays pre-dispatch errors visibly rather than leaving Run now silent", async () => {
    render(<App />);
    await connect();
    fireEvent.change(screen.getByLabelText("Ad-hoc model"), {
      target: { value: "actual-jan-model" },
    });
    fireEvent.change(screen.getByLabelText("Ad-hoc test"), {
      target: { value: "t1_code" },
    });
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new Error("Browser ID failure");
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not start the benchmark: Browser ID failure",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "No API request was sent",
    );
    expect(screen.getByText("0 API requests in flight")).toBeTruthy();
    expect(screen.getByText(/No runs yet/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1); // Only the successful connection probe.
  });

  it("can add test definitions without randomUUID on an HTTP LAN page", () => {
    vi.stubGlobal("crypto", {});
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Edit tests" }));
    fireEvent.click(screen.getByRole("button", { name: "Add test" }));
    expect(screen.getByDisplayValue("New custom test")).toBeTruthy();
    expect(
      screen
        .getByRole("switch", { name: "Enable New custom test" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a failed probe without runs, metrics, fake live indicators, or enabled run buttons", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Server & models/ }));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    });
    expect(screen.getByRole("status").textContent).toContain(
      "No new tests will run",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await tick(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/models");
    expect(isDisabled("Start benchmarks")).toBe(true);
    expect(isDisabled("Run now")).toBe(true);
    expect(screen.getByText(/No runs yet/)).toBeTruthy();
    expect(screen.getByText("Idle", { exact: true })).toBeTruthy();
  });

  it("connection only loads models; Run now requires explicit model and test choices", async () => {
    render(<App />);
    await connect();
    await tick(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isDisabled("Start benchmarks")).toBe(false);
    expect(isDisabled("Run now")).toBe(true);
    expect(screen.getByText(/No benchmark results yet/)).toBeTruthy();
    expect(screen.getByText(/No runs yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Ad-hoc model"), {
      target: { value: "actual-jan-model" },
    });
    expect(isDisabled("Run now")).toBe(true);
    fireEvent.change(screen.getByLabelText("Ad-hoc test"), {
      target: { value: "t1_code" },
    });
    expect(isDisabled("Run now")).toBe(false);

    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/chat/completions");
    expect(
      JSON.parse(fetchMock.mock.calls[1][1]!.body as string),
    ).toMatchObject({
      model: "actual-jan-model",
      messages: [{ role: "user", content: DEFAULT_TESTS[0].prompt }],
    });
    expect(screen.getByText("1 API request in flight")).toBeTruthy();
    expect(screen.getByText("1 running", { exact: true })).toBeTruthy();

    await act(async () => {
      finish(new Response("Model unloaded", { status: 503 }));
    });
    expect(screen.getByText("0 API requests in flight")).toBeTruthy();
    expect(screen.getByText("Idle", { exact: true })).toBeTruthy();
    expect(screen.getByText("HTTP 503 — Model unloaded")).toBeTruthy();
    expect(isDisabled("Run now")).toBe(true);
    await tick(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Purge data" }));
    fireEvent.click(screen.getByRole("button", { name: "Purge 1 run" }));
    expect(screen.getByText(/No runs yet/)).toBeTruthy();
    expect(screen.getByText(/No benchmark results yet/)).toBeTruthy();
    expect(isDisabled("Purge data")).toBe(true);
  });
});

describe("missing measurements aren't fabricated", () => {
  it("uses a dash, not zero, for an unmeasured stat", () => {
    render(<StatCard label="Avg Throughput" icon={Gauge} suffix="tok/s" />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("tok/s")).toBeNull();
  });

  it("does not rank untested models and does not show missing metrics as zero", () => {
    const model = { id: "reported-id", name: "Reported model" };
    const run: RunResult = {
      id: "request-id",
      modelId: model.id,
      testId: DEFAULT_TESTS[0].id,
      model,
      test: DEFAULT_TESTS[0],
      baseUrl: "/api",
      status: "success",
      queuedAt: 0,
      startedAt: 0,
      finishedAt: 100,
      durationMs: 100,
      response: "Actual response without usage",
    };
    render(
      <LeaderboardTable
        models={[model, { id: "untested", name: "Untested model" }]}
        runs={[run]}
      />,
    );
    expect(screen.queryByText("Untested model")).toBeNull();
    const row = screen.getByText("Reported model").closest("tr")!;
    expect(within(row).getAllByText("—")).toHaveLength(2); // throughput + TTFT
    expect(within(row).getByText("100 ms")).toBeTruthy();
    expect(within(row).getByText("Not reported")).toBeTruthy();
    expect(within(row).getByText("100%")).toBeTruthy();
  });
});
