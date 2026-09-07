import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalId } from "../src/utils/id";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("page-local IDs on localhost, HTTPS, and HTTP LAN origins", () => {
  it("uses native randomUUID when available, preserving its receiver", () => {
    const nativeId = "b5319f71-66a7-4c16-af41-d44c0edc0c79";
    const browserCrypto = {
      randomUUID: vi.fn(function (this: unknown) {
        expect(this).toBe(browserCrypto);
        return nativeId;
      }),
    };
    vi.stubGlobal("crypto", browserCrypto);
    expect(createLocalId()).toBe(nativeId);
    expect(browserCrypto.randomUUID).toHaveBeenCalledOnce();
  });

  it.each([{}, undefined])(
    "works without randomUUID (crypto = %j) and stays unique with a fixed clock",
    (browserCrypto) => {
      vi.stubGlobal("crypto", browserCrypto);
      vi.spyOn(Date, "now").mockReturnValue(0);
      const ids = Array.from({ length: 1000 }, () => createLocalId());
      expect(ids.every((id) => id.startsWith("local-"))).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );
});
