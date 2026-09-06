#!/usr/bin/env node
/**
 * Smoke test: verifies the API server speaks the OpenAI contract the
 * dashboard depends on — the exact flow the live benchmark runner uses.
 *
 *   node mock-server/smoke-test.mjs [baseUrl]
 *
 * Defaults to http://127.0.0.1:1337 (the mock server). Exit code 0 = all pass.
 */
const BASE = (process.argv[2] || "http://127.0.0.1:1337").replace(/\/+$/, "");

let failures = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Skip the mock's random failure injection so the contract test is deterministic. */
const NO_FAIL_HEADER = { "x-mock-no-fail": "1" };

async function main() {
  console.log(`Testing OpenAI-compatible API at ${BASE}\n`);

  // 1. Model list — what the connection probe calls.
  let models = [];
  try {
    const res = await fetch(`${BASE}/v1/models`);
    check("GET /v1/models returns 200", res.ok, `HTTP ${res.status}`);
    const data = await res.json();
    models = Array.isArray(data?.data) ? data.data.map((m) => m.id) : [];
    check("model list is a non-empty array", models.length > 0, `${models.length} model(s)`);
  } catch (err) {
    check("GET /v1/models reachable", false, err.message);
    console.log("\nIs the server running? Try: npm run mock");
    process.exit(1);
  }

  const model = models[0];
  const prompt =
    "Write a complete, optimized Python script using the native 'asyncio' library that reads an array of 50 local URLs.";

  // 2. Streaming chat completion — what every live benchmark run does.
  {
    const t0 = performance.now();
    let firstTokenAt = null;
    let chunks = 0;
    let lastChunkAt = null;
    let text = "";
    let usage = null;
    let sawDone = false;
    try {
      const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...NO_FAIL_HEADER },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: true,
          max_tokens: 160,
          stream_options: { include_usage: true },
        }),
      });
      check("POST /v1/chat/completions returns 200", res.ok, `HTTP ${res.status}`);
      check(
        "response is text/event-stream",
        (res.headers.get("content-type") || "").includes("text/event-stream"),
        res.headers.get("content-type"),
      );

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            sawDone = true;
            done = true;
            break;
          }
          chunks += 1;
          lastChunkAt = performance.now();
          const chunk = JSON.parse(payload);
          const delta = chunk?.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            if (firstTokenAt === null) firstTokenAt = lastChunkAt;
            text += delta;
          }
          if (chunk?.usage?.completion_tokens != null) usage = chunk.usage;
        }
      }
    } catch (err) {
      check("streaming request completes", false, err.message);
      process.exit(1);
    }

    const ttft = firstTokenAt === null ? null : Math.round(firstTokenAt - t0);
    const totalMs = lastChunkAt === null ? null : Math.round(lastChunkAt - t0);
    check("streamed chunks received", chunks > 0, `${chunks} chunks`);
    check("TTFT captured from first content chunk", ttft !== null, ttft !== null ? `${ttft} ms` : "none");
    check(
      "TTFT plausible (< 2s)",
      ttft !== null && ttft < 2000,
      ttft !== null ? `${ttft} ms` : "n/a",
    );
    check("completion text accumulated", text.length > 0, `${text.length} chars`);
    check("usage chunk present with completion_tokens", usage?.completion_tokens > 0, JSON.stringify(usage));
    check("stream terminated with [DONE]", sawDone);
    const genSec = firstTokenAt !== null && lastChunkAt !== null ? (lastChunkAt - firstTokenAt) / 1000 : null;
    const tokPerSec = usage?.completion_tokens && genSec ? (usage.completion_tokens / genSec).toFixed(1) : "?";
    if (totalMs !== null) {
      console.log(`      total wall time ${totalMs} ms · ~${tokPerSec} tok/s (measured)\n`);
    }
  }

  // 3. Non-streaming fallback path.
  {
    try {
      const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...NO_FAIL_HEADER },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Say hello in one word." }],
          max_tokens: 16,
        }),
      });
      check("non-streaming POST returns 200", res.ok, `HTTP ${res.status}`);
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      check("JSON completion has message content", content.length > 0, `${content.length} chars`);
      check(
        "JSON completion reports usage",
        data?.usage?.completion_tokens > 0,
        JSON.stringify(data?.usage),
      );
    } catch (err) {
      check("non-streaming request completes", false, err.message);
    }
  }

  console.log(failures === 0 ? "\nAPI contract OK — dashboard live mode can use this server." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
