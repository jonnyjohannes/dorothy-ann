import { describe, expect, it } from "vitest";
import { normalizeBravePayload } from "../src/infrastructure/providers/brave.js";

describe("Brave v3 normalization", () => {
  it("rejects malformed response envelopes instead of treating them as empty success", async () => {
    await expect(normalizeBravePayload({}, 5, { sourceId: async () => "src_test" as never })).rejects.toThrow("invalid_response");
  });

  it("normalizes a valid web result envelope", async () => {
    const result = await normalizeBravePayload({ web: { results: [{ title: "Example", url: "https://example.com/path", description: "Snippet" }] } }, 5, { sourceId: async () => "src_test" as never });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: "Example", canonicalUrl: "https://example.com/path", sourceId: "src_test", rank: 1 });
  });
});
