# Jan Bench Analytics

Benchmark real OpenAI-compatible API requests against Jan, llama.cpp, LM Studio,
or another inference server. **There is no sample data, seeded model roster,
simulator, or offline fallback.**

## Run locally with Jan

On the **same machine as Jan**:

```bash
cd dashboard                 # from the repository root
npm ci
npm run dev
```

1. Enable Jan's local API server. Its default base URL is
   **`http://127.0.0.1:1337/v1`** — HTTP, not HTTPS.
2. Open the dashboard at `http://localhost:5173`.
3. Open the single **Server & models** header button and click **Test connection**.
   Only the model IDs returned by `/v1/models` are loaded; no engine metadata or
   performance profiles are invented.
4. Close settings, then choose **Start benchmarks** to cycle through enabled
   models and tests. Or select a model and test under **Run Ad-hoc Test** and
   click **Run now** for one request.

A new page starts **empty and idle**: no results, models, connection probe,
benchmark requests, running animation, or automatic rotation. The included
text prompts are editable _test definitions_, not completed tests or results.
Even a successful connection check **does not start benchmarks**.

## Server URL and proxy

Browser requests use the same-origin `/api` proxy. Its default upstream is
`http://127.0.0.1:1337/v1`; paths with or without the trailing `/v1` are accepted.
This avoids browser CORS and mixed-content issues and avoids confusing the
browser's localhost with the dashboard host's localhost.

To point the proxy at a different Jan/API server, restart the dashboard:

```bash
API_UPSTREAM=http://192.168.1.50:1337/v1 npm run dev
```

The configured upstream becomes the default URL shown in settings. Entering a
different absolute URL in the UI will explain how to reconfigure the proxy;
it **never silently sends a request to some other upstream**. A relative base
URL is also supported if you deploy a same-origin reverse proxy yourself.

**The hosted Arena preview cannot reach Jan on your computer at `127.0.0.1`.**
Run the dashboard locally with Jan, or host it on a machine with authorized
network access to your API. Do not expose your private Jan server publicly just
to connect the preview.

`npm run preview` also supports the proxy. For a standalone deployment of
`dist/index.html`, provide a reverse proxy for `/api/v1/*`; the single HTML file
does not contain a server. Build and serve with the same `API_UPSTREAM` value
so the displayed target and actual routing agree.

## What counts as benchmark data

- Both rotation and ad-hoc runs send actual `POST /v1/chat/completions` requests
  with the selected model ID and prompt. Results are recorded only for these
  dispatched requests, including their actual HTTP/network failures.
- **TTFT** is measured from request start to receipt of the first content chunk.
- **Token count** comes only from the server's `usage.completion_tokens`.
  Characters are never converted into estimated tokens.
- **Throughput** uses that reported count and the observed interval between the
  first and last content-bearing network reads. Buffered or single-chunk
  responses cannot supply a meaningful generation rate.
- **Duration** is measured wall-clock request time. If the server returns
  non-streamed JSON, duration and any reported usage are retained, but TTFT and
  generation throughput are unavailable.
- Missing metrics display **—**, not zero, and are omitted from averages.
  Untested models are not ranked. API success rate measures request success,
  **not the correctness or quality of the model's answer**.
- The feed and detail drawer retain the exact model, test prompt, inputs, and
  server URL used for the request, even if settings change later.

A failed request stops rotation and requires another successful connection
check before more tests can be sent. Already-dispatched requests may finish;
no replacement results are generated. **Pause rotation** prevents new requests
but lets in-flight work finish. Reconnecting does not automatically resume.

Up to two requests can be in flight. Each request has a 180-second total limit,
a 60-second stream-idle limit, and an editable output-token cap of 1–4,000.
Incomplete prompts are skipped. Vision tests require actual image URLs or image
data URLs, sent as `image_url` message parts to a vision-capable model; local
filenames and unattached sample images are not treated as test inputs.

## Purging results

**Purge data** clears recorded runs, metrics, charts, the leaderboard, and feed.
It cancels in-flight requests and resets pass progress. Late responses cannot
restore purged results. Your model roster, prompt definitions, server settings,
and rotation choice are preserved. If you already started rotation, it continues
with **new real API requests** while connected. Pause rotation before purging if
you want the board to stay empty. Purging an idle session never starts rotation.

Results and configuration are in memory only. Reloading starts a new blank
session; no prior sample data is restored from browser storage.

## Verification

```bash
npm test                  # runner, scheduler, data-integrity, and UI regression tests
npm run typecheck
npm run build

# Full browser checks (isolated API fixtures; no Jan instance needed):
npx playwright install chromium
npm run test:e2e
```

The tests cover blank startup, no automatic probes/runs, failed connections,
explicit execution, truthful missing metrics, model discovery, request limits,
stream parsing, cancellations, stale probes, and purging without late results
reappearing. Browser fixtures never become user-visible benchmark data.

### Optional API contract fixture

The standalone mock is **only a development test fixture**, not an inference
server. It uses port **1338**, deliberately different from Jan. It is never
started or selected by the dashboard; the app rejects responses marked as coming
from this bundled mock.

```bash
npm run mock              # separate terminal, synthetic API on port 1338
npm run test:api           # contract checks against that fixture
# Or check an actual server's API contract explicitly:
node mock-server/smoke-test.mjs http://your-api-host:1337/v1
```

Mock settings: `PORT=1338`, `MOCK_FAILURE_RATE=0.06`, `MOCK_MAX_TOKENS=800`.
The smoke test disables random failure injection using `x-mock-no-fail: 1`.
Synthetic fixture timings are not model benchmarks.
