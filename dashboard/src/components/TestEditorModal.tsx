import { useState } from "react";
import {
  ChevronDown,
  FlaskConical,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Modal from "./Modal";
import { testReadinessError } from "../lib/testReadiness";
import type { TestDef } from "../types";
import { createLocalId } from "../utils/id";

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
  onAddTest: (test: Omit<TestDef, "id"> & { id?: string }) => void;
  onRemoveTest: (id: string) => void;
  onToggleTest: (id: string) => void;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(tests[0]?.id ?? null);
  function handleAdd() {
    const id = createLocalId();
    onAddTest({
      id,
      code: `CUSTOM_${tests.length + 1}`,
      name: "New custom test",
      category: "text",
      objective: "",
      prompt: "",
      maxTokens: 400,
      enabled: false,
    });
    setExpanded(id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Test Suite Editor"
      icon={<FlaskConical className="h-4 w-4" />}
      wide
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-xs text-slate-500">
          These are prompt definitions, not results. Nothing runs until you
          start a benchmark. Edits apply to requests that have not yet been
          sent.
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
        {tests.map((test) => {
          const isOpen = expanded === test.id;
          const readinessError = testReadinessError(test);
          return (
            <div
              key={test.id}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => onToggleTest(test.id)}
                  role="switch"
                  aria-checked={test.enabled !== false}
                  aria-label={`Enable ${test.name}`}
                  className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${test.enabled !== false ? "justify-end bg-emerald-500/70" : "justify-start bg-white/10"}`}
                >
                  <span className="h-4 w-4 rounded-full bg-white shadow" />
                </button>
                <button
                  onClick={() => setExpanded(isOpen ? null : test.id)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${test.category === "vision" ? "bg-fuchsia-500/10 text-fuchsia-300" : "bg-sky-500/10 text-sky-300"}`}
                  >
                    {test.code}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-200">
                    {test.name}
                  </span>
                  {readinessError && (
                    <span className="text-[10px] text-amber-400">
                      Needs setup
                    </span>
                  )}
                  <ChevronDown
                    className={`ml-auto h-4 w-4 shrink-0 text-slate-500 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <button
                  onClick={() => onRemoveTest(test.id)}
                  aria-label={`Remove ${test.name}`}
                  className="shrink-0 rounded-md p-1.5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {isOpen && (
                <div className="space-y-3 border-t border-white/10 px-4 py-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-slate-400">
                      Name
                      <input
                        value={test.name}
                        onChange={(e) =>
                          onUpdateTest(test.id, { name: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                      />
                    </label>
                    <label className="block text-xs text-slate-400">
                      Category
                      <select
                        value={test.category}
                        onChange={(e) =>
                          onUpdateTest(test.id, {
                            category: e.target.value as TestDef["category"],
                          })
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
                      value={test.objective}
                      onChange={(e) =>
                        onUpdateTest(test.id, { objective: e.target.value })
                      }
                      rows={2}
                      className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Prompt
                    <textarea
                      value={test.prompt}
                      onChange={(e) =>
                        onUpdateTest(test.id, { prompt: e.target.value })
                      }
                      rows={4}
                      placeholder="Enter the actual prompt to send to the API"
                      className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[12.5px] text-slate-100 outline-none focus:border-cyan-500/50"
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Maximum output tokens
                    <input
                      type="number"
                      min={1}
                      max={4000}
                      value={Number.isNaN(test.maxTokens) ? "" : test.maxTokens}
                      onChange={(e) =>
                        onUpdateTest(test.id, {
                          maxTokens: e.target.valueAsNumber,
                        })
                      }
                      className="mt-1 block w-40 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                    />
                  </label>
                  {test.category === "vision" && (
                    <label className="block text-xs text-slate-400">
                      Image URLs (one per line)
                      <textarea
                        value={(test.inputs ?? []).join("\n")}
                        onChange={(e) =>
                          onUpdateTest(test.id, {
                            inputs: e.target.value.split("\n"),
                          })
                        }
                        rows={3}
                        placeholder="https://your-host/actual-image.png"
                        className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500/50"
                      />
                      <span className="mt-1 block text-[11px] text-slate-500">
                        Use a vision-capable model. URLs must be accessible to
                        the API server, or use image data URLs. Filenames alone
                        are not sent as images.
                      </span>
                    </label>
                  )}
                  {readinessError && (
                    <p className="text-xs text-amber-400">
                      {readinessError} This test will not run until it is
                      configured.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {tests.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            No tests configured. Add a test or load the default text prompts.
          </p>
        )}
      </div>
    </Modal>
  );
}
