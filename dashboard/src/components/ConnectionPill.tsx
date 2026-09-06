import { Radio, Loader2, AlertTriangle, WifiOff } from "lucide-react";
import type { ConnectionState } from "../types";

export default function ConnectionPill({
  connection,
  onClick,
}: {
  connection: ConnectionState;
  onClick: () => void;
}) {
  const styles: Record<ConnectionState["status"], string> = {
    connected: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
    connecting: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
    error: "bg-rose-500/10 text-rose-400 ring-rose-500/30",
    disconnected: "bg-slate-500/10 text-slate-400 ring-slate-500/30",
  };

  const icon = {
    connected: <Radio className="h-3.5 w-3.5" />,
    connecting: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    error: <AlertTriangle className="h-3.5 w-3.5" />,
    disconnected: <WifiOff className="h-3.5 w-3.5" />,
  }[connection.status];

  const label = {
    connected: "Live",
    connecting: "Connecting",
    error: "Simulated",
    disconnected: "Offline",
  }[connection.status];

  return (
    <button
      onClick={onClick}
      title={connection.message}
      className={`group flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition hover:ring-2 ${styles[connection.status]}`}
    >
      <span className="relative flex h-2 w-2">
        {connection.status === "connected" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            connection.status === "connected"
              ? "bg-emerald-400"
              : connection.status === "connecting"
                ? "bg-amber-400"
                : connection.status === "error"
                  ? "bg-rose-400"
                  : "bg-slate-400"
          }`}
        />
      </span>
      {icon}
      <span>{label}</span>
      <span className="hidden font-mono text-[10px] text-current/70 sm:inline">
        {connection.baseUrl}
      </span>
    </button>
  );
}
