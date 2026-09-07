import type { TestDef } from "../types";

export function isImageUrl(value: string): boolean {
  return (
    /^https?:\/\/\S+$/i.test(value) ||
    /^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/.test(value)
  );
}

/** Do not dispatch empty prompts or pretend filenames are image attachments. */
export function testReadinessError(test: TestDef): string | undefined {
  if (!test.prompt.trim()) return "Enter a prompt before running this test.";
  if (
    !Number.isInteger(test.maxTokens) ||
    test.maxTokens < 1 ||
    test.maxTokens > 4000
  ) {
    return "Set a token limit between 1 and 4,000.";
  }
  if (
    test.category === "vision" &&
    (!test.inputs?.length || !test.inputs.every(isImageUrl))
  ) {
    return "Vision tests need actual image URLs or image data URLs. Local filenames are not attachments.";
  }
  return undefined;
}

export function isRunnableTest(test: TestDef): boolean {
  return test.enabled !== false && !testReadinessError(test);
}
