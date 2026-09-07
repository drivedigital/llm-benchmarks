import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Jan runs on the machine hosting this dev server, not inside the user's browser.
// No mock server is started or selected automatically.
const API_UPSTREAM = (process.env.API_UPSTREAM ?? "http://127.0.0.1:1337/v1")
  .trim()
  .replace(/\/+$/, "");
const upstream = new URL(API_UPSTREAM);
if (
  !["http:", "https:"].includes(upstream.protocol) ||
  upstream.search ||
  upstream.hash
) {
  throw new Error(
    "API_UPSTREAM must be an HTTP(S) API base URL without a query or fragment.",
  );
}
const proxy = {
  "/api": {
    // Browser paths include /v1. Accept upstreams with or without that suffix.
    target: API_UPSTREAM.replace(/\/v1$/, ""),
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: { __API_UPSTREAM__: JSON.stringify(API_UPSTREAM) },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy,
  },
});
