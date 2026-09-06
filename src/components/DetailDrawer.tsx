import { useEffect } from "react";
import {
  CheckCircle2,
  Clock3,
  Cpu,
  Gauge,
  Hash,
  Loader2,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import type { ModelDef, RunResult, TestDef } from "../types";
import { formatMs, formatTokS } from "../utils/format";

export default function DetailDrawer({
  run,
  model,
  test,
  onClose,
}: {
  run: RunResult | null;
  model?: ModelDef;
  test?: TestDef;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const open = !!run;

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#0a0e1a] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {run && model && test && (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {run.status === "running" && (
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  )}
                  {run.status === "success" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  )}
                  {run.status === "error" && <XCircle className="h-4 w-4 text-rose-400" />}
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                    {test.code}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      test.category === "vision"
                        ? "bg-fuchsia-500/10 text-fuchsia-300"
                        : "bg-sky-500/10 text-sky-300"
                    }`}
                  >
                    {test.category}
                  </span>
                </div>
                <h3 className="mt-1.5 truncate text-lg font-semibold text-white">
                  {model.name}
                </h3>
                <p className="truncate text-sm text-slate-400">{test.name}</p>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 border-b border-white/10 p-5 sm:grid-cols-4">
              <Metric icon={Zap} label="TTFT" value={formatMs(run.ttftMs)} />
              <Metric icon={Gauge} label="Throughput" value={formatTokS(run.tokensPerSec)} />
              <Metric icon={Clock3} label="Duration" value={formatMs(run.durationMs)} />
              <Metric
                icon={Hash}
                label="Tokens"
                value={run.tokensGenerated?.toLocaleString() ?? "\u2014"}
              />
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Cpu className="h-3.5 w-3.5" /> Prompt
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm leading-relaxed text-slate-300">
                  {test.prompt}
                  {test.inputs && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {test.inputs.map((input) => (
                        <span
                          key={input}
                          className="rounded-md bg-fuchsia-500/10 px-1.5 py-0.5 font-mono text-[11px] text-fuchsia-300"
                        >
                          {input}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Response
                </div>
                {run.status === "running" && (
                  <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    {[100, 92, 96, 70, 84].map((w, i) => (
                      <div
                        key={i}
                        className="h-3 rounded shimmer"
                        style={{ width: `${w}%` }}
                      />
                    ))}
                  </div>
                )}
                {run.status === "error" && (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-300">
                    {run.error}
                  </div>
                )}
                {run.status === "success" && (
                  <pre className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[12.5px] leading-relaxed text-slate-300">
                    {run.response}
                  </pre>
                )}
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Objective
                </div>
                <p className="text-sm text-slate-400">{test.objective}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-0.5 font-mono text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}
