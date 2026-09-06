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
  const simulated = runs.filter((r) => r.simulated).length;
  const live = runs.length - simulated;
  const inFlight = runs.filter((r) => r.status === "running").length;

  function handleConfirm() {
    onConfirm();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Purge all run data?"
      icon={<Trash2 className="h-4 w-4 text-rose-400" />}
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-300">
          {runs.length === 0
            ? "There are no recorded results right now — nothing to purge."
            : null}
          {runs.length > 0 ? (
            <>
              This permanently clears{" "}
              <span className="font-semibold text-white">{runs.length}</span> recorded result
              {runs.length === 1 ? "" : "s"}
              {simulated > 0 && live > 0 ? (
                <>
                  {" "}— <span className="text-amber-300">{simulated} sample/simulated</span>
                  {" "}and <span className="text-emerald-300">{live} live</span>
                </>
              ) : null}
              {simulated > 0 && live === 0 ? " (all sample/simulated data)" : null}
              {simulated === 0 && live > 0 ? " (all live API data)" : null}
              {" "}— resetting the stat cards, charts, leaderboard, and result feed to zero.
            </>
          ) : null}
        </p>

        {inFlight > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {inFlight} run{inFlight === 1 ? " is" : "s are"} currently in flight and will be
            aborted immediately.
          </div>
        )}

        <ul className="space-y-1.5 text-xs text-slate-500">
          <li className="flex gap-2">
            <span className="text-emerald-400">✓</span>
            Model roster and test suite are not touched.
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-400">✓</span>
            Server URL and connection state are preserved.
          </li>
          <li className="flex gap-2">
            <span className="text-cyan-400">i</span>
            The scheduler keeps collecting new results after purging — pause it first if you
            want the board to stay empty.
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
            onClick={handleConfirm}
            disabled={runs.length === 0}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Purge {runs.length > 0 ? `${runs.length} result${runs.length === 1 ? "" : "s"}` : "data"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
