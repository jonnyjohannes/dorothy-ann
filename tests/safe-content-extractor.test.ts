// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { SafeContentExtractor, type ExtractionTextDiagnostic } from "../src/infrastructure/extraction/safe-content-extractor.js";
import type { SearchResult } from "../src/domain/types.js";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async (host: string) => [{ address: host === "127.0.0.1" ? host : "93.184.216.34", family: 4 }]) }));

const source: SearchResult = {
  kind: "link", sourceId: `src_${"A".repeat(43)}` as never, rank: 1,
  title: "Synthetic report", url: "https://example.org/report", canonicalUrl: "https://example.org/report", displayUrl: "example.org",
};
const config = { maxFetchBytes: 20_000, maxRedirects: 2, userAgent: "fixture", minCharacters: 120 };
const limits = { maxCharacters: 300, timeoutMs: 2_000 };

function extractor(body: string, type: string, diagnostics: ExtractionTextDiagnostic[], status = 200) {
  return new SafeContentExtractor(config, async () => new Response(body, { status, headers: { "content-type": type } }), (category) => { diagnostics.push(category); });
}

describe("SafeContentExtractor readable text recovery", () => {
  it("uses Readability when the article already has enough text", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const html = `<html><body><article><h1>Report</h1><p>${"An actual report with relevant factual material. ".repeat(15)}</p></article></body></html>`;
    const result = await extractor(html, "text/html", diagnostics).extract(source, limits);
    expect(result.status).toBe("viable");
    expect(diagnostics).toEqual([]);
  });

  it("strips boilerplate and hidden text before accepting readable HTML", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const report = "A substantive account from a static page about the research question. ".repeat(3);
    const html = `<html><body><main><nav>${"NAV_SECRET ".repeat(12)}</nav><p>${report}</p><aside>${"ASIDE_SECRET ".repeat(12)}</aside><p hidden>HIDDEN_SECRET</p><span aria-hidden="true">ARIA_SECRET</span><span style="display: none">STYLE_SECRET</span><script>SCRIPT_SECRET</script></main></body></html>`;
    const result = await extractor(html, "text/html", diagnostics).extract(source, limits);
    expect(result.status).toBe("viable");
    if (result.status !== "viable") return;
    expect(result.page.text).toContain("substantive account");
    for (const excluded of ["NAV_SECRET", "ASIDE_SECRET", "HIDDEN_SECRET", "ARIA_SECRET", "STYLE_SECRET", "SCRIPT_SECRET"]) expect(result.page.text).not.toContain(excluded);
    expect(result.page.characterCount).toBe([...result.page.text].length);
    expect(diagnostics).toEqual([]);
  });

  it("does not use whole-body text to rescue a short page with no semantic root", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const html = "<html><body><div>Short body-only text without a semantic content region.</div></body></html>";
    const result = await extractor(html, "text/html", diagnostics).extract(source, limits);
    expect(result).toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(diagnostics).toEqual(["under_minimum"]);
  });

  it("distinguishes no readable text from short semantic HTML and plain text", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    expect(await extractor("<html><body><script>javascript only</script></body></html>", "text/html", diagnostics).extract(source, limits))
      .toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(await extractor("<html><body><article>Short.</article></body></html>", "text/html", diagnostics).extract(source, limits))
      .toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(await extractor("A short text response.", "text/plain", diagnostics).extract(source, limits))
      .toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(diagnostics).toEqual(["no_readable_text", "html_no_text_with_script", "under_minimum", "under_minimum"]);
  });

  it("classifies successful zero-byte, plain-whitespace, and script-free HTML responses without recording text", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const attempts = [
      extractor("", "text/html", diagnostics),
      extractor("  \n \t ", "text/plain", diagnostics),
      extractor("<html><body><nav>Navigation only</nav></body></html>", "text/html", diagnostics),
    ];
    for (const attempt of attempts) expect(await attempt.extract(source, limits)).toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(diagnostics).toEqual([
      "no_readable_text", "empty_body",
      "no_readable_text", "plain_no_text",
      "no_readable_text", "html_no_text_without_script",
    ]);
  });

  it("retains code-point bounds, plain-text viability, and existing HTTP/unsafe failures", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const viable = await extractor("😀".repeat(130), "text/plain", diagnostics).extract(source, { ...limits, maxCharacters: 120 });
    expect(viable).toMatchObject({ status: "viable", page: { characterCount: 120, text: "😀".repeat(120) } });
    expect(await extractor("blocked", "text/html", diagnostics, 403).extract(source, limits))
      .toMatchObject({ status: "failed", code: "fetch_failed" });
    expect(await extractor("unsupported", "application/pdf", diagnostics).extract(source, limits))
      .toMatchObject({ status: "skipped", reason: "unsupported_content" });
    expect(await extractor("not fetched", "text/html", diagnostics).extract({ ...source, url: "http://127.0.0.1/private" }, limits))
      .toMatchObject({ status: "skipped", reason: "unsafe_url" });
    expect(diagnostics).toEqual([]);
  });

  it("samples only completed script-present empty HTML, without changing the outcome", async () => {
    const sample = vi.fn(() => { throw new Error("probe unavailable"); });
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const attempt = (html: string, status = 200) => new SafeContentExtractor(config,
      async () => new Response(html, { status, headers: { "content-type": "text/html" } }),
      (category) => { diagnostics.push(category); }, sample);
    const matching = "<html><body><script>document.body.append('Later')</script></body></html>";
    expect(await attempt(matching).extract(source, limits)).toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(sample).toHaveBeenCalledExactlyOnceWith({ html: matching, baseUrl: source.url });
    await attempt("<html><body><nav>No article</nav></body></html>").extract(source, limits);
    await attempt("<html><body><main>Short</main><script></script></body></html>").extract(source, limits);
    await attempt(matching, 403).extract(source, limits);
    await attempt(matching).extract({ ...source, rank: 4 }, limits);
    expect(sample).toHaveBeenCalledTimes(1);
    expect(diagnostics).toEqual([
      "no_readable_text", "html_no_text_with_script",
      "no_readable_text", "html_no_text_without_script", "under_minimum",
      "no_readable_text", "html_no_text_with_script",
    ]);
  });

  it("never samples an extraction that finishes after its outer timeout", async () => {
    const sample = vi.fn();
    const html = "<html><body><script>inline</script></body></html>";
    const slow = new SafeContentExtractor(config, async () => {
      await new Promise((resolve) => setTimeout(resolve, 35));
      return new Response(html, { headers: { "content-type": "text/html" } });
    }, undefined, sample);
    expect(await slow.extract(source, { ...limits, timeoutMs: 5 })).toMatchObject({ status: "failed", code: "timeout" });
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(sample).not.toHaveBeenCalled();
  });

  it("ignores observer failures without changing extraction", async () => {
    const html = `<main><p>${"A useful and sufficiently long static source. ".repeat(5)}</p></main>`;
    const safe = new SafeContentExtractor(config, async () => new Response(html, { headers: { "content-type": "text/html" } }), () => { throw new Error("observer failure"); });
    expect(await safe.extract(source, limits)).toMatchObject({ status: "viable" });
  });
});
