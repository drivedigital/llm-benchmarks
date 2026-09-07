// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BASE_URL } from "../src/lib/apiConfig";
import { probeModels, streamChatCompletion } from "../src/lib/liveRunner";

const fetchMock = vi.fn<typeof fetch>();
const completion = (signal = new AbortController().signal) =>
  streamChatCompletion({
    baseUrl: DEFAULT_BASE_URL,
    modelId: "server/model.gguf",
    prompt: "An actual prompt",
    maxTokens: 80,
    signal,
  });
const delta = (content: string) => ({ choices: [{ delta: { content } }] });
const usage = (tokens: unknown) => ({
  choices: [],
  usage: { completion_tokens: tokens },
});
const sse = (...chunks: (object | string)[]) =>
  new Response(
    chunks
      .map(
        (chunk) =>
          `data: ${typeof chunk === "string" ? chunk : JSON.stringify(chunk)}\n\n`,
      )
      .join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("model discovery", () => {
  it("uses real, unique IDs from a validated model-list response", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        data: [
          { id: "server/model.gguf" },
          { id: "server/model.gguf" },
          { id: "second-model" },
        ],
      }),
    );
    expect(await probeModels(DEFAULT_BASE_URL)).toEqual([
      "server/model.gguf",
      "second-model",
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/models");
  });

  it.each([
    {},
    { data: null },
    { data: [{}] },
    { data: [{ id: "" }] },
    { data: [{ id: 12 }] },
  ])("rejects malformed lists: %j", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expect(probeModels(DEFAULT_BASE_URL)).rejects.toThrow(
      "valid /v1/models",
    );
  });

  it("accepts an empty served roster without inventing models", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [] }));
    expect(await probeModels(DEFAULT_BASE_URL)).toEqual([]);
  });

  it("rejects the bundled mock rather than treating fixtures as benchmark data", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { data: [{ id: "fixture" }] },
        { headers: { "X-Benchmark-Mock": "true" } },
      ),
    );
    await expect(probeModels(DEFAULT_BASE_URL)).rejects.toThrow("mock API");
  });
});

describe("measured completions only", () => {
  it("posts the exact model/prompt and measures stream timing using reported usage", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(620)
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1100);
    const frames = [
      `data: ${JSON.stringify(delta("Hello"))}\n\n`,
      `data: ${JSON.stringify(delta(" world"))}\n\n`,
      `data: ${JSON.stringify(usage(10))}\n\ndata: [DONE]\n\n`,
    ];
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            const frame = frames.shift();
            if (frame) controller.enqueue(new TextEncoder().encode(frame));
            else controller.close();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    const outcome = await completion();
    expect(outcome).toMatchObject({
      success: true,
      response: "Hello world",
      ttftMs: 120,
      durationMs: 1100,
      tokensGenerated: 10,
      tokensPerSec: 20,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/chat/completions");
    expect(JSON.parse(init!.body as string)).toMatchObject({
      model: "server/model.gguf",
      messages: [{ role: "user", content: "An actual prompt" }],
      stream: true,
      max_tokens: 80,
      stream_options: { include_usage: true },
    });
  });

  it("does not estimate tokens or throughput when the server omits usage", async () => {
    fetchMock.mockResolvedValue(
      sse(
        delta(
          "Long output that must not be divided by four to invent token counts.",
        ),
        "[DONE]",
      ),
    );
    const outcome = await completion();
    expect(outcome.success).toBe(true);
    expect(outcome.ttftMs).toBeTypeOf("number");
    expect(outcome.tokensGenerated).toBeUndefined();
    expect(outcome.tokensPerSec).toBeUndefined();
  });

  it.each([-1, "12", null, 1.5])(
    "does not accept invalid usage: %s",
    async (tokens) => {
      fetchMock.mockResolvedValue(
        sse(delta("Output"), usage(tokens), "[DONE]"),
      );
      expect((await completion()).tokensGenerated).toBeUndefined();
    },
  );

  it("does not claim a generation rate for a single content chunk", async () => {
    fetchMock.mockResolvedValue(sse(delta("Output"), usage(1), "[DONE]"));
    const outcome = await completion();
    expect(outcome.tokensGenerated).toBe(1);
    expect(outcome.tokensPerSec).toBeUndefined();
  });

  it("does not mistake parsing multiple buffered events for a measured generation interval", async () => {
    fetchMock.mockResolvedValue(
      sse(delta("Hello"), delta(" world"), usage(2), "[DONE]"),
    );
    const outcome = await completion();
    expect(outcome.success).toBe(true);
    expect(outcome.tokensGenerated).toBe(2);
    expect(outcome.ttftMs).toBeTypeOf("number");
    expect(outcome.tokensPerSec).toBeUndefined();
  });

  it("does not claim TTFT or decode throughput from non-streamed JSON", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        choices: [{ message: { content: "A real response" } }],
        usage: { completion_tokens: 4 },
      }),
    );
    const outcome = await completion();
    expect(outcome).toMatchObject({
      success: true,
      response: "A real response",
      tokensGenerated: 4,
    });
    expect(outcome.durationMs).toBeTypeOf("number");
    expect(outcome.ttftMs).toBeUndefined();
    expect(outcome.tokensPerSec).toBeUndefined();
  });

  it("includes actual image URLs when executing a vision test", async () => {
    fetchMock.mockResolvedValue(sse(delta("The attached image"), "[DONE]"));
    await streamChatCompletion({
      baseUrl: DEFAULT_BASE_URL,
      modelId: "vision-model",
      prompt: "Describe this image",
      imageUrls: ["https://example.com/image.png"],
      maxTokens: 20,
      signal: new AbortController().signal,
    });
    expect(
      JSON.parse(fetchMock.mock.calls[0][1]!.body as string).messages[0]
        .content,
    ).toEqual([
      { type: "text", text: "Describe this image" },
      {
        type: "image_url",
        image_url: { url: "https://example.com/image.png" },
      },
    ]);
  });

  it("handles split UTF-8, CRLF, and a final SSE line without a newline", async () => {
    const bytes = new TextEncoder().encode(
      `data: ${JSON.stringify(delta("café ☀️"))}\r\n\r\ndata: [DONE]`,
    );
    let offset = 0;
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            if (offset === bytes.length) controller.close();
            else controller.enqueue(bytes.slice(offset, ++offset));
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    expect(await completion()).toMatchObject({
      success: true,
      response: "café ☀️",
    });
  });

  it.each([
    {
      name: "truncated stream",
      response: () => sse(delta("partial output")),
      error: "before the completion finished",
    },
    {
      name: "SSE error",
      response: () =>
        sse(
          delta("partial"),
          { error: { message: "Model unloaded" } },
          "[DONE]",
        ),
      error: "Model unloaded",
    },
    {
      name: "malformed SSE",
      response: () => sse("not JSON", "[DONE]"),
      error: "malformed JSON",
    },
    {
      name: "empty stream",
      response: () => sse("[DONE]"),
      error: "without any completion",
    },
    {
      name: "invalid JSON response",
      response: () => Response.json({}),
      error: "invalid or empty",
    },
  ])(
    "records $name as a failure, not a successful benchmark",
    async ({ response, error }) => {
      fetchMock.mockResolvedValue(response());
      const outcome = await completion();
      expect(outcome).toMatchObject({ success: false, errorKind: "stream" });
      expect(outcome.error).toContain(error);
      expect(outcome.tokensPerSec).toBeUndefined();
    },
  );

  it("reports actual HTTP errors without fabricated metrics", async () => {
    fetchMock.mockResolvedValue(
      new Response("Model not loaded", { status: 503 }),
    );
    expect(await completion()).toMatchObject({
      success: false,
      errorKind: "http",
      error: "HTTP 503 — Model not loaded",
    });
  });

  it("reports network failures without an offline fallback", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await completion()).toMatchObject({
      success: false,
      errorKind: "network",
      error: "Failed to fetch",
    });
  });

  it("refuses fixture completions even if a probe was bypassed", async () => {
    const response = sse(delta("not a model"), "[DONE]");
    response.headers.set("x-benchmark-mock", "true");
    fetchMock.mockResolvedValue(response);
    expect((await completion()).success).toBe(false);
  });

  it("does not dispatch requests whose signal is already cancelled", async () => {
    const controller = new AbortController();
    controller.abort("purge");
    expect(await completion(controller.signal)).toEqual({
      success: false,
      cancelled: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["purge", "unmount", "server-changed", "live-timeout"])(
    "handles in-flight abort: %s",
    async (reason) => {
      fetchMock.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init!.signal!.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            );
          }),
      );
      const controller = new AbortController();
      const pending = completion(controller.signal);
      controller.abort(reason);
      expect(await pending).toMatchObject(
        reason === "live-timeout"
          ? { success: false, errorKind: "timeout" }
          : { success: false, cancelled: true },
      );
    },
  );

  it("stops a stalled request rather than fabricating a completion", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    const pending = completion();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toMatchObject({
      success: false,
      errorKind: "timeout",
    });
  });
});
