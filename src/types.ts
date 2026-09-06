export type Engine = "llama.cpp" | "mlx";

export interface ModelDef {
  id: string;
  name: string;
  engine: Engine;
  family: string;
  paramSize: string;
  quant: string;
  custom?: boolean;
  visionCapable?: boolean;
  enabled?: boolean;
  // simulated performance profile
  baseTokPerSec: number;
  baseTtftMs: number;
  reliability: number; // 0-1 chance of success
}

export type TestCategory = "text" | "vision";

export interface TestDef {
  id: string;
  code: string;
  name: string;
  category: TestCategory;
  objective: string;
  prompt: string;
  inputs?: string[];
  custom?: boolean;
  enabled?: boolean;
  // relative difficulty multipliers used by the simulator
  ttftMultiplier: number;
  durationMultiplier: number;
  avgOutputTokens: number;
}

export type RunStatus = "queued" | "running" | "success" | "error";

export interface RunResult {
  id: string;
  modelId: string;
  testId: string;
  status: RunStatus;
  queuedAt: number;
  startedAt?: number;
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
