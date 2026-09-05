import { describe, expect, it, vi } from "vitest";
import { SafeContentExtractor, assertTlsVerificationEnabled, isPublicAddress } from "../server/extractor";
import type { SearchResult } from "../src/domain/types";

const source: SearchResult = {
  sourceId: "s1" as never,
  rank: 1,
  title: "Fixture",
  url: "https://example.com",
  canonicalUrl: "https://example.com",
  displayUrl: "example.com",
};

const config = { maxFetchBytes: 10_000, maxRedirects: 5, userAgent: "dorothy-ann-test", minCharacters: 10 };

describe("safe content extraction", () => {
  it("rejects private, reserved, and mapped address classes", () => {
    expect(isPublicAddress("0.0.0.0")).toBe(false);
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("192.168.1.2")).toBe(false);
    expect(isPublicAddress("100.64.0.1")).toBe(false);
    expect(isPublicAddress("::1")).toBe(false);
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
  });

  it("rejects the insecure Node TLS escape hatch", () => {
    expect(() => assertTlsVerificationEnabled({ NODE_TLS_REJECT_UNAUTHORIZED: "0" })).toThrow("insecure_tls_configuration");
    expect(() => assertTlsVerificationEnabled({ NODE_TLS_REJECT_UNAUTHORIZED: "1" })).not.toThrow();
  });

  it("extracts bounded readable HTML", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      "<html><body><article><h1>Hello</h1><p>This is enough readable fixture content for Dorothy Ann.</p></article></body></html>",
      { headers: { "content-type": "text/html" } },
    ));
    const result = await new SafeContentExtractor(config, fetcher).extract(source, { maxCharacters: 100, timeoutMs: 1000 });
    expect(result.status).toBe("viable");
    if (result.status === "viable") expect(result.page.text).toContain("enough readable fixture content");
  });

  it("rejects a streamed response after the byte cap", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("0123456789"));
          controller.enqueue(new TextEncoder().encode("oversized"));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/plain" } },
    ));
    const result = await new SafeContentExtractor({ ...config, maxFetchBytes: 12 }, fetcher)
      .extract(source, { maxCharacters: 100, timeoutMs: 1000 });
    expect(result).toMatchObject({ status: "failed", code: "fetch_failed", retryable: false });
  });

  it("skips unsupported content", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("pdf", { headers: { "content-type": "application/pdf" } }));
    const result = await new SafeContentExtractor({ ...config, maxFetchBytes: 100 }, fetcher)
      .extract(source, { maxCharacters: 10, timeoutMs: 1000 });
    expect(result).toMatchObject({ status: "skipped", reason: "unsupported_content" });
  });
});
