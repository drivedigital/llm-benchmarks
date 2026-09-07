import type { LucideIcon } from "lucide-react";

export default function StatCard({
  label,
  value,
  suffix = "",
  digits = 0,
  icon: Icon,
  accent = "from-violet-500 to-indigo-500",
  sublabel,
  pulse,
}: {
  label: string;
  value?: number;
  suffix?: string;
  digits?: number;
  icon: LucideIcon;
  accent?: string;
  sublabel?: string;
  pulse?: boolean;
}) {
  const hasValue = value !== undefined && Number.isFinite(value);
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-lg shadow-black/20 backdrop-blur transition hover:border-white/20">
      <div
        className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-2xl transition group-hover:opacity-30`}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${accent} text-white shadow-md`}
        >
          <Icon className="h-3.5 w-3.5" />
          {pulse && (
            <span className="absolute right-3 top-3 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          )}
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-mono text-2xl font-semibold tabular-nums text-white">
          {hasValue ? value.toFixed(digits) : "—"}
        </span>
        {hasValue && suffix && (
          <span className="text-xs font-medium text-slate-400">{suffix}</span>
        )}
      </div>
      {sublabel && (
        <p className="mt-1 text-[11px] text-slate-500">{sublabel}</p>
      )}
    </div>
  );
}
