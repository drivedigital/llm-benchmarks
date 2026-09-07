let sequence = 0;

/**
 * Identifiers for in-memory UI records only, never authentication or API model
 * IDs. randomUUID is unavailable on ordinary HTTP LAN origins even though
 * fetch works there. A page-local counter is sufficient for that fallback;
 * benchmark results and configuration do not survive a page reload.
 */
export function createLocalId(): string {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }
  sequence += 1;
  return `local-${Date.now().toString(36)}-${sequence.toString(36)}`;
}
