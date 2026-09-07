import { AlertTriangle, Trash2 } from "lucide-react";
import Modal from "./Modal";
import type { RunResult } from "../types";

export default function PurgeDataModal({
  open,
  onClose,
  runs,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  runs: RunResult[];
  onConfirm: () => void;
}) {
  const inFlight = runs.filter((run) => run.status === "running").length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Purge all run data?"
      icon={<Trash2 className="h-4 w-4 text-rose-400" />}
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-300">
          {runs.length === 0 ? (
            "There are no recorded results to purge."
          ) : (
            <>
              This permanently clears{" "}
              <span className="font-semibold text-white">{runs.length}</span>{" "}
              API run{runs.length === 1 ? "" : "s"}, resetting benchmark
              metrics, charts, the leaderboard, and the result feed.
            </>
          )}
        </p>
        {inFlight > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {inFlight} in-flight request{inFlight === 1 ? "" : "s"} will be
            cancelled.
          </div>
        )}
        <ul className="space-y-1.5 text-xs text-slate-400">
          <li>
            Model roster, test definitions, and server settings are preserved.
          </li>
          <li>
            If you already started rotation, it continues with fresh real API
            requests. Pause rotation first if you want the dashboard to stay
            empty.
          </li>
        </ul>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            disabled={runs.length === 0}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Purge {runs.length} run
            {runs.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
