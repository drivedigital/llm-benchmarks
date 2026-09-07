export type Engine = "llama.cpp" | "mlx";

export interface ModelDef {
  id: string;
  name: string;
  // Optional metadata must be supplied, not inferred from a performance profile.
  engine?: Engine;
  family?: string;
  paramSize?: string;
  quant?: string;
  custom?: boolean;
  enabled?: boolean;
}

export type TestCategory = "text" | "vision";

export interface TestDef {
  id: string;
  code: string;
  name: string;
  category: TestCategory;
  objective: string;
  prompt: string;
  /** Actual image URLs (or image data URLs) sent to the API for vision tests. */
  inputs?: string[];
  custom?: boolean;
  enabled?: boolean;
  maxTokens: number;
}

export type RunStatus = "running" | "success" | "error" | "cancelled";

export interface RunResult {
  id: string;
  modelId: string;
  testId: string;
  /** Snapshots of what was actually tested, even if settings change later. */
  model: ModelDef;
  test: TestDef;
  baseUrl: string;
  status: RunStatus;
  queuedAt: number;
  startedAt: number;
  finishedAt?: number;
  ttftMs?: number;
  tokensPerSec?: number;
  tokensGenerated?: number;
  durationMs?: number;
  response?: string;
  error?: string;
}

export interface ConnectionState {
  baseUrl: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  lastChecked?: number;
  message?: string;
}
