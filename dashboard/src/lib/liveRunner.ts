// Live execution against an OpenAI-compatible inference server (Jan, llama.cpp,
// vLLM, LM Studio, the bundled mock, ...). Streams /v1/chat/completions and
// derives real benchmark telemetry: TTFT, generation throughput, duration.

export type LiveErrorKind = "network" | "http" | "timeout" | "stream";

export interface LiveOutcome {
  success: boolean;
  /** true when the caller aborted deliberately (purge / unmount) — drop silently */
  cancelled?: boolean;
  errorKind?: LiveErrorKind;
  ttftMs?: number;
  tokensPerSec?: number;
  tokensGenerated?: number;
  durationMs?: number;
  response?: string;
  error?: string;
}

export interface LiveCompletionOptions {
  baseUrl: string;
  modelId: string;
  prompt: string;
  maxTokens: number;
  signal: AbortSignal;
}

/** Longest silence allowed between streamed chunks before a run is declared stalled. */
const STREAM_IDLE_TIMEOUT_MS = 60_000;

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Joins a base URL with a `/v1/...` path, tolerating users who paste the
 * base URL with or without the trailing `/v1`.
 */
export function apiPath(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = base.endsWith("/v1") ? path.replace(/^\/v1/, "") : path;
  return `${base}${suffix}`;
}

function elapsedMs(t0: number): number {
  return Math.round(performance.now() - t0);
}

/** Rough token estimate for responses that report no usage (whitespace/char heuristic). */
function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

/** Probe an OpenAI-compatible server for its served model list. Throws on failure. */
export async function probeModels(
  baseUrl: string,
  timeoutMs = 4000,
): Promise<string[] | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("probe-timeout"), timeoutMs);
  try {
    const res = await fetch(apiPath(baseUrl, "/v1/models"), { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json().catch(() => null)) as
      | { data?: { id?: string }[] }
      | null;
    return Array.isArray(data?.data)
      ? data.data.map((m) => String(m?.id ?? "unknown"))
      : undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute one real benchmark run. Resolves with an outcome object and never
 * throws — every failure mode (network down, HTTP error, stall, abort) is
 * captured in the outcome so callers can record it as run telemetry.
 */
export async function streamChatCompletion(
  opts: LiveCompletionOptions,
): Promise<LiveOutcome> {
  const { baseUrl, modelId, prompt, maxTokens, signal } = opts;

  // Internal controller lets us abort independently on stream stalls, while
  // still honoring the caller's signal (purge, per-run max duration, unmount).
  const internal = new AbortController();
  const onExternalAbort = () => internal.abort(signal.reason ?? "aborted");
  signal.addEventListener("abort", onExternalAbort, { once: true });

  let idleTimer = 0;
  const armIdleWatchdog = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(
      () => internal.abort("idle-timeout"),
      STREAM_IDLE_TIMEOUT_MS,
    );
  };

  const t0 = performance.now();
  let firstTokenAt: number | null = null;
  let lastChunkAt: number | null = null;
  let completionTokens: number | undefined;
  const parts: string[] = [];

  try {
    armIdleWatchdog();
    const res = await fetch(apiPath(baseUrl, "/v1/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        max_tokens: maxTokens,
        temperature: 0.6,
        stream_options: { include_usage: true },
      }),
      signal: internal.signal,
    });
    armIdleWatchdog();

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).trim().slice(0, 240);
      return {
        success: false,
        errorKind: "http",
        durationMs: elapsedMs(t0),
        error: `HTTP ${res.status}${detail ? ` — ${detail}` : ""}`,
      };
    }

    const contentType = res.headers.get("content-type") ?? "";

    // Non-streaming JSON fallback (server ignored `stream: true`).
    if (!res.body || !contentType.includes("text/event-stream")) {
      const data = (await res.json().catch(() => null)) as
        | {
            choices?: { message?: { content?: string } }[];
            usage?: { completion_tokens?: number };
          }
        | null;
      const text = data?.choices?.[0]?.message?.content ?? "";
      const totalMs = elapsedMs(t0);
      const tokens = data?.usage?.completion_tokens ?? (text ? estimateTokens(text) : 0);
      if (!text && tokens === 0) {
        return {
          success: false,
          errorKind: "stream",
          durationMs: totalMs,
          error: "Server returned an empty completion.",
        };
      }
      return {
        success: true,
        ttftMs: totalMs, // indistinguishable without streaming
        tokensPerSec: Math.round((tokens / Math.max(totalMs, 1)) * 1000 * 10) / 10,
        tokensGenerated: tokens,
        durationMs: totalMs,
        response: text,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      armIdleWatchdog();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          done = true;
          break;
        }
        try {
          const chunk = JSON.parse(payload);
          const delta: unknown =
            chunk?.choices?.[0]?.delta?.content ?? chunk?.choices?.[0]?.text;
          lastChunkAt = performance.now();
          if (typeof delta === "string" && delta.length > 0) {
            if (firstTokenAt === null) firstTokenAt = lastChunkAt;
            parts.push(delta);
          }
          if (chunk?.usage?.completion_tokens != null) {
            completionTokens = Number(chunk.usage.completion_tokens);
          }
        } catch {
          // keep-alive comment or partial JSON — ignored
        }
      }
    }

    const totalMs = elapsedMs(t0);
    const text = parts.join("");
    const tokens = completionTokens ?? (text ? estimateTokens(text) : 0);

    if (!text && tokens === 0) {
      return {
        success: false,
        errorKind: "stream",
        durationMs: totalMs,
        error: "Stream ended without any completion content.",
      };
    }

    const ttftMs =
      firstTokenAt !== null ? Math.max(1, Math.round(firstTokenAt - t0)) : totalMs;
    const genMs =
      firstTokenAt !== null && lastChunkAt !== null && lastChunkAt > firstTokenAt
        ? lastChunkAt - firstTokenAt
        : totalMs;
    const tokensPerSec = Math.round((tokens / Math.max(genMs, 1)) * 1000 * 10) / 10;

    return {
      success: true,
      ttftMs,
      tokensPerSec,
      tokensGenerated: tokens,
      durationMs: totalMs,
      response: text,
    };
  } catch (err) {
    if (signal.aborted) {
      if (signal.reason === "live-timeout") {
        return {
          success: false,
          errorKind: "timeout",
          durationMs: elapsedMs(t0),
          error: "Run exceeded the per-run time limit and was aborted.",
        };
      }
      // Purge / unmount — caller will drop the entry; do not record anything.
      return { success: false, cancelled: true };
    }
    if (internal.signal.aborted && internal.signal.reason === "idle-timeout") {
      return {
        success: false,
        errorKind: "timeout",
        durationMs: elapsedMs(t0),
        error: `Stream stalled — no token received for ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)}s.`,
      };
    }
    if (internal.signal.aborted) {
      return { success: false, cancelled: true };
    }
    return {
      success: false,
      errorKind: "network",
      durationMs: elapsedMs(t0),
      error: err instanceof Error ? err.message : "Unknown network error",
    };
  } finally {
    window.clearTimeout(idleTimer);
    signal.removeEventListener("abort", onExternalAbort);
  }
}
