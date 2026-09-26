// @vitest-environment node
import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createLocalOriginHtmlProbe } from "../scripts/local-origin-html-probe.js";
import { renderOfflineHtml } from "../scripts/local-empty-html-probe.js";

describe("local same-origin HTML comparison", () => {
  it("fulfills only the already-fetched document and reveals origin-dependent inline content without egress", async () => {
    let received = 0;
    const server = createServer((_request, response) => { received++; response.end("PRIVATE_NETWORK_RESPONSE"); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const html = `<html><body><main></main><script>
        if (location.pathname === '/article' && location.hash === '#section') {
          document.querySelector('main').textContent = 'Local origin article content. '.repeat(9);
          fetch('/private').catch(() => {});
          fetch('https://other.example.org/elsewhere').catch(() => {});
          const chunk = document.createElement('script'); chunk.src = '/dynamic.js'; document.body.append(chunk);
        }
      </script></body></html>`;
      const emitted: unknown[] = [];
      const probe = createLocalOriginHtmlProbe((result) => { emitted.push(result); });
      probe({ html, baseUrl: `http://127.0.0.1:${port}/article#section` });
      await vi.waitFor(() => expect(emitted).toHaveLength(1), { timeout: 10_000 });
      expect(emitted[0]).toMatchObject({
        sample_index: 1,
        baseline: { render: "ok", semantic_text: "none", body_text: "none", blocked_requests: 0 },
        origin: { render: "ok", semantic_text: "at_least_120", body_text: "at_least_120" },
      });
      expect((emitted[0] as { origin: { blocked_requests: number } }).origin.blocked_requests).toBeGreaterThanOrEqual(1);
      expect(received).toBe(0);
      expect(JSON.stringify(emitted)).not.toMatch(/PRIVATE|127\.0\.0\.1|other\.example|Local origin article/);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("denies a second document navigation to the same URL rather than fulfilling twice", async () => {
    let received = 0;
    const server = createServer((_request, response) => { received++; response.end("NO_NETWORK"); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const html = "<main>Short</main><script>setTimeout(() => { if (location.pathname === '/article') location.reload(); }, 20)</script>";
      const result = await renderOfflineHtml(html, undefined, 4_000, {
        baseUrl: `http://127.0.0.1:${port}/article`, scripts: new Map(),
      }, { atPageOrigin: true });
      expect(result.blocked_requests).toBeGreaterThanOrEqual(1);
      expect(received).toBe(0);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("refuses to combine page-origin fulfillment with external-script injection", async () => {
    const result = await renderOfflineHtml("<main></main><script src='/app.js'></script>", undefined, 4_000, {
      baseUrl: "https://example.org/article", scripts: new Map([["https://example.org/app.js", "PRIVATE_SCRIPT"]]),
    }, { atPageOrigin: true });
    expect(result).toMatchObject({ render: "failed", failure_stage: "document_load", semantic_text: null, body_text: null });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SCRIPT");
  });

  it("caps comparisons to two and reports only fixed categories even if renderer/observer fails", async () => {
    const emitted: unknown[] = [];
    const render = vi.fn(async (_html: string, _launch: unknown, _deadline: number, _resources: unknown, options?: { atPageOrigin: boolean }) => {
      if (options?.atPageOrigin) throw new Error("PRIVATE_SOURCE_PAYLOAD");
      return { render: "ok" as const, failure_stage: "none" as const, read_method: "page_eval" as const, semantic_text: "none" as const, body_text: "none" as const, blocked_requests: 0 };
    });
    const probe = createLocalOriginHtmlProbe((result) => { emitted.push(result); throw new Error("PRIVATE_OBSERVER_ERROR"); }, render);
    const sample = { html: "PRIVATE_HTML", baseUrl: "https://private.example.org/article" };
    probe(sample); probe(sample); probe(sample);
    await vi.waitFor(() => expect(emitted).toHaveLength(2));
    expect(render).toHaveBeenCalledTimes(4);
    for (const entry of emitted) expect(entry).toMatchObject({
      baseline: { render: "ok", body_text: "none" },
      origin: { render: "failed", failure_stage: "probe_runner", semantic_text: null, body_text: null },
    });
    expect(JSON.stringify(emitted)).not.toMatch(/PRIVATE|https:|article/);
  });
});
