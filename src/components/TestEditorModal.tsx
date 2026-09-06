import { useState } from "react";
import { FlaskConical, Plus, RotateCcw, Trash2 } from "lucide-react";
import Modal from "./Modal";
import type { TestDef } from "../types";

export default function TestEditorModal({
  open,
  onClose,
  tests,
  onUpdateTest,
  onAddTest,
  onRemoveTest,
  onToggleTest,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  tests: TestDef[];
  onUpdateTest: (id: string, patch: Partial<TestDef>) => void;
  onAddTest: (t: Omit<TestDef, "id"> & { id?: string }) => void;
  onRemoveTest: (id: string) => void;
  onToggleTest: (id: string) => void;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(tests[0]?.id ?? null);

  function handleAdd() {
    onAddTest({
      code: `CUSTOM_${tests.length + 1}`,
      name: "New custom test",
      category: "text",
      objective: "Describe what this test measures.",
      prompt: "Enter the prompt to send to each model.",
      ttftMultiplier: 1,
      durationMultiplier: 1,
      avgOutputTokens: 400,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Test Suite Editor"
      icon={<FlaskConical className="h-4 w-4" />}
      wide
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Edit prompts and objectives, disable tests you don\u2019t need, or add your own. Changes
          apply to the next scheduler pass.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset defaults
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-md transition hover:brightness-110"
          >
            <Plus className="h-3.5 w-3.5" /> Add test
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {tests.map((t) => {
          const isOpen = expanded === t.id;
          return (
            <div
              key={t.id}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
            >
              <button
                onClick={() => setExpanded(isOpen ? null : t.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTest(t.id);
                    }}
                    className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
                      t.enabled !== false ? "bg-emerald-500/70 justify-end" : "bg-white/10 justify-start"
                    }`}
                  >
                    <span className="h-4 w-4 rounded-full bg-white shadow" />
                  </button>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      t.category === "vision"
                        ? "bg-fuchsia-500/10 text-fuchsia-300"
                        : "bg-sky-500/10 text-sky-300"
                    }`}
                  >
                    {t.code}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-200">{t.name}</span>
                </div>
                {t.custom && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTest(t.id);
                    }}
                    className="shrink-0 rounded-md p-1.5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-white/10 px-4 py-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-slate-400">
                      Name
                      <input
                        value={t.name}
                        onChange={(e) => onUpdateTest(t.id, { name: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                      />
                    </label>
                    <label className="block text-xs text-slate-400">
                      Category
                      <select
                        value={t.category}
                        onChange={(e) =>
                          onUpdateTest(t.id, { category: e.target.value as TestDef["category"] })
                        }
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                      >
                        <option value="text">text</option>
                        <option value="vision">vision</option>
                      </select>
                    </label>
                  </div>
                  <label className="block text-xs text-slate-400">
                    Objective
                    <textarea
                      value={t.objective}
                      onChange={(e) => onUpdateTest(t.id, { objective: e.target.value })}
                      rows={2}
                      className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Prompt
                    <textarea
                      value={t.prompt}
                      onChange={(e) => onUpdateTest(t.id, { prompt: e.target.value })}
                      rows={4}
                      className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[12.5px] text-slate-100 outline-none focus:border-cyan-500/50"
                    />
                  </label>
                  {t.inputs && (
                    <p className="text-[11px] text-slate-500">
                      Inputs: {t.inputs.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
