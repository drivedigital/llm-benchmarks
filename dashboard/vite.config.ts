import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The dashboard's default server URL is the relative path `/api`. The dev
 * server proxies it to the real OpenAI-compatible API (Jan, llama.cpp, the
 * bundled mock, ...), which avoids browser CORS / mixed-content blocks.
 * Retarget with: API_UPSTREAM=http://192.168.1.50:1337 npm run dev
 */
const API_UPSTREAM = process.env.API_UPSTREAM ?? "http://127.0.0.1:1337";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true, // bind 0.0.0.0 so the preview proxy can reach the dev server
    allowedHosts: true, // accept the sandboxed preview hostnames
    proxy: {
      "/api": {
        target: API_UPSTREAM,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
