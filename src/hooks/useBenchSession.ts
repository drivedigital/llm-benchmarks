import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MODELS } from "../data/models";
import { DEFAULT_TESTS } from "../data/tests";
import { nextId, simulateOutcome } from "../lib/simulator";
import type { ConnectionState, ModelDef, RunResult, TestDef } from "../types";

const MAX_CONCURRENT = 2;
const MAX_RUNS_KEPT = 400;
const TIME_SCALE = 0.16; // compress simulated wall-clock durations for a lively feed

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildMatrix(models: ModelDef[], tests: TestDef[]) {
  const enabledModels = models.filter((m) => m.enabled !== false);
  const enabledTests = tests.filter((t) => t.enabled !== false);
  const combos: { modelId: string; testId: string }[] = [];
  enabledModels.forEach((m) => {
    enabledTests.forEach((t) => {
      combos.push({ modelId: m.id, testId: t.id });
    });
  });
  return shuffle(combos);
}

function seedInitialRuns(models: ModelDef[], tests: TestDef[]): RunResult[] {
  const combos = buildMatrix(models, tests).slice(0, 26);
  const now = Date.now();
  const runs: RunResult[] = combos.map((combo, idx) => {
    const model = models.find((m) => m.id === combo.modelId)!;
    const test = tests.find((t) => t.id === combo.testId)!;
    const outcome = simulateOutcome(model, test);
    const queuedAt = now - (combos.length - idx) * 9000 - 4000;
    const startedAt = queuedAt + 200;
    const finishedAt = startedAt + Math.max(300, outcome.durationMs * 0.2);
    return {
      id: nextId("seed"),
      modelId: combo.modelId,
      testId: combo.testId,
      status: outcome.success ? "success" : "error",
      queuedAt,
      startedAt,
      finishedAt,
      ttftMs: outcome.ttftMs,
      tokensPerSec: outcome.tokensPerSec,
      tokensGenerated: outcome.tokensGenerated,
      durationMs: outcome.durationMs,
      response: outcome.response,
      error: outcome.error,
    };
  });
  return runs.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
}

export function useBenchSession() {
  const [models, setModels] = useState<ModelDef[]>(
    () => DEFAULT_MODELS.map((m) => ({ ...m, enabled: true })),
  );
  const [tests, setTests] = useState<TestDef[]>(
    () => DEFAULT_TESTS.map((t) => ({ ...t, enabled: true })),
  );
  const [connection, setConnection] = useState<ConnectionState>({
    baseUrl: "http://127.0.0.1:1337",
    status: "connected",
    lastChecked: Date.now(),
    message: "Simulated live session \u2014 no server probe yet",
  });
  const [runs, setRuns] = useState<RunResult[]>(() =>
    seedInitialRuns(
      DEFAULT_MODELS.map((m) => ({ ...m, enabled: true })),
      DEFAULT_TESTS.map((t) => ({ ...t, enabled: true })),
    ),
  );
  const [paused, setPaused] = useState(false);
  const [pass, setPass] = useState(1);
  const [passTotal, setPassTotal] = useState(0);
  const [passCompleted, setPassCompleted] = useState(0);
  const [sessionStart] = useState(() => Date.now());

  const modelsRef = useRef(models);
  const testsRef = useRef(tests);
  const queueRef = useRef<{ modelId: string; testId: string }[]>([]);
  const runningCountRef = useRef(0);
  const pausedRef = useRef(paused);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    modelsRef.current = models;
  }, [models]);
  useEffect(() => {
    testsRef.current = tests;
  }, [tests]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Prime the queue on mount and whenever the roster changes materially.
  useEffect(() => {
    const matrix = buildMatrix(models, tests);
    queueRef.current = matrix;
    setPassTotal(matrix.length);
    setPassCompleted(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models.length, tests.length]);

  const startRun = useCallback((combo: { modelId: string; testId: string }, adHoc = false) => {
    const model = modelsRef.current.find((m) => m.id === combo.modelId);
    const test = testsRef.current.find((t) => t.id === combo.testId);
    if (!model || !test) return;

    const runId = nextId("run");
    const startedAt = Date.now();
    const runningEntry: RunResult = {
      id: runId,
      modelId: combo.modelId,
      testId: combo.testId,
      status: "running",
      queuedAt: startedAt,
      startedAt,
    };
    setRuns((prev) => [runningEntry, ...prev].slice(0, MAX_RUNS_KEPT));
    runningCountRef.current += 1;

    const outcome = simulateOutcome(model, test);
    const waitMs = Math.min(
      6500,
      Math.max(900, outcome.durationMs * TIME_SCALE),
    );

    const timeoutId = window.setTimeout(() => {
      setRuns((prev) =>
        prev.map((r) =>
          r.id === runId
            ? {
                ...r,
                status: outcome.success ? "success" : "error",
                finishedAt: Date.now(),
                ttftMs: outcome.ttftMs,
                tokensPerSec: outcome.tokensPerSec,
                tokensGenerated: outcome.tokensGenerated,
                durationMs: outcome.durationMs,
                response: outcome.response,
                error: outcome.error,
              }
            : r,
        ),
      );
      runningCountRef.current = Math.max(0, runningCountRef.current - 1);
      if (!adHoc) {
        setPassCompleted((c) => c + 1);
      }
    }, waitMs);
    timeoutsRef.current.push(timeoutId);
  }, []);

  // Main scheduler tick.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (pausedRef.current) return;
      if (queueRef.current.length === 0) {
        const matrix = buildMatrix(modelsRef.current, testsRef.current);
        queueRef.current = matrix;
        setPass((p) => p + 1);
        setPassTotal(matrix.length);
        setPassCompleted(0);
      }
      while (
        runningCountRef.current < MAX_CONCURRENT &&
        queueRef.current.length > 0
      ) {
        const combo = queueRef.current.shift()!;
        startRun(combo);
      }
    }, 1100);
    return () => window.clearInterval(interval);
  }, [startRun]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const runAdHoc = useCallback(
    (modelId: string, testId: string) => {
      startRun({ modelId, testId }, true);
    },
    [startRun],
  );

  const addModel = useCallback((partial: Partial<ModelDef> & { name: string }) => {
    const id = partial.id ?? `custom-${nextId("model")}`;
    const newModel: ModelDef = {
      id,
      name: partial.name,
      engine: partial.engine ?? "llama.cpp",
      family: partial.family ?? partial.name.split(/[-\s]/)[0] ?? "Custom",
      paramSize: partial.paramSize ?? "?",
      quant: partial.quant ?? "custom",
      baseTokPerSec: partial.baseTokPerSec ?? 30 + Math.random() * 30,
      baseTtftMs: partial.baseTtftMs ?? 250 + Math.random() * 200,
      reliability: partial.reliability ?? 0.9,
      visionCapable: partial.visionCapable ?? true,
      custom: true,
      enabled: true,
    };
    setModels((prev) => [...prev, newModel]);
    return newModel;
  }, []);

  const removeModel = useCallback((modelId: string) => {
    setModels((prev) => prev.filter((m) => m.id !== modelId));
    queueRef.current = queueRef.current.filter((c) => c.modelId !== modelId);
  }, []);

  const toggleModelEnabled = useCallback((modelId: string) => {
    setModels((prev) =>
      prev.map((m) => (m.id === modelId ? { ...m, enabled: m.enabled === false } : m)),
    );
  }, []);

  const updateTest = useCallback((testId: string, patch: Partial<TestDef>) => {
    setTests((prev) => prev.map((t) => (t.id === testId ? { ...t, ...patch } : t)));
  }, []);

  const addTest = useCallback((test: Omit<TestDef, "id"> & { id?: string }) => {
    const id = test.id ?? `custom-${nextId("test")}`;
    setTests((prev) => [...prev, { ...test, id, custom: true, enabled: true }]);
  }, []);

  const removeTest = useCallback((testId: string) => {
    setTests((prev) => prev.filter((t) => t.id !== testId));
    queueRef.current = queueRef.current.filter((c) => c.testId !== testId);
  }, []);

  const toggleTestEnabled = useCallback((testId: string) => {
    setTests((prev) =>
      prev.map((t) => (t.id === testId ? { ...t, enabled: t.enabled === false } : t)),
    );
  }, []);

  const resetTestsToDefault = useCallback(() => {
    setTests(DEFAULT_TESTS.map((t) => ({ ...t, enabled: true })));
  }, []);

  const updateBaseUrl = useCallback((url: string) => {
    setConnection((c) => ({ ...c, baseUrl: url }));
  }, []);

  const testConnection = useCallback(async (urlOverride?: string) => {
    const url = (urlOverride ?? connection.baseUrl).replace(/\/$/, "");
    setConnection((c) => ({ ...c, status: "connecting", message: "Probing server\u2026" }));
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${url}/v1/models`, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      const count = Array.isArray(data?.data) ? data.data.length : undefined;
      setConnection({
        baseUrl: url,
        status: "connected",
        lastChecked: Date.now(),
        message:
          count !== undefined
            ? `Live connection \u2014 ${count} model(s) reported`
            : "Live connection established",
      });
      return true;
    } catch (err) {
      setConnection({
        baseUrl: url,
        status: "error",
        lastChecked: Date.now(),
        message:
          err instanceof Error
            ? `Unreachable from browser (${err.message}). Running in simulated mode.`
            : "Unreachable from browser. Running in simulated mode.",
      });
      return false;
    }
  }, [connection.baseUrl]);

  const uptimeMs = useMemo(() => Date.now() - sessionStart, [sessionStart, runs]);

  return {
    models,
    tests,
    connection,
    runs,
    paused,
    pass,
    passTotal,
    passCompleted,
    uptimeMs,
    setPaused,
    runAdHoc,
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
    runningCount: runningCountRef.current,
  };
}
