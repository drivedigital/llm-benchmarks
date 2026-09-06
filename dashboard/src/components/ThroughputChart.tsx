import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ModelDef, RunResult } from "../types";

const ENGINE_COLOR: Record<string, string> = {
  "llama.cpp": "#f97316",
  mlx: "#8b5cf6",
};

export default function ThroughputChart({
  models,
  runs,
}: {
  models: ModelDef[];
  runs: RunResult[];
}) {
  const data = models
    .map((m) => {
      const successRuns = runs.filter(
        (r) => r.modelId === m.id && r.status === "success" && r.tokensPerSec,
      );
      const avg =
        successRuns.length > 0
          ? successRuns.reduce((s, r) => s + (r.tokensPerSec ?? 0), 0) / successRuns.length
          : 0;
      return {
        name: m.name.length > 22 ? `${m.name.slice(0, 21)}â¦` : m.name,
        fullName: m.name,
        engine: m.engine,
        value: Math.round(avg * 10) / 10,
        samples: successRuns.length,
      };
    })
    .filter((d) => d.samples > 0)
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-500">
        Waiting for the first completed runsâ¦
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 34)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
        barCategoryGap={10}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#ffffff1a" }}
          unit=" t/s"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={168}
          tick={{ fill: "#cbd5e1", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#ffffff1a" }}
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
          formatter={(value, _key, item) => [
            `${value} tok/s`,
            (item?.payload as { fullName?: string })?.fullName ?? "",
          ]}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
          {data.map((d) => (
            <Cell key={d.fullName} fill={ENGINE_COLOR[d.engine] ?? "#38bdf8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
