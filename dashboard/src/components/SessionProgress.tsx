import { Activity, Pause, Play, RefreshCw } from "lucide-react";

export default function SessionProgress({
  pass,
  total,
  completed,
  running,
  paused,
  canRun,
  blockedReason,
  onTogglePause,
}: {
  pass: number;
  total: number;
  completed: number;
  running: number;
  paused: boolean;
  canRun: boolean;
  blockedReason: string;
  onTogglePause: () => void;
}) {
  const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  const title =
    pass > 0
      ? `Session pass #${pass}`
      : running > 0
        ? "Ad-hoc test running"
        : "Benchmarks idle";
  const status = !canRun
    ? blockedReason
    : paused
      ? running > 0
        ? "Rotation paused. In-flight API requests are finishing."
        : "No tests are running. Start a benchmark when ready."
      : running > 0
        ? "Sending real requests to your API server."
        : "Ready to send the next test request.";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">{title}</p>
            <p className="text-[11px] text-slate-500">
              {pass > 0 ? `${completed}/${total} combinations complete · ` : ""}
              {running} API request{running === 1 ? "" : "s"} in flight
            </p>
          </div>
        </div>
        <button
          onClick={onTogglePause}
          disabled={paused && !canRun}
          title={paused && !canRun ? blockedReason : undefined}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {paused ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
          {paused
            ? pass > 0
              ? "Resume benchmarks"
              : "Start benchmarks"
            : "Pause rotation"}
        </button>
      </div>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5"
        role="progressbar"
        aria-label="Benchmark pass progress"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <RefreshCw
            className={`h-3 w-3 shrink-0 ${running > 0 ? "animate-spin" : ""}`}
            style={{ animationDuration: "3s" }}
          />
          {status}
        </span>
        <span>{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
