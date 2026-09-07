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
import { average } from "../utils/metrics";

export default function DurationChart({
  tests,
  runs,
}: {
  tests: TestDef[];
  runs: RunResult[];
}) {
  const data = tests
    .map((test) => {
      const measured = runs.filter(
        (run) =>
          run.testId === test.id &&
          run.status === "success" &&
          run.durationMs !== undefined,
      );
      const total = average(measured.map((run) => run.durationMs));
      // Do not portray missing TTFTs as zero-latency measurements. Show the
      // measured total only if a complete breakdown is not available.
      const hasBreakdown =
        measured.length > 0 &&
        measured.every((run) => run.ttftMs !== undefined);
      const ttft = hasBreakdown
        ? average(measured.map((run) => run.ttftMs))
        : undefined;
      return {
        code: test.code,
        ttft: ttft === undefined ? undefined : Math.round(ttft),
        generation:
          ttft !== undefined && total !== undefined
            ? Math.round(Math.max(0, total - ttft))
            : undefined,
        total:
          !hasBreakdown && total !== undefined ? Math.round(total) : undefined,
        samples: measured.length,
      };
    })
    .filter((entry) => entry.samples > 0);

  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-500">
        No duration measurements yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#ffffff12"
          vertical={false}
        />
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
          formatter={(value) =>
            value === "ttft"
              ? "Time to first token"
              : value === "generation"
                ? "Time after first token"
                : "Total (TTFT unavailable)"
          }
        />
        <Bar dataKey="ttft" stackId="a" fill="#22d3ee" maxBarSize={46} />
        <Bar
          dataKey="generation"
          stackId="a"
          fill="#6366f1"
          radius={[6, 6, 0, 0]}
          maxBarSize={46}
        />
        <Bar
          dataKey="total"
          stackId="a"
          fill="#94a3b8"
          radius={[6, 6, 0, 0]}
          maxBarSize={46}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
