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

  it("normalizes official image and video endpoint envelopes by media identity", async () => {
    const image = await normalizeBravePayload({ type: "images", results: [{ title: "Cat", url: "https://example.com/cats", source: "example.com", properties: { url: "https://cdn.example/cat.jpg", width: 640, height: 480 }, thumbnail: { src: "https://cdn.example/cat-thumb.jpg" } }] }, 5, { sourceId: async (url) => `src_${url.includes("cat") ? "A".repeat(43) : "B".repeat(43)}` as never }, "image");
    expect(image[0]).toMatchObject({ kind: "image", imageUrl: "https://cdn.example/cat.jpg", canonicalUrl: "https://cdn.example/cat.jpg", sourcePageUrl: "https://example.com/cats", thumbnailUrl: "https://cdn.example/cat-thumb.jpg", creator: "example.com", width: 640, height: 480 });
    const video = await normalizeBravePayload({ type: "videos", results: [{ title: "Clip", url: "https://example.com/watch", thumbnail: { src: "https://cdn.example/thumb.jpg" }, video: { duration: "01:30", creator: "Creator" } }] }, 5, { sourceId: async () => `src_${"C".repeat(43)}` as never }, "video");
    expect(video[0]).toMatchObject({ kind: "video", videoUrl: "https://example.com/watch", canonicalUrl: "https://example.com/watch", thumbnailUrl: "https://cdn.example/thumb.jpg", creator: "Creator", durationSeconds: 90 });
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
    const canonical = { ...result[0] };
    delete canonical.rank;
    delete canonical.kind;
    expect(result[0].rank).toBe(1);
    expect(canonicalSourceV3Schema.safeParse(canonical).success).toBe(true);
  });
});
