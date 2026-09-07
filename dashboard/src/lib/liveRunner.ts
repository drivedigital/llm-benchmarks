// Real OpenAI-compatible API execution only. No simulated outcomes or token estimates.
import { apiPath } from "./apiConfig";

export type LiveErrorKind = "network" | "http" | "timeout" | "stream";

export interface LiveOutcome {
  success: boolean;
  /** Deliberately aborted by the caller; it decides whether to clear or cancel the run. */
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
  imageUrls?: string[];
  maxTokens: number;
  signal: AbortSignal;
}

const STREAM_IDLE_TIMEOUT_MS = 60_000;

function elapsedMs(t0: number): number {
  return Math.round(performance.now() - t0);
}

function reportedTokens(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function rejectMock(res: Response) {
  if (res.headers.get("x-benchmark-mock") === "true") {
    throw new Error(
      "This is a mock API for automated tests, not an inference server. Connect to Jan to collect benchmark data.",
    );
  }
}

/** A 200 response alone is not proof of a working models endpoint. */
export async function probeModels(
  baseUrl: string,
  timeoutMs = 4000,
  signal?: AbortSignal,
): Promise<string[]> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timer = setTimeout(() => controller.abort("probe-timeout"), timeoutMs);
  try {
    const res = await fetch(apiPath(baseUrl, "/v1/models"), {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rejectMock(res);
    const body = await res.json();
    if (
      !Array.isArray(body?.data) ||
      body.data.some(
        (m: unknown) =>
          !m ||
          typeof m !== "object" ||
          !("id" in m) ||
          typeof m.id !== "string" ||
          !m.id.trim(),
      )
    ) {
      throw new Error("Server did not return a valid /v1/models list.");
    }
    return [...new Set<string>(body.data.map((m: { id: string }) => m.id))];
  } catch (err) {
    if (controller.signal.reason === "probe-timeout") {
      throw new Error("Connection check timed out.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Execute one request, measuring the received stream and wall-clock duration.
 * Tokens come only from the server's usage field. Missing usage, a single
 * content chunk, or a non-streamed response leave unmeasurable metrics absent.
 */
export async function streamChatCompletion(
  opts: LiveCompletionOptions,
): Promise<LiveOutcome> {
  const { baseUrl, modelId, prompt, imageUrls, maxTokens, signal } = opts;
  const internal = new AbortController();
  const onExternalAbort = () => internal.abort(signal.reason ?? "aborted");
  signal.addEventListener("abort", onExternalAbort, { once: true });
  if (signal.aborted) onExternalAbort();

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const armIdleWatchdog = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => internal.abort("idle-timeout"),
      STREAM_IDLE_TIMEOUT_MS,
    );
  };

  const t0 = performance.now();
  let firstTokenAt: number | undefined;
  let lastTokenAt: number | undefined;
  let completionTokens: number | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const parts: string[] = [];
  const failedStream = (error: string): LiveOutcome => ({
    success: false,
    errorKind: "stream",
    durationMs: elapsedMs(t0),
    response: parts.join("") || undefined,
    error,
  });

  try {
    if (internal.signal.aborted) throw new Error("Request aborted.");
    armIdleWatchdog();
    const content = imageUrls?.length
      ? [
          { type: "text", text: prompt },
          ...imageUrls.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ]
      : prompt;
    const res = await fetch(apiPath(baseUrl, "/v1/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content }],
        stream: true,
        max_tokens: maxTokens,
        temperature: 0.6,
        stream_options: { include_usage: true },
      }),
      signal: internal.signal,
    });
    armIdleWatchdog();

    if (!res.ok) {
      const detail = (await res.text()).trim().slice(0, 240);
      return {
        success: false,
        errorKind: "http",
        durationMs: elapsedMs(t0),
        error: `HTTP ${res.status}${detail ? ` — ${detail}` : ""}`,
      };
    }
    rejectMock(res);

    if (
      !(res.headers.get("content-type") ?? "").includes("text/event-stream")
    ) {
      const data = await res.json().catch(() => null);
      const text: unknown = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text) {
        return failedStream("Server returned an invalid or empty completion.");
      }
      return {
        success: true,
        // No TTFT or generation rate can be measured from one complete JSON response.
        tokensGenerated: reportedTokens(data?.usage?.completion_tokens),
        durationMs: elapsedMs(t0),
        response: text,
      };
    }
    if (!res.body) return failedStream("Server returned no response stream.");

    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;
    let finished = false;
    let streamError: string | undefined;

    function consumeLine(raw: string, receivedAt: number) {
      const line = raw.trim();
      if (!line.startsWith("data:")) return; // SSE comments / keep-alives
      const payload = line.slice(5).trim();
      if (!payload) return;
      if (payload === "[DONE]") {
        done = true;
        return;
      }
      try {
        const chunk = JSON.parse(payload);
        if (chunk?.error) {
          streamError =
            typeof chunk.error.message === "string"
              ? chunk.error.message
              : "Server reported a stream error.";
          return;
        }
        const choice = chunk?.choices?.[0];
        const delta: unknown = choice?.delta?.content ?? choice?.text;
        if (typeof delta === "string" && delta.length > 0) {
          // Events delivered in the same network read share an arrival time.
          // Parsing a buffered response is not a measurement of model speed.
          firstTokenAt ??= receivedAt;
          lastTokenAt = receivedAt;
          parts.push(delta);
        }
        if (choice?.finish_reason != null) finished = true;
        completionTokens =
          reportedTokens(chunk?.usage?.completion_tokens) ?? completionTokens;
      } catch {
        streamError = "Server sent malformed JSON in the completion stream.";
      }
    }

    while (!done && !streamError) {
      const { value, done: streamDone } = await reader.read();
      const receivedAt = performance.now();
      armIdleWatchdog();
      buffer += decoder.decode(value, { stream: !streamDone });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        consumeLine(line, receivedAt);
        if (done || streamError) break;
      }
      if (streamDone) {
        if (!done && !streamError && buffer.trim())
          consumeLine(buffer, receivedAt);
        break;
      }
    }

    if (streamError) return failedStream(streamError);
    if (!done && !finished)
      return failedStream("Stream closed before the completion finished.");
    const text = parts.join("");
    if (!text)
      return failedStream("Stream ended without any completion content.");

    const genMs =
      firstTokenAt !== undefined && lastTokenAt !== undefined
        ? lastTokenAt - firstTokenAt
        : 0;
    return {
      success: true,
      ttftMs:
        firstTokenAt === undefined ? undefined : Math.round(firstTokenAt - t0),
      tokensPerSec:
        completionTokens !== undefined && genMs > 0
          ? Math.round((completionTokens / genMs) * 1000 * 10) / 10
          : undefined,
      tokensGenerated: completionTokens,
      durationMs: elapsedMs(t0),
      response: text,
    };
  } catch (err) {
    if (signal.aborted) {
      return signal.reason === "live-timeout"
        ? {
            success: false,
            errorKind: "timeout",
            durationMs: elapsedMs(t0),
            error: "Run exceeded the per-run time limit and was aborted.",
          }
        : { success: false, cancelled: true };
    }
    if (internal.signal.reason === "idle-timeout") {
      return {
        success: false,
        errorKind: "timeout",
        durationMs: elapsedMs(t0),
        error: "Stream stalled — no data received for 60 seconds.",
      };
    }
    return {
      success: false,
      errorKind: "network",
      durationMs: elapsedMs(t0),
      error: err instanceof Error ? err.message : "Unknown network error",
    };
  } finally {
    clearTimeout(idleTimer);
    signal.removeEventListener("abort", onExternalAbort);
    if (reader) {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
