import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBenchSession } from "../src/hooks/useBenchSession";
import {
  probeModels,
  streamChatCompletion,
  type LiveOutcome,
} from "../src/lib/liveRunner";
import { DEFAULT_BASE_URL } from "../src/lib/apiConfig";

vi.mock("../src/lib/liveRunner", () => ({
  probeModels: vi.fn(),
  streamChatCompletion: vi.fn(),
}));
const probe = vi.mocked(probeModels);
const stream = vi.mocked(streamChatCompletion);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let pending: ReturnType<typeof deferred<LiveOutcome>>[];
const measured: LiveOutcome = {
  success: true,
  response: "Actual API output",
  ttftMs: 123,
  tokensPerSec: 40,
  tokensGenerated: 20,
  durationMs: 623,
};
type Session = ReturnType<typeof useBenchSession>;
const tick = (ms = 500) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const connect = (result: { current: Session }) =>
  act(async () => {
    expect(await result.current.testConnection()).toBe(true);
  });

beforeEach(() => {
  vi.useFakeTimers();
  pending = [];
  probe.mockReset().mockResolvedValue(["actual-model"]);
  stream.mockReset().mockImplementation(() => {
    const request = deferred<LiveOutcome>();
    pending.push(request);
    return request.promise;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("real-only benchmark session", () => {
  it("starts blank and idle, including under StrictMode, with no automatic API traffic", async () => {
    const { result } = renderHook(useBenchSession, { wrapper: StrictMode });
    await tick(60_000);
    expect(result.current).toMatchObject({
      models: [],
      runs: [],
      paused: true,
      pass: 0,
      passTotal: 0,
      passCompleted: 0,
      runningCount: 0,
      canRun: false,
    });
    expect(result.current.connection).toMatchObject({
      baseUrl: "http://127.0.0.1:1337/v1",
      status: "disconnected",
    });
    expect(probe).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    act(() => {
      result.current.togglePaused();
      expect(result.current.runAdHoc("actual-model", "t1_code")).toBe(false);
    });
    await tick();
    expect(result.current.runs).toEqual([]);
  });

  it.each(["ad-hoc", "rotation"])(
    "dispatches %s requests on HTTP LAN pages without crypto.randomUUID",
    async (mode) => {
      vi.stubGlobal("crypto", {});
      const { result } = renderHook(useBenchSession);
      await connect(result);
      act(() => {
        if (mode === "ad-hoc")
          expect(result.current.runAdHoc("actual-model", "t1_code")).toBe(true);
        else result.current.togglePaused();
      });
      await tick();
      const expectedCount = mode === "ad-hoc" ? 1 : 2;
      expect(stream).toHaveBeenCalledTimes(expectedCount);
      expect(result.current.runs).toHaveLength(expectedCount);
      expect(new Set(result.current.runs.map((run) => run.id)).size).toBe(
        expectedCount,
      );
      expect(
        result.current.runs.every(
          (run) => run.id.startsWith("local-") && run.status === "running",
        ),
      ).toBe(true);
      expect(result.current.executionError).toBeNull();
      await act(async () =>
        pending.forEach((request) => request.resolve(measured)),
      );
      expect(
        result.current.runs.every(
          (run) =>
            run.status === "success" && run.response === measured.response,
        ),
      ).toBe(true);
    },
  );

  it("creates custom test IDs without secure-context crypto APIs", () => {
    vi.stubGlobal("crypto", undefined);
    const { result } = renderHook(useBenchSession);
    act(() =>
      result.current.addTest({
        code: "CUSTOM",
        name: "LAN custom test",
        category: "text",
        objective: "A real prompt",
        prompt: "Say hello",
        maxTokens: 10,
      }),
    );
    expect(
      result.current.tests.find((test) => test.name === "LAN custom test")?.id,
    ).toMatch(/^local-/);
    expect(result.current.runs).toEqual([]);
  });

  it.each(["ad-hoc", "rotation"])(
    "surfaces %s setup failures without recording fake runs or losing a queued test",
    async (mode) => {
      const { result } = renderHook(useBenchSession);
      await connect(result);
      const failingId = vi.fn(() => {
        throw new Error("Browser ID failure");
      });
      vi.stubGlobal("crypto", { randomUUID: failingId });
      act(() => {
        if (mode === "ad-hoc")
          expect(result.current.runAdHoc("actual-model", "t1_code")).toBe(
            false,
          );
        else result.current.togglePaused();
      });
      await tick(5000);
      expect(failingId).toHaveBeenCalledOnce();
      expect(result.current.executionError).toContain("Browser ID failure");
      expect(result.current.executionError).toContain(
        "No API request was sent",
      );
      expect(result.current.paused).toBe(true);
      expect(result.current.runningCount).toBe(0);
      expect(result.current.runs).toEqual([]);
      expect(stream).not.toHaveBeenCalled();
      expect(result.current.connection.status).toBe("connected");

      vi.stubGlobal("crypto", {});
      act(() => {
        if (mode === "ad-hoc")
          result.current.runAdHoc("actual-model", "t1_code");
        else result.current.togglePaused();
      });
      await tick();
      expect(result.current.executionError).toBeNull();
      expect(stream.mock.calls[0][0]).toMatchObject({
        modelId: "actual-model",
        prompt: result.current.tests[0].prompt,
      });
      if (mode === "rotation") expect(result.current.passTotal).toBe(3);
    },
  );

  it("reports unexpected client rejections, frees capacity, and ignores stale failures after purge", async () => {
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => {
      result.current.runAdHoc("actual-model", "t1_code");
    });
    const signal = stream.mock.calls[0][0].signal;
    await act(async () => {
      pending[0].reject(new Error("Unexpected browser exception"));
    });
    expect(signal.aborted).toBe(true);
    expect(result.current.paused).toBe(true);
    expect(result.current.runs).toEqual([]);
    expect(result.current.runningCount).toBe(0);
    expect(result.current.executionError).toContain(
      "Unexpected browser exception",
    );
    expect(result.current.canRunAdHoc).toBe(true);
    act(() => {
      expect(result.current.runAdHoc("actual-model", "t1_code")).toBe(true);
    });
    expect(result.current.executionError).toBeNull();
    act(() => result.current.purgeRuns());
    await act(async () => {
      pending[1].reject(new Error("Late cancelled client failure"));
    });
    expect(result.current.runs).toEqual([]);
    expect(result.current.executionError).toBeNull();
  });

  it("retries the same rotation combination after an unexpected client failure", async () => {
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => result.current.togglePaused());
    await tick();
    await act(async () => {
      pending[0].reject(new Error("Unexpected client failure"));
      pending[1].resolve(measured);
    });
    expect(result.current.paused).toBe(true);
    expect(result.current.runs).toHaveLength(1);
    expect(result.current.passCompleted).toBe(1);
    act(() => result.current.togglePaused());
    await tick();
    expect(stream.mock.calls[2][0].prompt).toBe(result.current.tests[0].prompt);
    expect(stream.mock.calls[3][0].prompt).toBe(result.current.tests[2].prompt);
    await act(async () => {
      pending[2].resolve(measured);
      pending[3].resolve(measured);
    });
    expect(result.current.runs).toHaveLength(3);
    expect(result.current.passCompleted).toBe(3);
    expect(result.current.executionError).toBeNull();
  });

  it("stays empty when the connection fails", async () => {
    probe.mockRejectedValue(new Error("Failed to fetch"));
    const { result } = renderHook(useBenchSession);
    await act(async () => {
      expect(await result.current.testConnection()).toBe(false);
    });
    await tick(60_000);
    expect(result.current.connection.status).toBe("error");
    expect(result.current.paused).toBe(true);
    expect(result.current.runs).toEqual([]);
    expect(result.current.models).toEqual([]);
    expect(result.current.pass).toBe(0);
    expect(stream).not.toHaveBeenCalled();
  });

  it("discovers only served IDs, without starting benchmarks or inventing model metadata", async () => {
    probe.mockResolvedValue([
      "Jan/server-exact-id.gguf",
      "another-served-model",
    ]);
    const { result } = renderHook(useBenchSession);
    await connect(result);
    await tick(60_000);
    expect(result.current.models).toEqual([
      {
        id: "Jan/server-exact-id.gguf",
        name: "Jan/server-exact-id.gguf",
        enabled: true,
      },
      {
        id: "another-served-model",
        name: "another-served-model",
        enabled: true,
      },
    ]);
    expect(result.current.canRun).toBe(true);
    expect(result.current.paused).toBe(true);
    expect(result.current.runs).toEqual([]);
    expect(stream).not.toHaveBeenCalled();
  });

  it("cannot start without any served models or usable tests", async () => {
    probe.mockResolvedValue([]);
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => result.current.togglePaused());
    await tick();
    expect(result.current.canRun).toBe(false);
    expect(result.current.runs).toEqual([]);
    act(() => {
      result.current.addModel({ name: "actual-model" });
      result.current.tests.forEach((test) =>
        result.current.toggleTestEnabled(test.id),
      );
      result.current.togglePaused();
    });
    await tick(5000);
    expect(result.current.canRun).toBe(false);
    expect(stream).not.toHaveBeenCalled();
  });

  it("dispatches at most two real requests, only after explicit Start", async () => {
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => result.current.togglePaused());
    await tick();
    expect(stream).toHaveBeenCalledTimes(2);
    expect(stream.mock.calls[0][0]).toMatchObject({
      baseUrl: DEFAULT_BASE_URL,
      modelId: "actual-model",
      prompt: result.current.tests[0].prompt,
      maxTokens: result.current.tests[0].maxTokens,
    });
    expect(result.current).toMatchObject({
      runningCount: 2,
      pass: 1,
      passTotal: 3,
      passCompleted: 0,
    });
    await tick(30_000);
    expect(stream).toHaveBeenCalledTimes(2);
    expect(
      result.current.runs.every(
        (run) =>
          run.status === "running" &&
          run.durationMs === undefined &&
          run.response === undefined,
      ),
    ).toBe(true);
    expect(result.current.passCompleted).toBe(0);
  });

  it("records exactly returned measurements and waits for a whole pass to finish", async () => {
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => result.current.togglePaused());
    await tick();
    await act(async () => {
      pending[0].resolve(measured);
    });
    expect(
      result.current.runs.find((run) => run.status === "success"),
    ).toMatchObject({
      response: measured.response,
      ttftMs: 123,
      tokensGenerated: 20,
      tokensPerSec: 40,
      durationMs: 623,
    });
    expect(result.current.passCompleted).toBe(1);
    await tick();
    expect(stream).toHaveBeenCalledTimes(3);
    await act(async () => {
      pending[1].resolve(measured);
    });
    await tick(2000);
    expect(result.current.pass).toBe(1);
    expect(result.current.passCompleted).toBe(2);
    expect(stream).toHaveBeenCalledTimes(3);
    await act(async () => {
      pending[2].resolve(measured);
    });
    expect(result.current.passCompleted).toBe(3);
    await tick();
    expect(result.current.pass).toBe(2);
    expect(stream).toHaveBeenCalledTimes(5);
  });

  it("stops rotation after an API failure without substituting offline telemetry", async () => {
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => result.current.togglePaused());
    await tick();
    await act(async () => {
      pending[0].resolve({
        success: false,
        errorKind: "network",
        error: "Server disconnected",
        durationMs: 21,
      });
      pending[1].resolve(measured);
    });
    await tick(60_000);
    expect(result.current.connection.status).toBe("error");
    expect(result.current.paused).toBe(true);
    expect(result.current.runningCount).toBe(0);
    expect(result.current.runs).toHaveLength(2);
    expect(
      result.current.runs.find((run) => run.status === "error"),
    ).toMatchObject({ error: "Server disconnected", tokensPerSec: undefined });
    expect(stream).toHaveBeenCalledTimes(2);
    act(() => {
      expect(result.current.runAdHoc("actual-model", "t1_code")).toBe(false);
    });
    await connect(result);
    await tick(5000);
    expect(result.current.paused).toBe(true); // Reconnection isn't consent to resume.
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it("allows explicit ad-hoc tests while paused but enforces connection, selection, and capacity", async () => {
    const { result } = renderHook(useBenchSession);
    act(() => {
      expect(result.current.runAdHoc("actual-model", "t1_code")).toBe(false);
    });
    await connect(result);
    act(() => {
      expect(result.current.runAdHoc("not-served", "t1_code")).toBe(false);
      expect(result.current.runAdHoc("actual-model", "missing-test")).toBe(
        false,
      );
      expect(result.current.runAdHoc("actual-model", "t1_code")).toBe(true);
      expect(result.current.runAdHoc("actual-model", "t2_logic")).toBe(true);
      expect(result.current.runAdHoc("actual-model", "t3_lore")).toBe(false);
    });
    await tick(5000);
    expect(stream).toHaveBeenCalledTimes(2);
    expect(result.current.pass).toBe(0);
    expect(result.current.paused).toBe(true);
    expect(result.current.canRunAdHoc).toBe(false);
  });

  it("pause prevents new requests while already-sent requests finish", async () => {
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => result.current.togglePaused());
    await tick();
    act(() => result.current.togglePaused());
    await act(async () =>
      pending.forEach((request) => request.resolve(measured)),
    );
    await tick(5000);
    expect(result.current.runningCount).toBe(0);
    expect(stream).toHaveBeenCalledTimes(2);
    expect(result.current.paused).toBe(true);
  });

  it("purge cancels old requests but preserves enabled rotation; late replies cannot corrupt new results or capacity", async () => {
    const { result } = renderHook(useBenchSession);
    await connect(result);
    const roster = result.current.models;
    const tests = result.current.tests;
    act(() => result.current.togglePaused());
    await tick();
    const oldSignals = stream.mock.calls.map(([options]) => options.signal);
    act(() => result.current.purgeRuns());
    expect(
      oldSignals.every((signal) => signal.aborted && signal.reason === "purge"),
    ).toBe(true);
    expect(result.current).toMatchObject({
      runs: [],
      paused: false,
      pass: 0,
      passTotal: 0,
      passCompleted: 0,
      runningCount: 0,
    });
    expect(result.current.models).toEqual(roster);
    expect(result.current.tests).toEqual(tests);
    expect(result.current.connection.status).toBe("connected");
    await tick();
    expect(stream).toHaveBeenCalledTimes(4);
    await act(async () => {
      pending[0].resolve(measured);
      pending[1].resolve(measured);
    });
    expect(result.current.runs).toHaveLength(2);
    expect(result.current.runs.every((run) => run.status === "running")).toBe(
      true,
    );
    expect(result.current.passCompleted).toBe(0);
    act(() => {
      expect(result.current.runAdHoc("actual-model", "t1_code")).toBe(false);
    });
    expect(stream).toHaveBeenCalledTimes(4);
  });

  it("purging an idle session leaves it empty without starting rotation", async () => {
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => {
      result.current.runAdHoc("actual-model", "t1_code");
    });
    act(() => result.current.purgeRuns());
    await act(async () => {
      pending[0].resolve(measured);
    });
    await tick(30_000);
    expect(result.current.runs).toEqual([]);
    expect(result.current.paused).toBe(true);
    expect(result.current.pass).toBe(0);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it("changing servers invalidates connection, cancels in-flight requests, and keeps their original snapshots", async () => {
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => {
      result.current.runAdHoc("actual-model", "t1_code");
    });
    const oldPrompt = result.current.runs[0].test.prompt;
    act(() => {
      result.current.updateTest("t1_code", {
        prompt: "Changed for future requests",
      });
      result.current.updateBaseUrl("/other-api");
    });
    expect(result.current.runs[0]).toMatchObject({
      status: "cancelled",
      baseUrl: DEFAULT_BASE_URL,
      test: { prompt: oldPrompt },
    });
    expect(result.current.connection).toMatchObject({
      status: "disconnected",
      baseUrl: "/other-api",
    });
    expect(result.current.models).toEqual([]);
    await act(async () => {
      pending[0].resolve(measured);
    });
    expect(result.current.runs[0].status).toBe("cancelled");
    expect(result.current.runningCount).toBe(0);
  });

  it("ignores stale connection probes that resolve after the server URL changes", async () => {
    const oldProbe = deferred<string[]>();
    const newProbe = deferred<string[]>();
    probe
      .mockReturnValueOnce(oldProbe.promise)
      .mockReturnValueOnce(newProbe.promise);
    const { result } = renderHook(useBenchSession);
    let oldAttempt!: Promise<boolean>;
    let newAttempt!: Promise<boolean>;
    act(() => {
      oldAttempt = result.current.testConnection();
    });
    act(() => {
      newAttempt = result.current.testConnection("/other-api");
    });
    await act(async () => {
      newProbe.resolve(["new-server-model"]);
      await newAttempt;
    });
    await act(async () => {
      oldProbe.resolve(["stale-server-model"]);
      expect(await oldAttempt).toBe(false);
    });
    expect(result.current.connection).toMatchObject({
      status: "connected",
      baseUrl: "/other-api",
    });
    expect(result.current.models.map((model) => model.id)).toEqual([
      "new-server-model",
    ]);
    expect(result.current.runs).toEqual([]);
  });

  it("does not invent IDs or performance profiles for duplicate manual models", () => {
    const { result } = renderHook(useBenchSession);
    act(() => {
      result.current.addModel({ name: "exact-id" });
      result.current.addModel({ name: " exact-id " });
    });
    expect(result.current.models).toEqual([
      { id: "exact-id", name: "exact-id", custom: true, enabled: true },
    ]);
    expect(result.current.runs).toEqual([]);
    expect(stream).not.toHaveBeenCalled();
  });

  it("skips models disabled after a pass was queued instead of testing them anyway", async () => {
    probe.mockResolvedValue(["actual-model", "do-not-run"]);
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => result.current.togglePaused());
    await tick();
    act(() => result.current.toggleModelEnabled("do-not-run"));
    await act(async () => {
      pending[0].resolve(measured);
      pending[1].resolve(measured);
    });
    await tick();
    expect(
      stream.mock.calls.every(
        ([options]) => options.modelId === "actual-model",
      ),
    ).toBe(true);
    expect(result.current.passTotal).toBe(3);
  });

  it("does not send pretend vision inputs, but forwards actual image URLs", async () => {
    const { result } = renderHook(useBenchSession);
    await connect(result);
    act(() => {
      result.current.addTest({
        id: "vision",
        code: "VISION",
        name: "Image test",
        category: "vision",
        prompt: "Describe this image",
        maxTokens: 40,
        objective: "Image understanding",
        inputs: ["Photo/img_01.jpg"],
      });
      expect(result.current.runAdHoc("actual-model", "vision")).toBe(false);
      result.current.updateTest("vision", {
        inputs: ["https://example.com/image.png"],
      });
      expect(result.current.runAdHoc("actual-model", "vision")).toBe(true);
    });
    expect(stream).toHaveBeenCalledTimes(1);
    expect(stream.mock.calls[0][0].imageUrls).toEqual([
      "https://example.com/image.png",
    ]);
  });

  it("unmount aborts actual requests and prevents later dispatches", async () => {
    const { result, unmount } = renderHook(useBenchSession);
    await connect(result);
    act(() => result.current.togglePaused());
    await tick();
    const signals = stream.mock.calls.map(([options]) => options.signal);
    unmount();
    expect(
      signals.every((signal) => signal.aborted && signal.reason === "unmount"),
    ).toBe(true);
    await tick(60_000);
    expect(stream).toHaveBeenCalledTimes(2);
  });
});
