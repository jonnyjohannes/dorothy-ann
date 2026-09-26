// @vitest-environment node
import { lookup } from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareHtmlPresentation, inspectEmptyHtmlShape, SafeContentExtractor } from "../src/infrastructure/extraction/safe-content-extractor.js";
import type { SearchResult } from "../src/domain/types.js";
import { createLocalFetchPresentationProbe } from "../scripts/local-fetch-presentation-probe.js";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));
afterEach(() => vi.mocked(lookup).mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]));
const url = "https://example.org/article";
const html = `<html><body><main>${"Browser-rendered static article text. ".repeat(12)}</main></body></html>`;
const htmlResponse = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html", ...headers } });

describe("local same-URL fetch presentation comparison", () => {
  it("pins the same URL, changes only the user agent, and returns buckets rather than page text", async () => {
    const fetcher = vi.fn(async (requested: string | URL, init?: RequestInit) => {
      expect(requested.toString()).toBe(url);
      expect(init?.redirect).toBe("manual");
      expect(init).toHaveProperty("dispatcher");
      expect(init?.headers).toEqual({
        "user-agent": expect.stringContaining("Mozilla/5.0"), accept: "text/html,text/plain;q=0.9",
      });
      const headers = init?.headers as Record<string, string>;
      return htmlResponse(headers["user-agent"]?.startsWith("Mozilla/5.0") ? html : "<html><body><main></main></body></html>");
    });
    const result = await compareHtmlPresentation(url, fetcher);
    expect(result).toMatchObject({ outcome: "html", shape: {
      body_dom_text_before: "at_least_120", body_before: "at_least_120", root_dom_text_before: "at_least_120",
      root_text_after: "at_least_120",
    } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("Browser-rendered static article text");
  });

  it("never follows redirects or touches private, re-bound, non-HTML or oversized responses", async () => {
    const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    expect(await compareHtmlPresentation(url, redirect)).toEqual({ outcome: "redirect", shape: null });
    expect(redirect).toHaveBeenCalledTimes(1);
    const notCalled = vi.fn(async () => htmlResponse(html));
    expect(await compareHtmlPresentation("http://127.0.0.1/private", notCalled)).toEqual({ outcome: "failed", shape: null });
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    expect(await compareHtmlPresentation(url, notCalled)).toEqual({ outcome: "failed", shape: null });
    expect(notCalled).not.toHaveBeenCalled();
    expect(await compareHtmlPresentation(url, async () => htmlResponse("PRIVATE_BODY", 200, { "content-type": "text/plain" })))
      .toEqual({ outcome: "unsupported", shape: null });
    expect(await compareHtmlPresentation(url, async () => htmlResponse("PRIVATE_BODY", 200, { "content-length": "2000001" })))
      .toEqual({ outcome: "too_large", shape: null });
    expect(await compareHtmlPresentation(url, async () => htmlResponse("", 200)))
      .toEqual({ outcome: "empty", shape: null });
    expect(await compareHtmlPresentation(url, async () => htmlResponse("PRIVATE_BODY", 403)))
      .toEqual({ outcome: "http_error", shape: null });
  });

  it("cannot start a network request after DNS finishes beyond the deadline", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(lookup).mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 9_000));
        return [{ address: "93.184.216.34", family: 4 }];
      });
      const fetcher = vi.fn(async () => htmlResponse(html));
      const result = compareHtmlPresentation(url, fetcher);
      await vi.advanceTimersByTimeAsync(9_000);
      expect(await result).toEqual({ outcome: "timeout", shape: null });
      expect(fetcher).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("times out a stuck comparison without emitting response details", async () => {
    const fetcher = vi.fn(async (_requested: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("PRIVATE_ERROR", "AbortError")), { once: true });
    }));
    expect(await compareHtmlPresentation(url, fetcher)).toEqual({ outcome: "timeout", shape: null });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }, 12_000);

  it("caps refetches at two and keeps URL, bodies and observer exceptions out of output", async () => {
    const emitted: unknown[] = [];
    const compare = vi.fn(async () => ({ outcome: "html" as const, shape: inspectEmptyHtmlShape(html) }));
    const probe = createLocalFetchPresentationProbe((result) => { emitted.push(result); throw new Error("PRIVATE_ERROR"); }, compare);
    const sample = { html: "<html><body><main></main><script>PRIVATE_SCRIPT</script></body></html>", baseUrl: url };
    probe(sample); probe(sample); probe(sample);
    await vi.waitFor(() => expect(emitted).toHaveLength(2));
    expect(compare).toHaveBeenCalledTimes(2);
    for (const entry of emitted) expect(entry).toMatchObject({
      original: { body_dom_text_before: "none", body_before: "none" },
      refetch_outcome: "html", refetch: { body_dom_text_before: "at_least_120" },
    });
    expect(JSON.stringify(emitted)).not.toMatch(/PRIVATE|example\.org|Browser-rendered static article text/);
  });

  it("never promotes diagnostic refetch text into the source extraction outcome", async () => {
    const emitted: unknown[] = [];
    const probe = createLocalFetchPresentationProbe((result) => { emitted.push(result); }, async () => ({
      outcome: "html", shape: inspectEmptyHtmlShape(html),
    }));
    const source: SearchResult = { kind: "link", sourceId: `src_${"A".repeat(43)}` as never, rank: 1,
      title: "Private source", url, canonicalUrl: url, displayUrl: "example.org" };
    const extractor = new SafeContentExtractor({ maxFetchBytes: 2_000_000, maxRedirects: 2, userAgent: "dorothy-ann/1.1", minCharacters: 120 },
      async () => htmlResponse("<html><body><main></main><script>document.body.append('later')</script></body></html>"), undefined, probe);
    expect(await extractor.extract(source, { maxCharacters: 20_000, timeoutMs: 8_000 }))
      .toMatchObject({ status: "skipped", reason: "empty_content" });
    await vi.waitFor(() => expect(emitted).toHaveLength(1));
    expect(emitted[0]).toMatchObject({ original: { body_dom_text_before: "none" },
      refetch_outcome: "html", refetch: { root_text_after: "at_least_120" } });
  });

  it("skips the extra request if the original diagnostic input is oversized", async () => {
    const emitted: unknown[] = [];
    const compare = vi.fn(async () => ({ outcome: "html" as const, shape: inspectEmptyHtmlShape(html) }));
    const probe = createLocalFetchPresentationProbe((result) => { emitted.push(result); }, compare);
    probe({ html: "x".repeat(2_000_001), baseUrl: url });
    await vi.waitFor(() => expect(emitted).toHaveLength(1));
    expect(compare).not.toHaveBeenCalled();
    expect(emitted).toEqual([{ sample_index: 1, original: null, refetch_outcome: "failed", refetch: null }]);
  });
});
