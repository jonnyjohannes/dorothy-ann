// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SafeContentExtractor, isPublicAddress } from "../src/infrastructure/extraction/safe-content-extractor.js";
import type { SearchResult } from "../src/domain/types.js";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async (host: string) => [{ address: host === "127.0.0.1" ? host : "93.184.216.34", family: 4 }]) }));
const source: SearchResult = { kind: "link", sourceId: `src_${"A".repeat(43)}` as never, rank: 1,
  title: "Synthetic report", url: "https://example.org/report", canonicalUrl: "https://example.org/report", displayUrl: "example.org" };
const config = { maxFetchBytes: 20_000, maxRedirects: 2, userAgent: "fixture", minCharacters: 120 };
const limits = { maxCharacters: 300, timeoutMs: 2_000 };
const extractor = (body: string, type = "text/html", status = 200) => new SafeContentExtractor(config,
  async () => new Response(body, { status, headers: { "content-type": type } }));

describe("SafeContentExtractor", () => {
  it("extracts bounded Readability text without scripts or boilerplate", async () => {
    const html = `<html><body><header>${"HEADER_PRIVATE ".repeat(20)}</header><article><nav>${"NAV_PRIVATE ".repeat(20)}</nav><p>${"An article with verifiable factual content. ".repeat(12)}</p><script>SECRET_SCRIPT</script><p hidden>HIDDEN_PRIVATE</p></article></body></html>`;
    const result = await extractor(html).extract(source, limits);
    expect(result.status).toBe("viable");
    if (result.status !== "viable") return;
    expect(result.page.text).toContain("verifiable factual content");
    for (const excluded of ["HEADER_PRIVATE", "NAV_PRIVATE", "SECRET_SCRIPT", "HIDDEN_PRIVATE"]) expect(result.page.text).not.toContain(excluded);
    expect(result.page.characterCount).toBe([...result.page.text].length);
    expect(result.page.characterCount).toBeLessThanOrEqual(limits.maxCharacters);
  });

  it("requires 120 code points of readable text and preserves Unicode bounds", async () => {
    expect(await extractor("<html><body><main></main><script>window.app={}</script></body></html>").extract(source, limits))
      .toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(await extractor("<html><body><article>Short.</article></body></html>").extract(source, limits))
      .toMatchObject({ status: "skipped", reason: "empty_content" });
    const viable = await extractor("😀".repeat(130), "text/plain").extract(source, { ...limits, maxCharacters: 120 });
    expect(viable).toMatchObject({ status: "viable", page: { characterCount: 120, text: "😀".repeat(120) } });
  });

  it("retains HTTP, MIME, size and unsafe URL protections", async () => {
    expect(await extractor("", "text/html").extract(source, limits)).toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(await extractor("blocked", "text/html", 403).extract(source, limits)).toMatchObject({ status: "failed", code: "fetch_failed" });
    expect(await extractor("binary", "application/pdf").extract(source, limits)).toMatchObject({ status: "skipped", reason: "unsupported_content" });
    expect(await extractor("x".repeat(20_001)).extract(source, limits)).toMatchObject({ status: "failed", code: "fetch_failed", retryable: false });
    expect(await extractor("not fetched").extract({ ...source, url: "http://127.0.0.1/private" }, limits))
      .toMatchObject({ status: "skipped", reason: "unsafe_url" });
    for (const address of ["127.0.0.1", "10.0.0.1", "::1", "::ffff:10.0.0.1", "::ffff:a00:1", "ff02::1"])
      expect(isPublicAddress(address), address).toBe(false);
  });

  it("does not promote a response that finishes after the outer timeout", async () => {
    const slow = new SafeContentExtractor(config, async () => {
      await new Promise((resolve) => setTimeout(resolve, 35));
      return new Response("A complete article. ".repeat(40), { headers: { "content-type": "text/plain" } });
    });
    expect(await slow.extract(source, { ...limits, timeoutMs: 5 })).toMatchObject({ status: "failed", code: "timeout" });
  });

  it("validates every redirect target before fetching it", async () => {
    let fetched = 0;
    const redirect = new SafeContentExtractor(config, async () => {
      fetched++;
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
    });
    expect(await redirect.extract(source, limits)).toMatchObject({ status: "skipped", reason: "unsafe_url" });
    expect(fetched).toBe(1);
  });
});
