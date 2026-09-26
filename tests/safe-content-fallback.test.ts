// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { SafeContentExtractor, type ExtractionTextDiagnostic } from "../src/infrastructure/extraction/safe-content-extractor.js";
import type { SearchResult } from "../src/domain/types.js";

// Exercise the bounded fallback deterministically when Readability cannot identify an article.
vi.mock("@mozilla/readability", () => ({ Readability: class { parse() { return null; } } }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));

const source: SearchResult = {
  kind: "link", sourceId: `src_${"A".repeat(43)}` as never, rank: 1,
  title: "Synthetic report", url: "https://example.org/report", canonicalUrl: "https://example.org/report", displayUrl: "example.org",
};
const config = { maxFetchBytes: 20_000, maxRedirects: 2, userAgent: "fixture", minCharacters: 120 };
const limits = { maxCharacters: 200, timeoutMs: 2_000 };

async function extract(html: string, diagnostics: ExtractionTextDiagnostic[], onFetch?: () => void) {
  return new SafeContentExtractor(config, async () => {
    onFetch?.();
    return new Response(html, { headers: { "content-type": "text/html" } });
  }, (category) => { diagnostics.push(category); }).extract(source, limits);
}

describe("static HTML fallback after empty Readability", () => {
  it("recovers only bounded visible article/main text and reports a count-only category", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const report = "The documented account contains a meaningful, verifiable description. ".repeat(4);
    const html = `<html><body><header>${"HEADER_SECRET ".repeat(30)}</header><main><nav>${"NAV_SECRET ".repeat(20)}</nav><article><p>${report}</p><script>SCRIPT_SECRET</script><div hidden>HIDDEN_SECRET</div><span style="visibility: hidden">STYLE_SECRET</span></article><aside>ASIDE_SECRET</aside></main></body></html>`;
    let fetches = 0;
    const result = await extract(html, diagnostics, () => { fetches++; });
    expect(fetches).toBe(1);
    expect(result.status).toBe("viable");
    if (result.status !== "viable") return;
    expect(result.page.text).toContain("documented account");
    expect(result.page.characterCount).toBe(200);
    for (const excluded of ["HEADER_SECRET", "NAV_SECRET", "SCRIPT_SECRET", "HIDDEN_SECRET", "STYLE_SECRET", "ASIDE_SECRET"]) expect(result.page.text).not.toContain(excluded);
    expect(diagnostics).toEqual(["fallback_recovered"]);
    expect(JSON.stringify(diagnostics)).not.toContain(report);
  });

  it("can recover an explicit role-main region without using whole-body text", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const html = `<body><div role="main"><p>${"A verified source with enough static content to be examined. ".repeat(4)}</p></div></body>`;
    expect(await extract(html, diagnostics)).toMatchObject({ status: "viable" });
    expect(diagnostics).toEqual(["fallback_recovered"]);
  });

  it("counts static text outside an empty semantic root without admitting it", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const html = `<body><main></main><div>${"Static text outside the empty main region. ".repeat(5)}</div></body>`;
    expect(await extract(html, diagnostics)).toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(diagnostics).toEqual(["no_readable_text", "html_text_outside_semantic_root"]);
  });

  it("rejects short semantic content and never promotes body-only boilerplate", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    expect(await extract("<main>Short report.</main>", diagnostics)).toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(await extract(`<body><div>${"Boilerplate with no semantic content region. ".repeat(6)}</div></body>`, diagnostics))
      .toMatchObject({ status: "skipped", reason: "empty_content" });
    expect(diagnostics).toEqual(["under_minimum", "no_readable_text", "html_text_without_semantic_root"]);
  });
});
