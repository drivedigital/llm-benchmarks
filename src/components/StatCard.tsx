import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

function useAnimatedNumber(target: number, duration = 700) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    const from = value;
    const delta = target - from;
    if (Math.abs(delta) < 0.001) {
      setValue(target);
      return;
    }
    function step(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const progress = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(from + delta * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    }
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

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
  value: number;
  suffix?: string;
  digits?: number;
  icon: LucideIcon;
  accent?: string;
  sublabel?: string;
  pulse?: boolean;
}) {
  const animated = useAnimatedNumber(value);

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
          {animated.toFixed(digits)}
        </span>
        {suffix && <span className="text-xs font-medium text-slate-400">{suffix}</span>}
      </div>
      {sublabel && <p className="mt-1 text-[11px] text-slate-500">{sublabel}</p>}
    </div>
  );
}
