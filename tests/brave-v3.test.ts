import { describe, expect, it } from "vitest";
import { normalizeBravePayload } from "../src/infrastructure/providers/brave.js";
import { canonicalSourceV3Schema } from "../src/domain/schemas.js";

describe("Brave v3 normalization", () => {
  it("rejects malformed response envelopes instead of treating them as empty success", async () => {
    await expect(normalizeBravePayload({}, 5, { sourceId: async () => "src_test" as never })).rejects.toThrow("invalid_response");
  });

  it("normalizes a valid web result envelope", async () => {
    const result = await normalizeBravePayload({ web: { results: [{ title: "Example", url: "https://example.com/path", description: "Snippet" }] } }, 5, { sourceId: async () => "src_test" as never });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: "Example", canonicalUrl: "https://example.com/path", sourceId: "src_test", rank: 1 });
  });

  it("bounds untrusted result metadata before it reaches terminal validation", async () => {
    const result = await normalizeBravePayload({ web: { results: [
      { title: "🚌".repeat(501), url: "https://example.com/usable", description: "evidence ".repeat(200) },
      { title: "Too long URL", url: `https://example.com/${"x".repeat(2_100)}` },
    ] } }, 5, { sourceId: async () => `src_${"A".repeat(43)}` as never });
    expect(result).toHaveLength(1);
    expect([...result[0].title]).toHaveLength(500);
    expect([...(result[0].snippet ?? "")]).toHaveLength(1_000);
    expect(result[0].canonicalUrl).toBe("https://example.com/usable");
    const { rank: _rank, ...canonical } = result[0];
    expect(_rank).toBe(1);
    expect(canonicalSourceV3Schema.safeParse(canonical).success).toBe(true);
  });
});
