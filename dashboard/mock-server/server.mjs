#!/usr/bin/env node
/**
 * Mock OpenAI-compatible inference server for testing the dashboard without a
 * real Jan/llama.cpp instance. Zero dependencies — Node 18+ only.
 *
 *   GET  /v1/models            -> OpenAI model list (matches the dashboard roster ids)
 *   POST /v1/chat/completions  -> SSE-streamed chat completion with realistic
 *                                 TTFT, per-model tokens/sec pacing, and usage stats
 *
 * Env:
 *   PORT               listen port (default 1337, Jan's default)
 *   MOCK_FAILURE_RATE  probability a request fails with HTTP 500 (default 0.06)
 *   MOCK_MAX_TOKENS    cap on generated tokens per request (default 800)
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 1337);
const FAILURE_RATE = Number(process.env.MOCK_FAILURE_RATE ?? 0.06);
const MAX_TOKENS_CAP = Number(process.env.MOCK_MAX_TOKENS ?? 800);

// Same ids as the dashboard's DEFAULT_MODELS so the rotation runs real
// requests for every roster entry. Speeds roughly mirror the simulator baselines.
const MODELS = [
  { id: "jan-v3.5-4b-q4kxl", tokPerSec: 62, ttftMs: 210 },
  { id: "phi4-mm-q4km", tokPerSec: 47, ttftMs: 340 },
  { id: "llama31-8b-instruct-q4km", tokPerSec: 38, ttftMs: 390 },
  { id: "deepseek-coder-v2-lite-4bit", tokPerSec: 51, ttftMs: 260 },
  { id: "glm-4.6v-flash-mlx-4bit", tokPerSec: 58, ttftMs: 300 },
  { id: "deepseek-r1-distill-qwen-14b-4bit", tokPerSec: 33, ttftMs: 420 },
  { id: "gpt-oss-20b-optiq-4bit", tokPerSec: 29, ttftMs: 460 },
  { id: "gemma-4-12b-it-qat-optiq-4bit", tokPerSec: 41, ttftMs: 330 },
  { id: "phi4-mini-instruct-4bit", tokPerSec: 74, ttftMs: 180 },
  { id: "gemma-4-e4b-it-qat-optiq-4bit", tokPerSec: 68, ttftMs: 200 },
  { id: "qwen3.5-9b-optiq-4bit", tokPerSec: 55, ttftMs: 250 },
];

const FILLER =
  "benchmark telemetry confirms stable decode throughput across the sampled window with no thermal throttling or kv cache pressure observed during sustained generation of structured output tokens for the requested evaluation prompt . "
    .split(" ");

function jitter(min, max) {
  return min + Math.random() * (max - min);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function modelProfile(modelId) {
  const found = MODELS.find((m) => m.id === modelId);
  if (found) return found;
  // Unknown model: still serve it (like a single-model llama.cpp server would).
  return { id: modelId, tokPerSec: 40, ttftMs: 350 };
}

function makeToken(idx, prompt) {
  // Deterministic-ish word salad seeded by the prompt so responses differ per test.
  const seed = (prompt.length * 31 + idx * 7) % FILLER.length;
  return FILLER[seed];
}

function sseChunk(id, model, delta, finishReason = null) {
  return (
    "data: " +
    JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    }) +
    "\n\n"
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-mock-no-fail");
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        data: MODELS.map((m) => ({
          id: m.id,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "mock-bench",
        })),
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Invalid JSON body" } }));
      return;
    }

    const model = String(body.model ?? "unknown");
    const profile = modelProfile(model);
    const prompt =
      body.messages?.[body.messages.length - 1]?.content?.toString?.() ?? "";
    const maxTokens = Math.max(
      8,
      Math.min(Number(body.max_tokens ?? 256) || 256, MAX_TOKENS_CAP),
    );
    const stream = body.stream === true;

    // `x-mock-no-fail: 1` disables failure injection so automated contract
    // tests stay deterministic.
    if (req.headers["x-mock-no-fail"] !== "1" && Math.random() < FAILURE_RATE) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: { message: `mock: simulated decode stall for ${model}`, type: "server_error" },
        }),
      );
      return;
    }

    const ttft = Math.max(80, Math.round(profile.ttftMs * jitter(0.8, 1.3)));
    const tokPerSec = Math.max(8, profile.tokPerSec * jitter(0.85, 1.15));
    const perTokenMs = 1000 / tokPerSec;
    const completionId = `chatcmpl-mock-${crypto.randomBytes(4).toString("hex")}`;
    const promptTokens = Math.ceil(prompt.length / 4);
    const firstSentence = `Evaluation of ${model} — mock completion begins. `;

    let closed = false;
    req.on("close", () => (closed = true));

    if (!stream) {
      // Non-streaming JSON response (still takes realistic wall-clock time).
      let text = firstSentence;
      for (let i = 0; i < maxTokens; i += 1) {
        if (closed) return;
        text += ` ${makeToken(i, prompt)}`;
        await sleep(perTokenMs);
      }
      if (closed) return;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: completionId,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: text },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: maxTokens,
            total_tokens: promptTokens + maxTokens,
          },
        }),
      );
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    await sleep(ttft);
    if (closed) return;

    // Role priming chunk, then content tokens one chunk at a time.
    res.write(sseChunk(completionId, model, { role: "assistant" }));
    res.write(sseChunk(completionId, model, { content: firstSentence }));
    await sleep(perTokenMs);

    for (let i = 0; i < maxTokens; i += 1) {
      if (closed) return;
      res.write(sseChunk(completionId, model, { content: ` ${makeToken(i, prompt)}` }));
      await sleep(perTokenMs * jitter(0.6, 1.5));
    }
    if (closed) return;

    res.write(sseChunk(completionId, model, {}, "stop"));
    res.write(
      "data: " +
        JSON.stringify({
          id: completionId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: maxTokens,
            total_tokens: promptTokens + maxTokens,
          },
        }) +
        "\n\n",
    );
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: `Not found: ${req.method} ${url.pathname}` } }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[mock-api] OpenAI-compatible server listening on http://0.0.0.0:${PORT} ` +
      `(failure rate ${FAILURE_RATE}, max ${MAX_TOKENS_CAP} tokens/request)`,
  );
});
