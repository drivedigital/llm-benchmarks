import { AlertTriangle, Loader2, Settings2, Wifi, WifiOff } from "lucide-react";
import type { ConnectionState } from "../types";

/** The single header entry point for server settings and the model roster. */
export default function ConnectionPill({
  connection,
  onClick,
}: {
  connection: ConnectionState;
  onClick: () => void;
}) {
  const styles = {
    connected: "text-emerald-400",
    connecting: "text-amber-400",
    error: "text-rose-400",
    disconnected: "text-slate-400",
  }[connection.status];
  const Icon = {
    connected: Wifi,
    connecting: Loader2,
    error: AlertTriangle,
    disconnected: WifiOff,
  }[connection.status];
  const label = {
    connected: "Connected",
    connecting: "Checking",
    error: "Connection error",
    disconnected: "Not connected",
  }[connection.status];

  return (
    <button
      onClick={onClick}
      title={`${connection.baseUrl} — ${connection.message ?? label}`}
      className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
    >
      <Settings2 className="h-3.5 w-3.5" />
      <span>Server &amp; models</span>
      <span
        className={`flex items-center gap-1.5 border-l border-white/10 pl-2 ${styles}`}
      >
        <Icon
          className={`h-3.5 w-3.5 ${connection.status === "connecting" ? "animate-spin" : ""}`}
        />
        {label}
      </span>
    </button>
  );
}
