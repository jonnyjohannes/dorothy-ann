import { describe, expect, it, vi } from "vitest";
import { BraveSearchProvider, normalizeBravePayload } from "../server/brave";
import { IdentityPolicy } from "../src/application/identity-policy";
import { WebCryptoIdentityHasher } from "../src/infrastructure/identity/web-crypto-hasher";

const identities = new IdentityPolicy(new WebCryptoIdentityHasher());

describe("Brave search adapter", () => {
  it("does not preserve distracting provider thumbnails", async () => {
    const results = await normalizeBravePayload({ web: { results: [{ title: "one", url: "https://example.com/a", thumbnail: { src: "https://cdn.example.com/a.jpg", width: 320, height: 180 } }] } }, 10, identities);
    expect(results[0]).not.toHaveProperty("image");
  });

  it("normalizes, bounds, and deduplicates results", async () => {
    const results = await normalizeBravePayload({ web: { results: [{ title: "one", url: "https://EXAMPLE.com/a#section", description: "a" }, { title: "duplicate", url: "https://example.com/a" }, { title: "two", url: "https://example.org/b" }] } }, 10, identities);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ rank: 1, canonicalUrl: "https://example.com/a" });
    expect(results[0].sourceId).toMatch(/^src_[A-Za-z0-9_-]{43}$/u);
  });

  it("derives source identity from canonical URL rather than result position", async () => {
    const first = await normalizeBravePayload({ web: { results: [{ title: "one", url: "https://example.com/a" }] } }, 10, identities);
    const second = await normalizeBravePayload({ web: { results: [{ title: "other", url: "https://example.org/b" }, { title: "one later", url: "https://example.com/a#fragment" }] } }, 10, identities);
    expect(second[1].rank).toBe(2);
    expect(second[1].sourceId).toBe(first[0].sourceId);
  });

  it("never leaks malformed provider entries", async () => {
    expect(await normalizeBravePayload({ web: { results: [{ title: "missing url" }, { url: "not a url", title: "bad" }] } }, 10, identities)).toEqual([]);
  });

  it("sends the API key only to the provider", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }));
    await new BraveSearchProvider("secret", fetcher, identities).search("weather", { maxResults: 10 });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("q=weather"), expect.objectContaining({ headers: expect.objectContaining({ "X-Subscription-Token": "secret" }) }));
  });
});
