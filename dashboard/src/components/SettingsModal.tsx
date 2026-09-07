import { useEffect, useState } from "react";
import { Info, Plug, Plus, Trash2, Wifi } from "lucide-react";
import Modal from "./Modal";
import { DEFAULT_BASE_URL, JAN_BASE_URL } from "../lib/apiConfig";
import type { ConnectionState, Engine, ModelDef } from "../types";

export default function SettingsModal({
  open,
  onClose,
  connection,
  onTestConnection,
  models,
  onAddModel,
  onRemoveModel,
  onToggleModel,
}: {
  open: boolean;
  onClose: () => void;
  connection: ConnectionState;
  onTestConnection: (url?: string) => Promise<boolean>;
  models: ModelDef[];
  onAddModel: (model: Partial<ModelDef> & { name: string }) => void;
  onRemoveModel: (id: string) => void;
  onToggleModel: (id: string) => void;
}) {
  const [urlDraft, setUrlDraft] = useState(connection.baseUrl);
  const [newModelName, setNewModelName] = useState("");
  const [newEngine, setNewEngine] = useState<Engine | "">("");
  useEffect(() => {
    if (open) setUrlDraft(connection.baseUrl);
  }, [open, connection.baseUrl]);
  const testing = connection.status === "connecting";
  const duplicate = models.some((m) => m.id === newModelName.trim());

  function handleAddModel() {
    if (!newModelName.trim() || duplicate) return;
    onAddModel({ name: newModelName.trim(), engine: newEngine || undefined });
    setNewModelName("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Server & models"
      icon={<Plug className="h-4 w-4" />}
      wide
    >
      <div className="space-y-7">
        <section>
          <label
            htmlFor="api-server"
            className="mb-2 block text-sm font-semibold text-slate-200"
          >
            API Server
          </label>
          <p className="mb-3 text-xs leading-relaxed text-slate-400">
            Jan's default local API is{" "}
            <code className="rounded bg-white/10 px-1">{JAN_BASE_URL}</code>{" "}
            (HTTP, not HTTPS). Enable the API server in Jan, then test the
            connection to load its model list. Connecting does not start
            benchmarks.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="api-server"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder={JAN_BASE_URL}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={() => void onTestConnection(urlDraft)}
              disabled={testing || !urlDraft.trim()}
              className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Wifi className="h-4 w-4" />{" "}
              {testing ? "Checking…" : "Test connection"}
            </button>
          </div>
          <p
            role="status"
            className={`mt-2 text-xs ${connection.status === "connected" ? "text-emerald-400" : connection.status === "error" ? "text-rose-400" : "text-slate-400"}`}
          >
            {connection.message}
          </p>
          <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-slate-500">
            Browser requests use the same-origin <code>/api</code> proxy,
            currently targeting <code>{DEFAULT_BASE_URL}</code>. To change its
            target, restart the dashboard with{" "}
            <code>API_UPSTREAM=http://your-host:1337/v1 npm run dev</code>. The
            proxy must be able to reach Jan from the machine hosting the
            dashboard; this hosted preview cannot reach Jan on your computer's
            loopback address.
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            Model Roster
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Loaded from your server's /v1/models response. Select which models
            to include before starting a benchmark.
          </p>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {models.length === 0 && (
              <p className="rounded-lg border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">
                No models loaded. Test the connection to discover your server's
                models.
              </p>
            )}
            {models.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    onClick={() => onToggleModel(model.id)}
                    role="switch"
                    aria-checked={model.enabled !== false}
                    aria-label={`Include ${model.name}`}
                    className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${model.enabled !== false ? "justify-end bg-emerald-500/70" : "justify-start bg-white/10"}`}
                  >
                    <span className="h-4 w-4 rounded-full bg-white shadow" />
                  </button>
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm text-slate-200"
                      title={model.id}
                    >
                      {model.name}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      {model.engine ?? "Engine not reported"}
                      {model.custom
                        ? " · manually added"
                        : " · reported by API"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveModel(model.id)}
                  aria-label={`Remove ${model.name}`}
                  className="shrink-0 rounded-md p-1.5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            Add a model by identifier
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Use an exact model ID accepted by your server. Adding it configures
            the roster only; no requests or scores are generated.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              aria-label="Model identifier"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="Exact model ID from your API"
              className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            />
            <select
              aria-label="Model engine (optional)"
              value={newEngine}
              onChange={(e) => setNewEngine(e.target.value as Engine | "")}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            >
              <option value="">Engine (optional)</option>
              <option value="mlx">mlx</option>
              <option value="llama.cpp">llama.cpp</option>
            </select>
            <button
              onClick={handleAddModel}
              disabled={!newModelName.trim() || duplicate}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          {duplicate && (
            <p className="mt-2 text-xs text-amber-400">
              That model is already in the roster.
            </p>
          )}
        </section>

        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-300">
          <Info className="h-4 w-4 shrink-0" /> Only actual API requests create
          results. If a connection or request fails, rotation stops; there is no
          simulated fallback.
        </div>
      </div>
    </Modal>
  );
}
