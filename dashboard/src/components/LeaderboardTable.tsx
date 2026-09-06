import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Cpu } from "lucide-react";
import type { ModelDef, RunResult } from "../types";
import { formatMs, formatTokS } from "../utils/format";

type SortKey =
  | "name"
  | "engine"
  | "runs"
  | "tokPerSec"
  | "ttft"
  | "duration"
  | "successRate";

interface Row {
  model: ModelDef;
  runs: number;
  tokPerSec: number;
  ttft: number;
  duration: number;
  successRate: number;
}

export default function LeaderboardTable({
  models,
  runs,
  onSelectModel,
}: {
  models: ModelDef[];
  runs: RunResult[];
  onSelectModel?: (modelId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("tokPerSec");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const rows = useMemo<Row[]>(() => {
    return models.map((model) => {
      const modelRuns = runs.filter((r) => r.modelId === model.id && r.status !== "queued");
      const finished = modelRuns.filter((r) => r.status === "success" || r.status === "error");
      const successRuns = modelRuns.filter((r) => r.status === "success");
      const avg = (fn: (r: RunResult) => number | undefined) => {
        const vals = successRuns.map(fn).filter((v): v is number => v !== undefined);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };
      return {
        model,
        runs: finished.length,
        tokPerSec: avg((r) => r.tokensPerSec),
        ttft: avg((r) => r.ttftMs),
        duration: avg((r) => r.durationMs),
        successRate: finished.length ? (successRuns.length / finished.length) * 100 : 0,
      };
    });
  }, [models, runs]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "name":
          av = a.model.name;
          bv = b.model.name;
          return sortDir * av.localeCompare(bv);
        case "engine":
          av = a.model.engine;
          bv = b.model.engine;
          return sortDir * av.localeCompare(bv);
        default:
          av = a[sortKey];
          bv = b[sortKey];
          return sortDir * ((av as number) - (bv as number));
      }
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  const columns: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "name", label: "Model" },
    { key: "engine", label: "Engine" },
    { key: "runs", label: "Runs", align: "right" },
    { key: "tokPerSec", label: "Avg tok/s", align: "right" },
    { key: "ttft", label: "Avg TTFT", align: "right" },
    { key: "duration", label: "Avg duration", align: "right" },
    { key: "successRate", label: "Success", align: "right" },
  ];

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-400">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className={`cursor-pointer select-none py-2.5 pr-3 font-medium transition hover:text-slate-200 ${col.align === "right" ? "text-right" : ""}`}
              >
                <span className={`inline-flex items-center gap-1 ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                  {col.label}
                  <SortIcon col={col.key} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr
              key={row.model.id}
              onClick={() => onSelectModel?.(row.model.id)}
              className="cursor-pointer border-b border-white/5 transition hover:bg-white/[0.04]"
            >
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                      idx === 0
                        ? "bg-amber-400/20 text-amber-300"
                        : idx === 1
                          ? "bg-slate-300/20 text-slate-200"
                          : idx === 2
                            ? "bg-orange-700/20 text-orange-300"
                            : "bg-white/5 text-slate-500"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-100">{row.model.name}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {row.model.family} Â· {row.model.paramSize} Â· {row.model.quant}
                    </p>
                  </div>
                </div>
              </td>
              <td className="py-2.5 pr-3">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    row.model.engine === "mlx"
                      ? "bg-violet-500/10 text-violet-300"
                      : "bg-orange-500/10 text-orange-300"
                  }`}
                >
                  <Cpu className="h-3 w-3" />
                  {row.model.engine}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-slate-300">{row.runs}</td>
              <td className="py-2.5 pr-3 text-right font-mono text-slate-200">
                {formatTokS(row.tokPerSec)}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-slate-300">
                {formatMs(row.ttft)}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-slate-300">
                {formatMs(row.duration)}
              </td>
              <td className="py-2.5 pr-3 text-right">
                <span
                  className={`font-mono ${
                    row.successRate >= 90
                      ? "text-emerald-400"
                      : row.successRate >= 60
                        ? "text-amber-400"
                        : "text-rose-400"
                  }`}
                >
                  {row.successRate.toFixed(0)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
