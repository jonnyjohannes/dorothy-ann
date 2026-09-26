// @vitest-environment node
import { createServer } from "node:http";
import { lookup } from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicScript, isPublicAddress } from "../src/infrastructure/extraction/safe-content-extractor.js";
import { renderOfflineHtml } from "../scripts/local-empty-html-probe.js";
import { createLocalPublicScriptPilot } from "../scripts/local-public-script-pilot.js";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));
afterEach(() => vi.mocked(lookup).mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]));
const jsResponse = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "application/javascript", ...headers } });

describe("local public-script pilot", () => {
  it("rejects private, mapped, malformed, multicast, and re-bound network addresses before fetching", async () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "192.0.0.2", "198.18.0.1", "::1", "fe80::1", "fc00::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:a00:1", "::ffff:7f00:1", "garbage"])
      expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    const fetcher = vi.fn(async () => jsResponse("safe code"));
    expect(await fetchPublicScript("https://127.0.0.1/app.js", fetcher)).toBeNull();
    expect(await fetchPublicScript("http://example.org/app.js", fetcher)).toBeNull();
    expect(await fetchPublicScript("https://user:password@example.org/app.js", fetcher)).toBeNull();
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    expect(await fetchPublicScript("https://example.org/app.js", fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("pins a public HTTPS request and rejects redirect-to-private, non-JS, oversized, and empty responses", async () => {
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect(init).toHaveProperty("dispatcher");
      expect(init?.headers).not.toHaveProperty("cookie");
      return jsResponse("document.body.append('safe')");
    });
    expect(await fetchPublicScript("https://example.org/app.js", fetcher)).toBe("document.body.append('safe')");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }));
    expect(await fetchPublicScript("https://example.org/app.js", redirect)).toBeNull();
    expect(redirect).toHaveBeenCalledTimes(1);
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    const reboundRedirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://private.example.org/script.js" } }));
    expect(await fetchPublicScript("https://example.org/app.js", reboundRedirect)).toBeNull();
    expect(reboundRedirect).toHaveBeenCalledTimes(1);
    expect(await fetchPublicScript("https://example.org/app.js", async () => jsResponse("private", 200, { "content-type": "text/html" }))).toBeNull();
    expect(await fetchPublicScript("https://example.org/app.js", async () => jsResponse("x".repeat(256_001)))).toBeNull();
    expect(await fetchPublicScript("https://example.org/app.js", async () => jsResponse(""))).toBeNull();
  });

  it("times out an unresponsive script fetch without returning body bytes", async () => {
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("PRIVATE_ERROR", "AbortError")), { once: true });
    }));
    expect(await fetchPublicScript("https://example.org/hung.js", fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("loads only an approved external script while keeping the browser offline, including localhost", async () => {
    let received = 0;
    const server = createServer((_req, res) => { received++; res.end("not allowed"); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const html = `<html><body><main></main><script src="/app.js"></script><script src="data:text/javascript,document.body.append('UNAPPROVED')"></script></body></html>`;
      const script = `document.querySelector('main').textContent = 'Approved content. '.repeat(15); fetch('http://127.0.0.1:${port}/private').catch(() => {}); fetch('https://other.example.org/private').catch(() => {});`;
      const result = await renderOfflineHtml(html, undefined, 4_000, {
        baseUrl: "https://example.org/article", scripts: new Map([["https://example.org/app.js", script]]),
      });
      expect(result).toMatchObject({ render: "ok", semantic_text: "at_least_120", body_text: "at_least_120" });
      expect(result.blocked_requests).toBeGreaterThanOrEqual(1);
      expect(received).toBe(0);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("wires a fetched script into the offline renderer without admitting it to extraction", async () => {
    const emitted: unknown[] = [];
    const fetcher = vi.fn(async () => "document.querySelector('main').textContent = 'Fetched article words. '.repeat(12)");
    const probe = createLocalPublicScriptPilot((result) => { emitted.push(result); }, fetcher);
    probe({ html: '<html><body><main></main><script src="/bundle.js"></script></body></html>', baseUrl: "https://example.org/report" });
    await vi.waitFor(() => expect(emitted).toHaveLength(1), { timeout: 6_000 });
    expect(emitted[0]).toMatchObject({ render: "ok", semantic_text: "at_least_120", external_script_attempted: 1, external_script_fetched: 1 });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("https://example.org/bundle.js");
    expect(JSON.stringify(emitted)).not.toContain("Fetched article words");
  });

  it("caps samples and fetches, never emits page URL/content, and swallows observer failures", async () => {
    const emitted: unknown[] = [];
    const fetcher = vi.fn(async () => "document.body.append('PRIVATE_SCRIPT')");
    const render = vi.fn(async () => ({ render: "ok" as const, failure_stage: "none" as const, read_method: "page_eval" as const, semantic_text: "none" as const, body_text: "none" as const, blocked_requests: 0 }));
    const probe = createLocalPublicScriptPilot((result) => { emitted.push(result); throw new Error("PRIVATE_FAILURE"); }, fetcher, render);
    const sample = { baseUrl: "https://private.example.org/SECRET", html: `<script src="/one.js"></script><script src="/two.js"></script><script src="/three.js"></script><script src="/four.js"></script>` };
    probe(sample); probe(sample); probe(sample);
    await vi.waitFor(() => expect(emitted).toHaveLength(2));
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(render).toHaveBeenCalledTimes(2);
    expect(emitted).toEqual([1, 2].map((sample_index) => ({ sample_index, render: "ok", failure_stage: "none", read_method: "page_eval", semantic_text: "none", body_text: "none", blocked_requests: 0, external_script_attempted: 3, external_script_fetched: 3 })));
    expect(JSON.stringify(emitted)).not.toMatch(/PRIVATE|https:|\.js/);
  });
});
