import { CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";
import type { ModelDef, RunResult, TestDef } from "../types";
import { formatMs, formatRelativeTime, formatTokS } from "../utils/format";

export default function ResultFeed({
  runs,
  models,
  tests,
  onSelect,
}: {
  runs: RunResult[];
  models: ModelDef[];
  tests: TestDef[];
  onSelect: (run: RunResult) => void;
}) {
  const modelMap = new Map(models.map((m) => [m.id, m]));
  const testMap = new Map(tests.map((t) => [t.id, t]));

  return (
    <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
      {runs.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">No runs yet.</p>
      )}
      {runs.map((run) => {
        const model = modelMap.get(run.modelId);
        const test = testMap.get(run.testId);
        if (!model || !test) return null;
        return (
          <button
            key={run.id}
            onClick={() => onSelect(run)}
            className="animate-feedin group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-white/15 hover:bg-white/[0.06]"
          >
            <div className="shrink-0">
              {run.status === "running" && (
                <Loader2 className="h-4.5 w-4.5 animate-spin text-cyan-400" />
              )}
              {run.status === "success" && (
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
              )}
              {run.status === "error" && <XCircle className="h-4.5 w-4.5 text-rose-400" />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-slate-100">{model.name}</p>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
                    test.category === "vision"
                      ? "bg-fuchsia-500/10 text-fuchsia-300"
                      : "bg-sky-500/10 text-sky-300"
                  }`}
                >
                  {test.code}
                </span>
              </div>
              {run.status === "running" ? (
                <div className="mt-1.5 h-2.5 w-40 max-w-full overflow-hidden rounded-full shimmer" />
              ) : run.status === "error" ? (
                <p className="mt-0.5 truncate text-[12px] text-rose-400/80">{run.error}</p>
              ) : (
                <p className="mt-0.5 truncate text-[12px] text-slate-500">
                  {formatTokS(run.tokensPerSec)} \u00b7 {formatMs(run.durationMs)} \u00b7{" "}
                  {run.tokensGenerated?.toLocaleString()} tok
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 text-right">
              <span className="text-[11px] text-slate-500">
                {formatRelativeTime(run.finishedAt ?? run.startedAt ?? run.queuedAt)}
              </span>
              <ChevronRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
