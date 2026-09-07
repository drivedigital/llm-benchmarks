// @vitest-environment node
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createServer as createViteServer,
  preview,
  type ProxyOptions,
  type HttpServer,
} from "vite";
import { expect, it, vi } from "vitest";
import viteConfig from "../vite.config";
import { DEFAULT_BASE_URL } from "../src/lib/apiConfig";
import { probeModels, streamChatCompletion } from "../src/lib/liveRunner";

function closeHttpServer(server: HttpServer): Promise<void> {
  if ("closeAllConnections" in server) server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

it.each(["server", "preview"] as const)(
  "%s sends a trusted Origin and Host for models and streamed completions",
  async (mode) => {
    const configuredProxy = viteConfig[mode]!.proxy!["/api"] as ProxyOptions;
    // Derive the expected Origin independently of the proxy's headers. It must
    // match API_UPSTREAM's scheme/host/port, never include /v1 or another path.
    const expectedOrigin = new URL(String(configuredProxy.target)).origin;
    expect(configuredProxy.secure).not.toBe(false);

    // An isolated HTTP fixture on an OS-assigned port, not Jan's port. Reject
    // missing/untrusted origins outright so a regression cannot pass unnoticed
    // even though Jan may only warn and omit its CORS response headers.
    const received: {
      method?: string;
      path?: string;
      origin?: string;
      host?: string;
      originHeaderCount: number;
      body?: unknown;
    }[] = [];
    const upstream = createHttpServer(async (req, res) => {
      const request: (typeof received)[number] = {
        method: req.method,
        path: req.url,
        origin: req.headers.origin,
        host: req.headers.host,
        originHeaderCount: req.rawHeaders.filter(
          (header, index) =>
            index % 2 === 0 && header.toLowerCase() === "origin",
        ).length,
      };
      received.push(request);
      if (request.origin !== expectedOrigin) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Origin is not trusted" }));
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", expectedOrigin);
      res.setHeader("Vary", "Origin");
      if (req.url === "/v1/models") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ data: [{ id: "isolated-contract-fixture" }] }),
        );
        return;
      }
      if (req.url !== "/v1/chat/completions") {
        res.writeHead(404).end();
        return;
      }
      let body = "";
      for await (const part of req) body += part;
      request.body = JSON.parse(body);
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
    let stopFrontend: (() => Promise<void>) | undefined;
    let buildDir: string | undefined;
    const fetchHttp = globalThis.fetch;
    try {
      upstream.listen(0, "0.0.0.0");
      await once(upstream, "listening");
      const upstreamPort = (upstream.address() as AddressInfo).port;
      const fixtureTarget = `http://127.0.0.1:${upstreamPort}`;

      // Prove that this fixture actually detects the missing-Origin failure.
      const untrusted = await fetchHttp(`${fixtureTarget}/v1/models`);
      expect(untrusted.status).toBe(403);
      expect(await untrusted.json()).toEqual({
        error: "Origin is not trusted",
      });
      received.length = 0;

      const proxy = {
        "/api": { ...configuredProxy, target: fixtureTarget },
      };
      let frontendPort: number;
      if (mode === "server") {
        const frontend = await createViteServer({
          ...viteConfig,
          configFile: false,
          // Never overwrite metadata belonging to a running dashboard.
          cacheDir: "node_modules/.cache/proxy-contract-test",
          logLevel: "silent",
          server: { ...viteConfig.server, port: 0, proxy },
        });
        stopFrontend = () => frontend.close();
        await frontend.listen();
        frontendPort = (frontend.httpServer!.address() as AddressInfo).port;
      } else {
        // Testing the preview proxy must not require an existing app build or
        // write fixture files to the user's production bundle.
        buildDir = await mkdtemp(join(tmpdir(), "benchmark-proxy-test-"));
        await writeFile(
          join(buildDir, "index.html"),
          "<!doctype html><title>Proxy test fixture</title>",
        );
        const frontend = await preview({
          ...viteConfig,
          configFile: false,
          logLevel: "silent",
          build: { outDir: buildDir },
          preview: { ...viteConfig.preview, port: 0, proxy },
        });
        stopFrontend = () => closeHttpServer(frontend.httpServer);
        frontendPort = (frontend.httpServer.address() as AddressInfo).port;
      }

      let browserOrigin: string | undefined;
      vi.stubGlobal("fetch", ((input, init) => {
        expect(typeof input).toBe("string");
        expect(String(input)).toMatch(/^\/api\/v1\//);
        const headers = new Headers(init?.headers);
        if (browserOrigin !== undefined) headers.set("Origin", browserOrigin);
        return fetchHttp(`http://127.0.0.1:${frontendPort}${input}`, {
          ...init,
          headers,
        });
      }) as typeof fetch);

      // GET often omits Origin; POST can supply localhost, LAN, or preview
      // origins. Always replace it on the server hop, with no duplicate header.
      for (browserOrigin of [
        undefined,
        "",
        "http://localhost:5173",
        "http://10.0.0.208:5173",
        "https://5173-preview.e2b.app",
        "null",
      ]) {
        const offset = received.length;
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
        expect(received.slice(offset)).toEqual([
          {
            method: "GET",
            path: "/v1/models",
            host: `127.0.0.1:${upstreamPort}`,
            origin: expectedOrigin,
            originHeaderCount: 1,
          },
          {
            method: "POST",
            path: "/v1/chat/completions",
            host: `127.0.0.1:${upstreamPort}`,
            origin: expectedOrigin,
            originHeaderCount: 1,
            body: expect.objectContaining({
              model: "isolated-contract-fixture",
              stream: true,
            }),
          },
        ]);
      }
    } finally {
      vi.unstubAllGlobals();
      await stopFrontend?.();
      await closeHttpServer(upstream);
      if (buildDir) await rm(buildDir, { recursive: true, force: true });
    }
  },
  20_000,
);
