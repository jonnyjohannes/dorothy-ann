// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SafeContentExtractor, isPublicAddress } from "../src/infrastructure/extraction/safe-content-extractor.js";
import type { SearchResult } from "../src/domain/types.js";
import { EvidenceAcquirer } from "../src/application/evidence-acquirer.js";
import { logSelectedExtractionFailure } from "../server/runtime/extraction-log.js";
import { createLogger, type LogRecord } from "../server/runtime/logger.js";

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

describe("selected extraction diagnostics", () => {
  it("joins only the selected settled outcome to one sanitized server event", async () => {
    const metadata = new Map<string, Parameters<typeof logSelectedExtractionFailure>[1]["metadata"]>();
    const records: LogRecord[] = [];
    const logger = createLogger({ level: "info", sink: (record) => { records.push(record); } });
    const failed = { ...source, url: "https://example.org/report?secret=PRIVATE_QUERY", canonicalUrl: "https://example.org/report?secret=PRIVATE_QUERY" };
    const result = await new EvidenceAcquirer({
      search: { search: async () => [failed] },
      extractor: new SafeContentExtractor(config, async () => new Response(null, { status: 403 }), (sourceId, detail) => { metadata.set(sourceId, detail); }),
      onSelectedExtractionFailure: (entry) => {
        const detail = metadata.get(entry.sourceId);
        metadata.delete(entry.sourceId);
        logSelectedExtractionFailure(logger, { ...entry, metadata: detail });
      },
    }).acquire({ requests: [{ problemId: "problem" as never, query: "fixture", purpose: "verify", successCriterion: "supported", priority: 1, problemDepth: 0, createdOrder: 0 }],
      knownSources: [], availableEvidenceSourceIds: [], budget: { searchesRemaining: 1, sourcesRemaining: 1, assessmentsRemaining: 1, depthRemaining: 0 }, limits: {} });
    expect(result.extractions).toMatchObject([{ status: "failed", code: "fetch_failed", retryable: false }]);
    expect(result.budget.sourcesRemaining).toBe(0);
    expect(records).toMatchObject([{ event: "extraction_failed", reason: "fetch_failed", rank: 1, failure_phase: "fetch", failure_detail: "http_rejected", http_status_bucket: "403", url: "https://example.org/report" }]);
    expect(records).toHaveLength(1);
    expect(metadata.size).toBe(0);
    expect(JSON.stringify(records)).not.toContain("PRIVATE_QUERY");
  });
  const observed = async (fetcher: ConstructorParameters<typeof SafeContentExtractor>[1], selected = source, timeoutMs = 2_000) => {
    const events: unknown[] = [];
    const instance = new SafeContentExtractor(config, fetcher, (_id, detail) => { events.push(detail); throw new Error("observer failure"); });
    const outcome = await instance.extract(selected, { ...limits, timeoutMs });
    expect(events).toHaveLength(1);
    return { outcome, detail: events[0] };
  };

  it.each([
    [403, "403"], [429, "429"], [404, "other_4xx"], [503, "5xx"],
  ])("buckets HTTP rejection %i without raw status", async (status, bucket) => {
    const { outcome, detail } = await observed(async () => new Response(null, { status }));
    expect(outcome).toMatchObject({ status: "failed", code: "fetch_failed" });
    expect(detail).toEqual({ failure_phase: "fetch", failure_detail: "http_rejected", http_status_bucket: bucket });
  });

  it.each([
    ["zero_byte_body", "", "text/plain", "body"],
    ["unsupported_content", "binary", "application/pdf", "body"],
    ["no_readable_text", "<html><script>hidden</script></html>", "text/html", "text"],
    ["short_text", "Short", "text/plain", "text"],
    ["body_limit", "x".repeat(20_001), "text/plain", "body"],
  ])("classifies %s without changing outcome", async (expected, body, type, phase) => {
    const { outcome, detail } = await observed(async () => new Response(body, { headers: { "content-type": type } }));
    expect(outcome).toMatchObject(expected === "body_limit" ? { status: "failed", code: "fetch_failed" } : { status: "skipped" });
    expect(detail).toMatchObject({ failure_phase: phase, failure_detail: expected });
  });

  it("attributes typed DNS failures and fetch transport failures without interpreting messages", async () => {
    const dns = await import("node:dns/promises");
    const lookup = vi.mocked(dns.lookup);
    lookup.mockRejectedValueOnce(Object.assign(new Error("opaque"), { code: "ENOTFOUND" }));
    const dnsResult = await observed(async () => { throw new Error("must not fetch"); });
    expect(dnsResult.outcome).toMatchObject({ status: "skipped", reason: "unsafe_url" });
    expect(dnsResult.detail).toMatchObject({ failure_phase: "dns", failure_detail: "dns_failure" });
    const fetchResult = await observed(async () => { throw new Error("opaque provider text"); });
    expect(fetchResult.outcome).toMatchObject({ status: "failed", code: "fetch_failed" });
    expect(fetchResult.detail).toMatchObject({ failure_phase: "fetch", failure_detail: "transport_other" });
  });

  it("reports redirect blocks and never fetches unsafe destinations", async () => {
    let calls = 0;
    const { outcome, detail } = await observed(async () => { calls++; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }); });
    expect(outcome).toMatchObject({ status: "skipped", reason: "unsafe_url" });
    expect(detail).toMatchObject({ failure_detail: "redirect_blocked" });
    expect(calls).toBe(1);
  });

  it("reports the redirect phase when a redirect target is invalid", async () => {
    const events: unknown[] = [];
    const instance = new SafeContentExtractor(config, async () => new Response(null, { status: 302, headers: { location: "invalid://target" } }), (_id, detail) => events.push(detail));
    const outcome = await instance.extract(source, limits);
    expect(outcome).toMatchObject({ status: "skipped", reason: "unsafe_url" });
    expect(events).toMatchObject([{ failure_phase: "redirect", failure_detail: "redirect_blocked" }]);
  });

  it.each(["dns", "fetch", "body"])('reports the last reached %s phase at outer deadline and never reports late completion', async (phase) => {
    const events: unknown[] = [];
    const dns = await import("node:dns/promises");
    if (phase === "dns") vi.mocked(dns.lookup).mockImplementationOnce(async () => { await new Promise((resolve) => setTimeout(resolve, 35)); return [{ address: "93.184.216.34", family: 4 }]; });
    const slowFetch: ConstructorParameters<typeof SafeContentExtractor>[1] = async () => {
      if (phase === "fetch") await new Promise((resolve) => setTimeout(resolve, 35));
      if (phase === "body") return new Response(new ReadableStream({ start(controller) { setTimeout(() => { try { controller.enqueue(new TextEncoder().encode("x".repeat(130))); controller.close(); } catch { /* aborted reader */ } }, 35); } }), { headers: { "content-type": "text/plain" } });
      return new Response("x".repeat(130), { headers: { "content-type": "text/plain" } });
    };
    const instance = new SafeContentExtractor(config, slowFetch, (_id, detail) => events.push(detail));
    expect(await instance.extract(source, { ...limits, timeoutMs: 5 })).toMatchObject({ status: "failed", code: "timeout" });
    expect(events).toMatchObject([{ failure_phase: phase, failure_detail: "deadline" }]);
    await new Promise((resolve) => setTimeout(resolve, 45));
    expect(events).toHaveLength(1);
  });
});
