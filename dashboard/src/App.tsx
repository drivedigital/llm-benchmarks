import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Cpu,
  FlaskConical,
  Gauge,
  Hash,
  ListChecks,
  Play,
  Sparkles,
  Timer,
  Trash2,
  Zap,
} from "lucide-react";
import { useBenchSession } from "./hooks/useBenchSession";
import ConnectionPill from "./components/ConnectionPill";
import StatCard from "./components/StatCard";
import SessionProgress from "./components/SessionProgress";
import ThroughputChart from "./components/ThroughputChart";
import DurationChart from "./components/DurationChart";
import LeaderboardTable from "./components/LeaderboardTable";
import ResultFeed from "./components/ResultFeed";
import DetailDrawer from "./components/DetailDrawer";
import SettingsModal from "./components/SettingsModal";
import TestEditorModal from "./components/TestEditorModal";
import PurgeDataModal from "./components/PurgeDataModal";
import { average, measuredValues } from "./utils/metrics";
import { isRunnableTest } from "./lib/testReadiness";

export default function App() {
  const {
    models,
    tests,
    connection,
    runs,
    paused,
    pass,
    passTotal,
    passCompleted,
    canRun,
    canRunAdHoc,
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
    testConnection,
  } = useBenchSession();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testEditorOpen, setTestEditorOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [adHocModel, setAdHocModel] = useState<string>("");
  const [adHocTest, setAdHocTest] = useState<string>("");

  const stats = useMemo(() => {
    const finished = runs.filter(
      (r) => r.status === "success" || r.status === "error",
    );
    const success = runs.filter((r) => r.status === "success");
    const running = runs.filter((r) => r.status === "running");
    const avgTok = average(success.map((run) => run.tokensPerSec));
    const avgTtft = average(success.map((run) => run.ttftMs));
    const reportedTokens = measuredValues(
      success.map((run) => run.tokensGenerated),
    );
    const totalTokens = reportedTokens.length
      ? reportedTokens.reduce((sum, value) => sum + value, 0)
      : undefined;
    const successRate =
      finished.length > 0
        ? (success.length / finished.length) * 100
        : undefined;
    const activeModels = new Set(
      models.filter((m) => m.enabled !== false).map((m) => m.id),
    );
    return {
      totalRuns: finished.length,
      running: running.length,
      avgTok,
      avgTtft,
      successRate,
      totalTokens,
      activeModelCount: activeModels.size,
    };
  }, [runs, models]);

  // Results retain the model and test actually sent, even after roster edits.
  const resultModels = useMemo(
    () => [...new Map(runs.map((run) => [run.modelId, run.model])).values()],
    [runs],
  );
  const resultTests = useMemo(
    () => [...new Map(runs.map((run) => [run.testId, run.test])).values()],
    [runs],
  );
  const enabledModels = models.filter((model) => model.enabled !== false);
  const enabledTests = tests.filter(isRunnableTest);
  const selectedAdHocModel = enabledModels.find(
    (model) => model.id === adHocModel,
  );
  const selectedAdHocTest = enabledTests.find((test) => test.id === adHocTest);
  const canRunSelected =
    canRunAdHoc && !!selectedAdHocModel && !!selectedAdHocTest;
  const blockedReason =
    connection.status !== "connected"
      ? connection.status === "error"
        ? "Connection or request failed. Check Server & models before running more tests."
        : "Connect to your API server before starting benchmarks."
      : enabledModels.length === 0
        ? "Load or select a model before starting benchmarks."
        : "Enable at least one test with a complete prompt and valid inputs.";

  function handleAdHocRun() {
    if (canRunSelected && selectedAdHocModel && selectedAdHocTest) {
      runAdHoc(selectedAdHocModel.id, selectedAdHocTest.id);
    }
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute top-1/3 right-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-indigo-950/50">
              <Sparkles className="h-5.5 w-5.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                Jan Bench Analytics
              </h1>
              <p className="text-xs text-slate-500">
                Real API benchmarks · no sample data · Jan.ai
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ConnectionPill
              connection={connection}
              onClick={() => setSettingsOpen(true)}
            />
            <button
              onClick={() => setPurgeOpen(true)}
              title="Clear recorded API results and cancel in-flight requests"
              disabled={runs.length === 0}
              className="flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Purge data
            </button>
            <button
              onClick={() => setTestEditorOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              <FlaskConical className="h-3.5 w-3.5" /> Edit tests
            </button>
          </div>
        </header>

        {/* Stat cards */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Completed Runs"
            value={stats.totalRuns}
            icon={ListChecks}
            accent="from-indigo-500 to-violet-600"
            sublabel={`${stats.running} running now`}
            pulse={stats.running > 0}
          />
          <StatCard
            label="Avg Throughput"
            value={stats.avgTok}
            digits={1}
            suffix="tok/s"
            icon={Gauge}
            accent="from-cyan-500 to-blue-600"
          />
          <StatCard
            label="Avg TTFT"
            value={stats.avgTtft}
            digits={0}
            suffix="ms"
            icon={Zap}
            accent="from-amber-500 to-orange-600"
          />
          <StatCard
            label="API Success Rate"
            value={stats.successRate}
            digits={1}
            suffix="%"
            icon={Activity}
            accent="from-emerald-500 to-teal-600"
            sublabel="Request success, not answer quality"
          />
          <StatCard
            label="Selected Models"
            value={stats.activeModelCount}
            icon={Cpu}
            accent="from-fuchsia-500 to-pink-600"
            sublabel={`${models.length} in roster`}
          />
          <StatCard
            label="Tokens Reported"
            value={stats.totalTokens}
            icon={Hash}
            accent="from-slate-500 to-slate-700"
            sublabel="API completion usage only"
          />
        </div>

        {/* Session progress */}
        <div className="mb-4">
          <SessionProgress
            pass={pass}
            total={passTotal}
            completed={passCompleted}
            running={stats.running}
            paused={paused}
            canRun={canRun}
            blockedReason={blockedReason}
            onTogglePause={togglePaused}
          />
        </div>

        {/* Charts */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur xl:col-span-3">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-100">
                Throughput Leaderboard
              </h2>
              <span className="text-[11px] text-slate-500">
                avg tokens/sec, successful runs
              </span>
            </div>
            <ThroughputChart models={resultModels} runs={runs} />
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur xl:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <Timer className="h-4 w-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-slate-100">
                Test Duration Breakdown
              </h2>
            </div>
            <DurationChart tests={resultTests} runs={runs} />
          </div>
        </div>

        {/* Leaderboard table */}
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Model Leaderboard
            </h2>
            <span className="text-[11px] text-slate-500">
              click a column to sort · click a row for details
            </span>
          </div>
          <LeaderboardTable
            models={resultModels}
            runs={runs}
            onSelectModel={(modelId) => {
              const latest = runs.find((r) => r.modelId === modelId);
              if (latest) setSelectedRunId(latest.id);
            }}
          />
        </div>

        {/* Feed + ad-hoc runner */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur xl:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-100">
                Result Feed
              </h2>
              <span
                className={`ml-auto flex items-center gap-1 text-[11px] ${stats.running > 0 ? "text-emerald-400" : "text-slate-500"}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${stats.running > 0 ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`}
                />
                {stats.running > 0 ? `${stats.running} running` : "Idle"}
              </span>
            </div>
            <ResultFeed
              runs={runs}
              onSelect={(run) => setSelectedRunId(run.id)}
            />
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur">
              <div className="mb-3 flex items-center gap-2">
                <Play className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Run Ad-hoc Test
                </h2>
              </div>
              <p className="mb-3 text-[11px] text-slate-500">
                Trigger an immediate one-off run outside the rotation — useful
                for spot checking a newly added model.
              </p>
              <div className="space-y-2">
                <select
                  aria-label="Ad-hoc model"
                  disabled={
                    connection.status !== "connected" ||
                    enabledModels.length === 0
                  }
                  value={selectedAdHocModel?.id ?? ""}
                  onChange={(e) => setAdHocModel(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500/50"
                >
                  <option value="">Select model…</option>
                  {enabledModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Ad-hoc test"
                  disabled={
                    connection.status !== "connected" ||
                    enabledTests.length === 0
                  }
                  value={selectedAdHocTest?.id ?? ""}
                  onChange={(e) => setAdHocTest(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500/50"
                >
                  <option value="">Select test…</option>
                  {enabledTests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAdHocRun}
                  disabled={!canRunSelected}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5" /> Run now
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {!canRun
                  ? blockedReason
                  : !canRunAdHoc
                    ? "Two API requests are already in flight. Wait for one to finish."
                    : "Select a model and test. Run now sends one real API request."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">
                Roster Snapshot
              </h2>
              {models.length === 0 && (
                <p className="py-3 text-xs text-slate-500">
                  No models loaded. Connect to your API server to discover
                  models.
                </p>
              )}
              <ul className="space-y-2">
                {models.slice(0, 6).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate text-slate-300">{m.name}</span>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        m.engine === "mlx"
                          ? "bg-violet-500/10 text-violet-300"
                          : "bg-orange-500/10 text-orange-300"
                      }`}
                    >
                      {m.engine ?? "API model"}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setSettingsOpen(true)}
                className="mt-3 text-[11px] font-medium text-cyan-400 hover:text-cyan-300"
              >
                Manage full roster →
              </button>
            </div>
          </div>
        </div>

        <footer className="mt-8 pb-4 text-center text-[11px] text-slate-600">
          Jan Bench Analytics · results from real API requests only · start
          tests explicitly · missing measurements are shown as —, never
          estimated
        </footer>
      </div>

      <DetailDrawer run={selectedRun} onClose={() => setSelectedRunId(null)} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        connection={connection}
        onTestConnection={testConnection}
        models={models}
        onAddModel={addModel}
        onRemoveModel={removeModel}
        onToggleModel={toggleModelEnabled}
      />

      <TestEditorModal
        open={testEditorOpen}
        onClose={() => setTestEditorOpen(false)}
        tests={tests}
        onUpdateTest={updateTest}
        onAddTest={addTest}
        onRemoveTest={removeTest}
        onToggleTest={toggleTestEnabled}
        onReset={resetTestsToDefault}
      />

      <PurgeDataModal
        open={purgeOpen}
        onClose={() => setPurgeOpen(false)}
        runs={runs}
        onConfirm={purgeRuns}
      />
    </div>
  );
}
