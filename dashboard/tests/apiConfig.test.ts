// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  apiPath,
  DEFAULT_BASE_URL,
  normalizeBaseUrl,
} from "../src/lib/apiConfig";
import { average } from "../src/utils/metrics";
import { isRunnableTest } from "../src/lib/testReadiness";
import { DEFAULT_TESTS } from "../src/data/tests";

describe("honest API configuration", () => {
  it("defaults to Jan over HTTP and uses a same-origin proxy", () => {
    expect(DEFAULT_BASE_URL).toBe("http://127.0.0.1:1337/v1");
    for (const url of [
      DEFAULT_BASE_URL,
      `${DEFAULT_BASE_URL}/`,
      "http://127.0.0.1:1337",
      "/api",
      "/api/v1/",
    ]) {
      expect(apiPath(url, "/v1/models")).toBe("/api/v1/models");
      expect(apiPath(url, "/v1/chat/completions")).toBe(
        "/api/v1/chat/completions",
      );
    }
  });

  it("does not silently use a different upstream from the one displayed", () => {
    expect(() => apiPath("https://127.0.0.1:1337/v1", "/v1/models")).toThrow(
      "API_UPSTREAM",
    );
    expect(() => apiPath("http://192.168.1.50:1337/v1", "/v1/models")).toThrow(
      "API_UPSTREAM",
    );
    expect(() => apiPath("//127.0.0.1:1337", "/v1/models")).toThrow();
    expect(() => apiPath("", "/v1/models")).toThrow("Enter an API server URL");
    expect(normalizeBaseUrl(" /bench/v1/// ")).toBe("/bench/v1");
    expect(apiPath("/bench/v1", "/v1/models")).toBe("/bench/v1/models");
  });
});

describe("no invented measurements or attachments", () => {
  it("never averages missing measurements as zero", () => {
    expect(average([])).toBeUndefined();
    expect(average([undefined, NaN, Infinity])).toBeUndefined();
    expect(average([100, undefined, 200])).toBe(150);
    expect(average([0, 100])).toBe(50);
  });

  it("ships only usable text prompt definitions, not fake image fixtures", () => {
    expect(DEFAULT_TESTS.length).toBeGreaterThan(0);
    expect(
      DEFAULT_TESTS.every(
        (test) => test.category === "text" && isRunnableTest(test),
      ),
    ).toBe(true);
    expect(DEFAULT_TESTS.every((test) => !test.inputs)).toBe(true);
  });

  it("blocks incomplete prompts and vision tests without actual attachments", () => {
    const test = DEFAULT_TESTS[0];
    expect(isRunnableTest({ ...test, prompt: " " })).toBe(false);
    expect(isRunnableTest({ ...test, enabled: false })).toBe(false);
    expect(isRunnableTest({ ...test, maxTokens: NaN })).toBe(false);
    expect(isRunnableTest({ ...test, maxTokens: 5000 })).toBe(false);
    expect(isRunnableTest({ ...test, category: "vision" })).toBe(false);
    expect(
      isRunnableTest({
        ...test,
        category: "vision",
        inputs: ["Photo/img_01.jpg"],
      }),
    ).toBe(false);
    expect(
      isRunnableTest({
        ...test,
        category: "vision",
        inputs: ["https://example.com/photo.jpg"],
      }),
    ).toBe(true);
  });
});
