import { Activity, Pause, Play, RefreshCw } from "lucide-react";

export default function SessionProgress({
  pass,
  total,
  completed,
  running,
  paused,
  onTogglePause,
}: {
  pass: number;
  total: number;
  completed: number;
  running: number;
  paused: boolean;
  onTogglePause: () => void;
}) {
  const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">
              Session Pass #{pass}
            </p>
            <p className="text-[11px] text-slate-500">
              {completed}/{total} combinations complete Â· {running} running now
            </p>
          </div>
        </div>
        <button
          onClick={onTogglePause}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <RefreshCw className={`h-3 w-3 ${paused ? "" : "animate-spin"}`} style={{ animationDuration: "3s" }} />
          {paused ? "Scheduler paused" : "Continuously cycling model Ã test matrix"}
        </span>
        <span>{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
