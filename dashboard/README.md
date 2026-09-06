# Jan Bench Analytics — LLM Performance Dashboard

A benchmark dashboard that profiles LLM throughput across a model roster by
executing real streaming chat completions against any OpenAI-compatible API
server (Jan, llama.cpp, LM Studio, vLLM, …). When no server is reachable it
falls back to an offline simulator so the UI stays explorable.

## Quick start

```bash
npm ci

# Terminal 1 — the benchmark API. Use the bundled mock, or skip this and point
# API_UPSTREAM at your own server (below).
npm run mock          # OpenAI-compatible server on http://127.0.0.1:1337

# Terminal 2 — the dashboard
npm run dev           # http://localhost:5173
```

Open the dashboard — the connection pill should flip to **Live** and the
rotation starts recording real completions from the API server.

## Pointing the dashboard at your own API server

The app talks to the relative path `/api`, which the Vite dev server proxies to
your benchmark API. This avoids browser CORS and mixed-content blocks entirely.
To target a different server (e.g. a Jan instance on another machine):

```bash
API_UPSTREAM=http://192.168.1.50:1337 npm run dev
```

(Default target: `http://127.0.0.1:1337`, Jan's default port.)

Alternatively, paste an absolute URL into **Server & models → API Server** in
the UI; then the browser calls it directly, so the server must send CORS
headers. The relative `/api` proxy has no such requirement.

## Live vs. simulated mode

- The dashboard probes `/v1/models` on startup (and from **Test connection**).
- **Connected:** both the background rotation and ad-hoc *Run now* tests POST
  real streamed `/v1/chat/completions` requests and record measured TTFT,
  tokens/sec, and duration from the stream (`usage` chunk when provided,
  otherwise estimated). Runs are tagged live; nothing is simulated.
- **Unreachable:** the offline simulator keeps producing sample telemetry so
  you can explore the UI. Simulated results carry a small **SIM** badge in the
  feed and detail drawer.
- If the server drops mid-run, the run is marked failed and the dashboard
  falls back to simulated telemetry until the next successful probe.

For live runs the request's `model` field is the roster entry's id, so custom
models you add should use the exact id your server reports under `/v1/models`.

## Purging run data

**Purge data** (top bar) wipes every recorded result — the seeded sample data
plus anything collected since — and resets the stat cards, charts, leaderboard,
and feed to zero. In-flight runs are aborted. The model roster, test suite,
server settings, and rotation schedule are untouched, so the dashboard
immediately starts filling with fresh (live, if connected) data.

## Testing the API contract (headless)

```bash
npm run test:api                      # against the mock at 127.0.0.1:1337
node mock-server/smoke-test.mjs http://your-server:1337   # against your own server
```

Verifies `GET /v1/models`, streamed chat completions (TTFT, chunk flow, usage,
`[DONE]`), and the non-streaming fallback — the same flow the app uses.

## Mock server

`mock-server/server.mjs` (zero-dependency Node):

- Serves the dashboard roster's model ids on `/v1/models`.
- Streams `text/event-stream` completions with per-model tokens/sec pacing and
  TTFT, honoring `max_tokens` (capped) and `stream_options.include_usage`.
- Randomly fails ~6% of requests with HTTP 500 to exercise the error path;
  send header `x-mock-no-fail: 1` to disable (the smoke test does).
- Env: `PORT` (1337), `MOCK_FAILURE_RATE` (0.06), `MOCK_MAX_TOKENS` (800).

## Scripts

| Command            | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Vite dev server with `/api` proxy        |
| `npm run mock`     | Start the mock OpenAI-compatible server  |
| `npm run test:api` | API contract smoke test                  |
| `npm run typecheck`| `tsc --noEmit`                           |
| `npm run build`    | Single-file production bundle in `dist/` |

Operational notes: max 2 concurrent in-flight runs; each live run is capped at
180 s wall-clock and 60 s of stream silence; per-request generation is capped
at the test's `avgOutputTokens` (≤ 4000) so long-context tests stay bounded.
