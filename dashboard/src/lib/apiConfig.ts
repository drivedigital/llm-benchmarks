// Injected by Vite so the displayed server and the proxy's actual target agree.
declare const __API_UPSTREAM__: string;

export const JAN_BASE_URL = "http://127.0.0.1:1337/v1";
export const DEFAULT_BASE_URL =
  typeof __API_UPSTREAM__ === "string" ? __API_UPSTREAM__ : JAN_BASE_URL;

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function withoutVersion(url: string): string {
  return normalizeBaseUrl(url).replace(/\/v1$/, "");
}

/**
 * All browser traffic stays same-origin. In particular, the browser's loopback
 * address must not be mistaken for the machine running the dashboard proxy.
 * Never silently send requests to a different server than the one in settings.
 */
export function apiPath(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error("Enter an API server URL.");
  if (withoutVersion(base) === withoutVersion(DEFAULT_BASE_URL)) {
    return `/api${path}`;
  }
  // Also support a user-deployed, same-origin reverse proxy.
  if (/^\/(?!\/)[\w/-]+$/.test(base)) {
    return `${base}${base.endsWith("/v1") ? path.replace(/^\/v1/, "") : path}`;
  }
  throw new Error(
    `This dashboard's proxy targets ${DEFAULT_BASE_URL}. To change servers, restart it with API_UPSTREAM set to ${base}.`,
  );
}
