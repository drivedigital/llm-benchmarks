import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Cpu,
  FlaskConical,
  Gauge,
  ListChecks,
  Play,
  Settings2,
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
import type { RunResult } from "./types";
import { formatUptime } from "./utils/format";

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
    uptimeMs,
    setPaused,
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
  } = useBenchSession();

  const [selectedRun, setSelectedRun] = useState<RunResult | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testEditorOpen, setTestEditorOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [adHocModel, setAdHocModel] = useState<string>("");
  const [adHocTest, setAdHocTest] = useState<string>("");

  const stats = useMemo(() => {
    const finished = runs.filter((r) => r.status === "success" || r.status === "error");
    const success = runs.filter((r) => r.status === "success");
    const running = runs.filter((r) => r.status === "running");
    const avgTok =
      success.length > 0
        ? success.reduce((s, r) => s + (r.tokensPerSec ?? 0), 0) / success.length
        : 0;
    const avgTtft =
      success.length > 0
        ? success.reduce((s, r) => s + (r.ttftMs ?? 0), 0) / success.length
        : 0;
    const successRate = finished.length > 0 ? (success.length / finished.length) * 100 : 0;
    const activeModels = new Set(models.filter((m) => m.enabled !== false).map((m) => m.id));
    return {
      totalRuns: finished.length,
      running: running.length,
      avgTok,
      avgTtft,
      successRate,
      activeModelCount: activeModels.size,
    };
  }, [runs, models]);

  const selectedModel = selectedRun ? models.find((m) => m.id === selectedRun.modelId) : undefined;
  const selectedTest = selectedRun ? tests.find((t) => t.id === selectedRun.testId) : undefined;

  const enabledModels = models.filter((m) => m.enabled !== false);
  const enabledTests = tests.filter((t) => t.enabled !== false);

  function handleAdHocRun() {
    const modelId = adHocModel || enabledModels[0]?.id;
    const testId = adHocTest || enabledTests[0]?.id;
    if (modelId && testId) runAdHoc(modelId, testId);
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
                Real-time profiling across {models.length} local engine models Â· Jan.ai
                REST API
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ConnectionPill connection={connection} onClick={() => setSettingsOpen(true)} />
            <button
              onClick={() => setPurgeOpen(true)}
              title="Clear all recorded run results (sample + live)"
              className="flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Purge data
            </button>
            <button
              onClick={() => setTestEditorOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              <FlaskConical className="h-3.5 w-3.5" /> Edit tests
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              <Settings2 className="h-3.5 w-3.5" /> Server &amp; models
            </button>
          </div>
        </header>

        {/* Stat cards */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Total Runs"
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
            label="Success Rate"
            value={stats.successRate}
            digits={1}
            suffix="%"
            icon={Activity}
            accent="from-emerald-500 to-teal-600"
          />
          <StatCard
            label="Active Engines"
            value={stats.activeModelCount}
            icon={Cpu}
            accent="from-fuchsia-500 to-pink-600"
            sublabel={`${models.length} in roster`}
          />
          <StatCard
            label="Session Uptime"
            value={uptimeMs / 1000}
            digits={0}
            suffix="s"
            icon={Timer}
            accent="from-slate-500 to-slate-700"
            sublabel={formatUptime(uptimeMs)}
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
            onTogglePause={() => setPaused((p) => !p)}
          />
        </div>

        {/* Charts */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur xl:col-span-3">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-100">Throughput Leaderboard</h2>
              <span className="text-[11px] text-slate-500">avg tokens/sec, successful runs</span>
            </div>
            <ThroughputChart models={models} runs={runs} />
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur xl:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <Timer className="h-4 w-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-slate-100">Test Duration Breakdown</h2>
            </div>
            <DurationChart tests={tests} runs={runs} />
          </div>
        </div>

        {/* Leaderboard table */}
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-100">Model Leaderboard</h2>
            <span className="text-[11px] text-slate-500">click a column to sort Â· click a row for details</span>
          </div>
          <LeaderboardTable
            models={models}
            runs={runs}
            onSelectModel={(modelId) => {
              const latest = runs.find((r) => r.modelId === modelId);
              if (latest) setSelectedRun(latest);
            }}
          />
        </div>

        {/* Feed + ad-hoc runner */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur xl:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-100">Live Result Feed</h2>
              <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> live
              </span>
            </div>
            <ResultFeed runs={runs} models={models} tests={tests} onSelect={setSelectedRun} />
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur">
              <div className="mb-3 flex items-center gap-2">
                <Play className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-slate-100">Run Ad-hoc Test</h2>
              </div>
              <p className="mb-3 text-[11px] text-slate-500">
                Trigger an immediate one-off run outside the rotation â useful for spot
                checking a newly added model.
              </p>
              <div className="space-y-2">
                <select
                  value={adHocModel}
                  onChange={(e) => setAdHocModel(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500/50"
                >
                  <option value="">Select modelâ¦</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  value={adHocTest}
                  onChange={(e) => setAdHocTest(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500/50"
                >
                  <option value="">Select testâ¦</option>
                  {tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} â {t.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAdHocRun}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:brightness-110"
                >
                  <Play className="h-3.5 w-3.5" /> Run now
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">Roster Snapshot</h2>
              <ul className="space-y-2">
                {models.slice(0, 6).map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-slate-300">{m.name}</span>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        m.engine === "mlx"
                          ? "bg-violet-500/10 text-violet-300"
                          : "bg-orange-500/10 text-orange-300"
                      }`}
                    >
                      {m.engine}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setSettingsOpen(true)}
                className="mt-3 text-[11px] font-medium text-cyan-400 hover:text-cyan-300"
              >
                Manage full roster â
              </button>
            </div>
          </div>
        </div>

        <footer className="mt-8 pb-4 text-center text-[11px] text-slate-600">
          Jan Bench Analytics · real completions streamed whenever the server probe succeeds ·
          simulated telemetry is only an offline fallback · Purge data clears recorded results
          without touching your roster
        </footer>
      </div>

      <DetailDrawer
        run={selectedRun}
        model={selectedModel}
        test={selectedTest}
        onClose={() => setSelectedRun(null)}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        connection={connection}
        onUpdateBaseUrl={updateBaseUrl}
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
