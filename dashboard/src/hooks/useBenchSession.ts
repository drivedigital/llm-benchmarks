import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_TESTS } from "../data/tests";
import { DEFAULT_BASE_URL, normalizeBaseUrl } from "../lib/apiConfig";
import { probeModels, streamChatCompletion } from "../lib/liveRunner";
import { isRunnableTest } from "../lib/testReadiness";
import { createLocalId } from "../utils/id";
import type { ConnectionState, ModelDef, RunResult, TestDef } from "../types";

const MAX_CONCURRENT = 2;
const MAX_RUNS_KEPT = 400;
const LIVE_RUN_TIMEOUT_MS = 180_000;

type Combo = { modelId: string; testId: string };
type ActiveRequest = {
  controller: AbortController;
  timer: number;
  passId?: number;
};

function buildMatrix(models: ModelDef[], tests: TestDef[]): Combo[] {
  return models
    .filter((m) => m.enabled !== false)
    .flatMap((model) =>
      tests
        .filter(isRunnableTest)
        .map((test) => ({ modelId: model.id, testId: test.id })),
    );
}

export function useBenchSession() {
  // A fresh page has no roster, results, active requests, or automatic rotation.
  const [models, setModels] = useState<ModelDef[]>([]);
  const [tests, setTests] = useState<TestDef[]>(() =>
    DEFAULT_TESTS.map((t) => ({ ...t })),
  );
  const [connection, setConnection] = useState<ConnectionState>({
    baseUrl: DEFAULT_BASE_URL,
    status: "disconnected",
    message:
      "Not connected. Test the connection to load your server's models. No tests have started.",
  });
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [paused, setPaused] = useState(true);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [pass, setPass] = useState(0);
  const [passTotal, setPassTotal] = useState(0);
  const [passCompleted, setPassCompleted] = useState(0);

  const modelsRef = useRef(models);
  const testsRef = useRef(tests);
  const connectionRef = useRef(connection);
  const pausedRef = useRef(true);
  const queueRef = useRef<Combo[]>([]);
  const activeRef = useRef(new Map<string, ActiveRequest>());
  // Epochs keep purged/cancelled requests and stale probes from publishing later.
  const epochRef = useRef(0);
  const passIdRef = useRef(0);
  const probeIdRef = useRef(0);
  const probeControllerRef = useRef<AbortController | null>(null);

  const replaceModels = useCallback((next: ModelDef[]) => {
    modelsRef.current = next;
    setModels(next);
  }, []);
  const replaceTests = useCallback((next: TestDef[]) => {
    testsRef.current = next;
    setTests(next);
  }, []);
  const replaceConnection = useCallback((next: ConnectionState) => {
    connectionRef.current = next;
    setConnection(next);
  }, []);
  const pauseRotation = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const clearActive = useCallback((reason: string) => {
    epochRef.current += 1;
    const ids = new Set(activeRef.current.keys());
    activeRef.current.forEach(({ controller, timer }) => {
      window.clearTimeout(timer);
      controller.abort(reason);
    });
    activeRef.current.clear();
    return ids;
  }, []);

  const resetRotation = useCallback(() => {
    queueRef.current = [];
    passIdRef.current += 1;
    setPass(0);
    setPassTotal(0);
    setPassCompleted(0);
  }, []);

  const startRun = useCallback(
    (combo: Combo, rotationPassId?: number): boolean => {
      // All entry points, including ad-hoc runs, share these guards.
      if (
        connectionRef.current.status !== "connected" ||
        activeRef.current.size >= MAX_CONCURRENT
      )
        return false;
      const model = modelsRef.current.find(
        (m) => m.id === combo.modelId && m.enabled !== false,
      );
      const test = testsRef.current.find(
        (t) => t.id === combo.testId && isRunnableTest(t),
      );
      if (!model || !test) return false;

      // Browser capability/setup failures happen before dispatch and must not
      // silently kill the click handler or become fabricated API run results.
      let runId: string;
      let controller: AbortController;
      try {
        runId = createLocalId();
        controller = new AbortController();
      } catch (error) {
        pauseRotation();
        setExecutionError(
          `Could not start the benchmark: ${error instanceof Error ? error.message : "Unknown browser error"}. No API request was sent for this attempt. Retry or reload the dashboard.`,
        );
        return false;
      }
      setExecutionError(null);
      const startedAt = Date.now();
      const epoch = epochRef.current;
      const baseUrl = connectionRef.current.baseUrl;
      const timer = window.setTimeout(
        () => controller.abort("live-timeout"),
        LIVE_RUN_TIMEOUT_MS,
      );
      const request: ActiveRequest = {
        controller,
        timer,
        passId: rotationPassId,
      };
      activeRef.current.set(runId, request);
      const runningEntry: RunResult = {
        id: runId,
        modelId: model.id,
        testId: test.id,
        model: { ...model },
        test: { ...test, inputs: test.inputs ? [...test.inputs] : undefined },
        baseUrl,
        status: "running",
        queuedAt: startedAt,
        startedAt,
      };
      setRuns((previous) =>
        [runningEntry, ...previous].slice(0, MAX_RUNS_KEPT),
      );

      void streamChatCompletion({
        baseUrl,
        modelId: model.id,
        prompt: test.prompt,
        imageUrls: test.category === "vision" ? test.inputs : undefined,
        maxTokens: test.maxTokens,
        signal: controller.signal,
      })
        .then((outcome) => {
          if (epoch !== epochRef.current || outcome.cancelled) return;
          if (!outcome.success) {
            // Stop on a failed real request. Never silently substitute fabricated data,
            // and never continue to hammer a down or misconfigured server.
            pauseRotation();
            replaceConnection({
              ...connectionRef.current,
              status: "error",
              lastChecked: Date.now(),
              message: `Request failed (${outcome.error}). Rotation stopped. Check the server and test settings, then test the connection again.`,
            });
          }
          setRuns((previous) =>
            previous.map((run) =>
              run.id === runId
                ? {
                    ...run,
                    status: outcome.success ? "success" : "error",
                    finishedAt: Date.now(),
                    ttftMs: outcome.ttftMs,
                    tokensPerSec: outcome.tokensPerSec,
                    tokensGenerated: outcome.tokensGenerated,
                    durationMs: outcome.durationMs,
                    response: outcome.response,
                    error: outcome.error,
                  }
                : run,
            ),
          );
          if (
            rotationPassId !== undefined &&
            rotationPassId === passIdRef.current
          ) {
            setPassCompleted((count) => count + 1);
          }
        })
        .catch((error: unknown) => {
          if (epoch !== epochRef.current) return;
          // API failures normally resolve as LiveOutcome. An unexpected client
          // exception has no trustworthy result: cancel and surface it instead
          // of leaving a permanently "running" row or inventing measurements.
          controller.abort("client-error");
          if (
            rotationPassId !== undefined &&
            rotationPassId === passIdRef.current
          ) {
            queueRef.current.unshift(combo);
          }
          pauseRotation();
          setRuns((previous) => previous.filter((run) => run.id !== runId));
          setExecutionError(
            `The browser could not complete the benchmark: ${error instanceof Error ? error.message : "Unknown browser error"}. The attempt was cancelled and no result was recorded. Retry or reload the dashboard.`,
          );
        })
        .finally(() => {
          window.clearTimeout(timer);
          // An old request must not decrement the capacity of a new session after purge.
          if (activeRef.current.get(runId) === request)
            activeRef.current.delete(runId);
        });
      return true;
    },
    [pauseRotation, replaceConnection],
  );

  // The timer is just a dispatcher. It produces no results and does no work
  // until the user explicitly starts rotation with a verified connection.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (pausedRef.current || connectionRef.current.status !== "connected")
        return;
      if (activeRef.current.size >= MAX_CONCURRENT) return;
      if (queueRef.current.length === 0) {
        // Finish the current pass before incrementing or resetting progress.
        if (
          [...activeRef.current.values()].some(
            (r) => r.passId === passIdRef.current,
          )
        )
          return;
        const matrix = buildMatrix(modelsRef.current, testsRef.current);
        if (matrix.length === 0) {
          pauseRotation();
          return;
        }
        queueRef.current = matrix;
        passIdRef.current += 1;
        setPass((previous) => previous + 1);
        setPassTotal(matrix.length);
        setPassCompleted(0);
      }
      while (
        activeRef.current.size < MAX_CONCURRENT &&
        queueRef.current.length > 0
      ) {
        const combo = queueRef.current.shift()!;
        if (!startRun(combo, passIdRef.current)) {
          if (pausedRef.current) {
            // A setup error pauses rotation. Keep this combination for a user-
            // initiated retry rather than silently discarding queued tests.
            queueRef.current.unshift(combo);
            break;
          }
          // Disabled/removed models and incomplete tests are skipped, not recorded.
          setPassTotal((total) => Math.max(0, total - 1));
        }
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [pauseRotation, startRun]);

  useEffect(
    () => () => {
      clearActive("unmount");
      probeIdRef.current += 1;
      probeControllerRef.current?.abort("unmount");
    },
    [clearActive],
  );

  const togglePaused = useCallback(() => {
    if (!pausedRef.current) {
      pauseRotation(); // Already dispatched requests are allowed to finish.
    } else if (
      connectionRef.current.status === "connected" &&
      buildMatrix(modelsRef.current, testsRef.current).length > 0
    ) {
      setExecutionError(null);
      pausedRef.current = false;
      setPaused(false);
    }
  }, [pauseRotation]);

  /** Clear actual results and cancel in-flight requests, preserving the user's rotation choice. */
  const purgeRuns = useCallback(() => {
    clearActive("purge");
    resetRotation();
    setExecutionError(null);
    setRuns([]);
  }, [clearActive, resetRotation]);

  const runAdHoc = useCallback(
    (modelId: string, testId: string) => startRun({ modelId, testId }),
    [startRun],
  );

  const addModel = useCallback(
    (partial: Partial<ModelDef> & { name: string }) => {
      const id = (partial.id ?? partial.name).trim();
      if (!id) return;
      const existing = modelsRef.current.find((m) => m.id === id);
      if (existing) return existing; // Never invent an identifier the server cannot serve.
      const model: ModelDef = {
        ...partial,
        id,
        name: partial.name.trim(),
        custom: true,
        enabled: true,
      };
      replaceModels([...modelsRef.current, model]);
      return model;
    },
    [replaceModels],
  );

  const removeModel = useCallback(
    (modelId: string) => {
      replaceModels(modelsRef.current.filter((m) => m.id !== modelId));
    },
    [replaceModels],
  );

  const toggleModelEnabled = useCallback(
    (modelId: string) => {
      replaceModels(
        modelsRef.current.map((m) =>
          m.id === modelId ? { ...m, enabled: m.enabled === false } : m,
        ),
      );
    },
    [replaceModels],
  );

  const updateTest = useCallback(
    (testId: string, patch: Partial<TestDef>) => {
      replaceTests(
        testsRef.current.map((t) =>
          t.id === testId ? { ...t, ...patch, id: t.id } : t,
        ),
      );
    },
    [replaceTests],
  );

  const addTest = useCallback(
    (test: Omit<TestDef, "id"> & { id?: string }) => {
      const id = test.id ?? createLocalId();
      if (testsRef.current.some((t) => t.id === id)) return;
      replaceTests([...testsRef.current, { ...test, id, custom: true }]);
    },
    [replaceTests],
  );

  const removeTest = useCallback(
    (testId: string) => {
      replaceTests(testsRef.current.filter((t) => t.id !== testId));
    },
    [replaceTests],
  );

  const toggleTestEnabled = useCallback(
    (testId: string) => {
      replaceTests(
        testsRef.current.map((t) =>
          t.id === testId ? { ...t, enabled: t.enabled === false } : t,
        ),
      );
    },
    [replaceTests],
  );

  const resetTestsToDefault = useCallback(() => {
    replaceTests(DEFAULT_TESTS.map((t) => ({ ...t })));
  }, [replaceTests]);

  const updateBaseUrl = useCallback(
    (url: string) => {
      const baseUrl = normalizeBaseUrl(url);
      if (baseUrl === connectionRef.current.baseUrl) return;
      probeIdRef.current += 1;
      probeControllerRef.current?.abort("server-changed");
      const cancelled = clearActive("server-changed");
      setRuns((previous) =>
        previous.map((run) =>
          cancelled.has(run.id)
            ? {
                ...run,
                status: "cancelled",
                finishedAt: Date.now(),
                durationMs: Date.now() - run.startedAt,
                error: "Request cancelled because the API server changed.",
              }
            : run,
        ),
      );
      resetRotation();
      pauseRotation();
      replaceModels([]);
      replaceConnection({
        baseUrl,
        status: "disconnected",
        message:
          "Server changed. Test the connection before starting benchmarks.",
      });
    },
    [
      clearActive,
      pauseRotation,
      replaceConnection,
      replaceModels,
      resetRotation,
    ],
  );

  const testConnection = useCallback(
    async (urlOverride?: string): Promise<boolean> => {
      const baseUrl = normalizeBaseUrl(
        urlOverride ?? connectionRef.current.baseUrl,
      );
      updateBaseUrl(baseUrl);
      setExecutionError(null);
      pauseRotation();
      const probeId = ++probeIdRef.current;
      probeControllerRef.current?.abort("new-probe");
      const controller = new AbortController();
      probeControllerRef.current = controller;
      replaceConnection({
        ...connectionRef.current,
        status: "connecting",
        message:
          "Checking /v1/models. No new benchmarks will start during the check.",
      });
      try {
        const served = await probeModels(baseUrl, 4000, controller.signal);
        if (probeId !== probeIdRef.current) return false;
        replaceModels(
          served.map(
            (id) =>
              modelsRef.current.find((m) => m.id === id) ?? {
                id,
                name: id,
                enabled: true,
              },
          ),
        );
        replaceConnection({
          baseUrl,
          status: "connected",
          lastChecked: Date.now(),
          message: served.length
            ? `Connected — ${served.length} model(s) reported by the API. Choose Start benchmarks or Run now to send real requests.`
            : "Connected, but the API reports no models. Load a model in Jan, then test the connection again.",
        });
        return true;
      } catch (err) {
        if (probeId !== probeIdRef.current) return false;
        replaceConnection({
          baseUrl,
          status: "error",
          lastChecked: Date.now(),
          message: `Connection failed (${err instanceof Error ? err.message : "Unknown error"}). No new tests will run. Check that Jan's API server is enabled and reachable from the machine running this dashboard.`,
        });
        return false;
      } finally {
        if (probeId === probeIdRef.current) probeControllerRef.current = null;
      }
    },
    [pauseRotation, replaceConnection, replaceModels, updateBaseUrl],
  );

  const runningCount = runs.filter((r) => r.status === "running").length;
  const canRun =
    connection.status === "connected" && buildMatrix(models, tests).length > 0;

  return {
    models,
    tests,
    connection,
    runs,
    paused,
    executionError,
    pass,
    passTotal,
    passCompleted,
    runningCount,
    canRun,
    togglePaused,
    runAdHoc,
    purgeRuns,
    addModel,
    removeModel,
    toggleModelEnabled,
    updateTest,
    addTest,
    removeTest,
    toggleTestEnabled,
    resetTestsToDefault,
    updateBaseUrl,
    testConnection,
    canRunAdHoc: canRun && runningCount < MAX_CONCURRENT,
  };
}
