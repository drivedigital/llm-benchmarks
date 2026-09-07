// @vitest-environment node
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import {
  createServer as createViteServer,
  type ProxyOptions,
  type ViteDevServer,
} from "vite";
import { expect, it, vi } from "vitest";
import viteConfig from "../vite.config";
import { DEFAULT_BASE_URL } from "../src/lib/apiConfig";
import { probeModels, streamChatCompletion } from "../src/lib/liveRunner";

it("forwards models and streaming completions through the actual Vite proxy configuration", async () => {
  // A short-lived, isolated HTTP fixture on an OS-assigned port, not Jan's port.
  // This verifies transport, not model performance, and never loads dashboard data.
  const received: { path?: string; body?: unknown }[] = [];
  const upstream: Server = createHttpServer(async (req, res) => {
    received.push({ path: req.url });
    if (req.url === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "isolated-contract-fixture" }] }));
      return;
    }
    if (req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const part of req) body += part;
    received[received.length - 1].body = JSON.parse(body);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    res.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Contract " } }] })}\n\n`,
    );
    const timer = setTimeout(() => {
      res.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "response." }, finish_reason: "stop" }], usage: { completion_tokens: 3 } })}\n\ndata: [DONE]\n\n`,
      );
    }, 30);
    res.on("close", () => clearTimeout(timer));
  });
  let frontend: ViteDevServer | undefined;
  const fetchHttp = globalThis.fetch;
  try {
    upstream.listen(0, "0.0.0.0");
    await once(upstream, "listening");
    const upstreamPort = (upstream.address() as AddressInfo).port;
    const configuredProxy = viteConfig.server!.proxy!["/api"] as ProxyOptions;
    frontend = await createViteServer({
      ...viteConfig,
      configFile: false,
      // Never overwrite dependency metadata belonging to a running dashboard.
      cacheDir: "node_modules/.cache/proxy-contract-test",
      logLevel: "silent",
      server: {
        ...viteConfig.server,
        port: 0,
        proxy: {
          "/api": {
            ...configuredProxy,
            target: `http://127.0.0.1:${upstreamPort}`,
          },
        },
      },
    });
    await frontend.listen();
    const frontendPort = (frontend.httpServer!.address() as AddressInfo).port;
    vi.stubGlobal("fetch", ((input, init) => {
      expect(typeof input).toBe("string");
      expect(String(input)).toMatch(/^\/api\/v1\//);
      return fetchHttp(`http://127.0.0.1:${frontendPort}${input}`, init);
    }) as typeof fetch);
    expect(await probeModels(DEFAULT_BASE_URL)).toEqual([
      "isolated-contract-fixture",
    ]);
    const outcome = await streamChatCompletion({
      baseUrl: DEFAULT_BASE_URL,
      modelId: "isolated-contract-fixture",
      prompt: "Verify streaming transport",
      maxTokens: 10,
      signal: new AbortController().signal,
    });
    expect(outcome).toMatchObject({
      success: true,
      response: "Contract response.",
      tokensGenerated: 3,
    });
    expect(outcome.ttftMs).toBeTypeOf("number");
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
    expect(received.map((request) => request.path)).toEqual([
      "/v1/models",
      "/v1/chat/completions",
    ]);
    expect(received[1].body).toMatchObject({
      model: "isolated-contract-fixture",
      stream: true,
    });
  } finally {
    vi.unstubAllGlobals();
    await frontend?.close();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
}, 20_000);
