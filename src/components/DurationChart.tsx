import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RunResult, TestDef } from "../types";

export default function DurationChart({
  tests,
  runs,
}: {
  tests: TestDef[];
  runs: RunResult[];
}) {
  const data = tests.map((t) => {
    const successRuns = runs.filter(
      (r) => r.testId === t.id && r.status === "success" && r.durationMs,
    );
    const avgTtft =
      successRuns.length > 0
        ? successRuns.reduce((s, r) => s + (r.ttftMs ?? 0), 0) / successRuns.length
        : 0;
    const avgTotal =
      successRuns.length > 0
        ? successRuns.reduce((s, r) => s + (r.durationMs ?? 0), 0) / successRuns.length
        : 0;
    const avgGen = Math.max(0, avgTotal - avgTtft);
    return {
      code: t.code,
      category: t.category,
      ttft: Math.round(avgTtft),
      generation: Math.round(avgGen),
      samples: successRuns.length,
    };
  });

  const hasData = data.some((d) => d.samples > 0);
  if (!hasData) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-500">
        Waiting for the first completed runs\u2026
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
        <XAxis
          dataKey="code"
          tick={{ fill: "#cbd5e1", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#ffffff1a" }}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#ffffff1a" }}
          unit="ms"
        />
        <Tooltip
          cursor={{ fill: "#ffffff08" }}
          contentStyle={{
            background: "#0f172a",
            border: "1px solid #ffffff22",
            borderRadius: 10,
            fontSize: 12,
          }}
          labelStyle={{ color: "#f1f5f9" }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
          formatter={(v) => (v === "ttft" ? "Time to first token" : "Generation time")}
        />
        <Bar dataKey="ttft" stackId="a" fill="#22d3ee" radius={[0, 0, 0, 0]} maxBarSize={46} />
        <Bar
          dataKey="generation"
          stackId="a"
          fill="#6366f1"
          radius={[6, 6, 0, 0]}
          maxBarSize={46}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
