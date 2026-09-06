import { useState } from "react";
import { CheckCircle2, Plug, Plus, Trash2, Wifi } from "lucide-react";
import Modal from "./Modal";
import type { ConnectionState, ModelDef } from "../types";

export default function SettingsModal({
  open,
  onClose,
  connection,
  onUpdateBaseUrl,
  onTestConnection,
  models,
  onAddModel,
  onRemoveModel,
  onToggleModel,
}: {
  open: boolean;
  onClose: () => void;
  connection: ConnectionState;
  onUpdateBaseUrl: (url: string) => void;
  onTestConnection: (url?: string) => Promise<boolean>;
  models: ModelDef[];
  onAddModel: (m: Partial<ModelDef> & { name: string }) => void;
  onRemoveModel: (id: string) => void;
  onToggleModel: (id: string) => void;
}) {
  const [urlDraft, setUrlDraft] = useState(connection.baseUrl);
  const [testing, setTesting] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newEngine, setNewEngine] = useState<"llama.cpp" | "mlx">("mlx");
  const [newVision, setNewVision] = useState(false);

  async function handleTest() {
    setTesting(true);
    onUpdateBaseUrl(urlDraft);
    await onTestConnection(urlDraft);
    setTesting(false);
  }

  function handleAddModel() {
    if (!newModelName.trim()) return;
    onAddModel({
      name: newModelName.trim(),
      engine: newEngine,
      visionCapable: newVision,
    });
    setNewModelName("");
  }

  return (
    <Modal open={open} onClose={onClose} title="Server & Roster Settings" icon={<Plug className="h-4 w-4" />} wide>
      <div className="space-y-8">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">API Server</h3>
          <p className="mb-3 text-xs text-slate-500">
            Point this dashboard at any OpenAI-compatible REST endpoint (Jan, llama.cpp, LM
            Studio, vLLM…). The default <code className="rounded bg-white/10 px-1">/api</code> is
            proxied by the dev server to your benchmark API, which avoids browser CORS issues —
            retarget it by launching with{" "}
            <code className="rounded bg-white/10 px-1">API_UPSTREAM=http://your-host:port</code>.
            Once a probe succeeds, every rotation and ad-hoc run executes a real streamed
            completion; the simulator is only the offline fallback.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="/api — or an absolute URL, e.g. http://127.0.0.1:1337"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
            >
              <Wifi className="h-4 w-4" />
              {testing ? "Testingâ¦" : "Test connection"}
            </button>
          </div>
          <p
            className={`mt-2 text-xs ${
              connection.status === "connected"
                ? "text-emerald-400"
                : connection.status === "error"
                  ? "text-rose-400"
                  : "text-slate-500"
            }`}
          >
            {connection.message}
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">Model Roster</h3>
          <p className="mb-3 text-xs text-slate-500">
            Toggle which engines participate in the live benchmark rotation, or remove custom
            entries you added for one-off testing.
          </p>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {models.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    onClick={() => onToggleModel(m.id)}
                    className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
                      m.enabled !== false ? "bg-emerald-500/70 justify-end" : "bg-white/10 justify-start"
                    }`}
                  >
                    <span className="h-4 w-4 rounded-full bg-white shadow" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{m.name}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {m.engine} Â· {m.paramSize}
                      {m.visionCapable ? " Â· vision" : ""}
                      {m.custom ? " Â· custom" : ""}
                    </p>
                  </div>
                </div>
                {m.custom && (
                  <button
                    onClick={() => onRemoveModel(m.id)}
                    className="shrink-0 rounded-md p-1.5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            Test a model outside the current roster
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Enter the exact model identifier your server reports under{" "}
            <code className="rounded bg-white/10 px-1">/v1/models</code> — it becomes the{" "}
            <code className="rounded bg-white/10 px-1">model</code> field of every completion
            request. The entry joins the live rotation immediately and, while connected, gets
            benchmarked with real completions.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <input
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="e.g. Qwen2.5-VL-7B-Instruct-4bit"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            />
            <select
              value={newEngine}
              onChange={(e) => setNewEngine(e.target.value as "llama.cpp" | "mlx")}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            >
              <option value="mlx">mlx</option>
              <option value="llama.cpp">llama.cpp</option>
            </select>
            <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={newVision}
                onChange={(e) => setNewVision(e.target.checked)}
                className="h-3.5 w-3.5 accent-cyan-500"
              />
              vision
            </label>
            <button
              onClick={handleAddModel}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </section>

        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Newly added models are enrolled in the next scheduler pass automatically.
        </div>
      </div>
    </Modal>
  );
}
