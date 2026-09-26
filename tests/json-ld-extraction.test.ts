// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { EvidenceAcquirer, type EvidenceRequest } from "../src/application/evidence-acquirer.js";
import { SafeContentExtractor, type ExtractionTextDiagnostic } from "../src/infrastructure/extraction/safe-content-extractor.js";
import type { SearchResult } from "../src/domain/types.js";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));

const config = { maxFetchBytes: 200_000, maxRedirects: 2, userAgent: "fixture", minCharacters: 120 };
const limits = { maxCharacters: 300, timeoutMs: 2_000 };
const source = (rank = 1): SearchResult => ({
  kind: "link", sourceId: `src_${String.fromCharCode(64 + rank).repeat(43)}` as SearchResult["sourceId"], rank,
  title: "Synthetic report", url: `https://example.org/report-${rank}`, canonicalUrl: `https://example.org/report-${rank}`, displayUrl: "example.org",
});
const report = "A synthetic article account, with substantive factual material. ".repeat(5);
const jsonScript = (value: unknown, type = "application/ld+json") => `<script type="${type}">${JSON.stringify(value).replaceAll("</", "<\\/")}</script>`;
const page = (body: string) => `<html><body>${body}</body></html>`;
const article = (text: string) => ({ "@context": "https://schema.org", "@type": "Article", articleBody: text });

function extractor(body: string, diagnostics: ExtractionTextDiagnostic[], onFetch?: () => void) {
  return new SafeContentExtractor(config, async () => {
    onFetch?.();
    return new Response(body, { headers: { "content-type": "text/html" } });
  }, (category) => { diagnostics.push(category); });
}

describe("same-body JSON-LD article extraction", () => {
  it("recovers a bounded Article articleBody without another fetch or a new identity", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    let fetches = 0;
    const result = await extractor(page(jsonScript(article("😀".repeat(150)))), diagnostics, () => { fetches++; }).extract(source(), { ...limits, maxCharacters: 120 });
    expect(result).toMatchObject({ status: "viable", sourceId: source().sourceId, page: { text: "😀".repeat(120), characterCount: 120 } });
    expect(fetches).toBe(1);
    expect(diagnostics).toEqual(["json_ld_recovered"]);
  });

  it("selects a qualified one-level @graph NewsArticle rather than unrelated metadata", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const html = page(jsonScript({ "@graph": [
      { "@type": "WebPage", description: report },
      { "@type": ["WebPage", "NewsArticle"], articleBody: report },
    ] }));
    const result = await extractor(html, diagnostics).extract(source(), limits);
    expect(result).toMatchObject({ status: "viable", page: { text: report.trim().slice(0, limits.maxCharacters), characterCount: limits.maxCharacters } });
    expect(diagnostics).toEqual(["json_ld_recovered"]);
  });

  it("sanitizes HTML-valued articleBody instead of admitting boilerplate or script text", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const body = `<nav>NAV_PRIVATE</nav><p>${report}</p><aside>ASIDE_PRIVATE</aside><p hidden>HIDDEN_PRIVATE</p><span style="display:none">STYLE_PRIVATE</span><script>CODE_PRIVATE</script>`;
    const result = await extractor(page(jsonScript(article(body))), diagnostics).extract(source(), limits);
    expect(result.status).toBe("viable");
    if (result.status !== "viable") return;
    expect(result.page.text).toContain("synthetic article account");
    for (const excluded of ["NAV_PRIVATE", "ASIDE_PRIVATE", "HIDDEN_PRIVATE", "STYLE_PRIVATE", "CODE_PRIVATE", "<p>"]) expect(result.page.text).not.toContain(excluded);
    expect(diagnostics).toEqual(["json_ld_recovered"]);
  });

  it("rejects malformed, nonarticle, short, deep, oversized, and over-count JSON-LD without weakening emptiness", async () => {
    const cases = [
      page('<script type="application/ld+json">{malformed</script>'),
      page(jsonScript({ "@type": "WebPage", description: report, articleBody: report })),
      page(jsonScript(article("Too short."))),
      page(jsonScript({ "@type": "Article", articleBody: { text: report } })),
      page(jsonScript({ mainEntity: article(report) })),
      page(jsonScript({ "@graph": [...Array.from({ length: 32 }, () => ({ "@type": "WebPage" })), article(report)] })),
      page(jsonScript(article("A".repeat(100_001)))),
      page(Array.from({ length: 4 }, () => jsonScript(article("Short."))).join("") + jsonScript(article(report))),
    ];
    for (const html of cases) {
      const diagnostics: ExtractionTextDiagnostic[] = [];
      expect(await extractor(html, diagnostics).extract(source(), limits)).toMatchObject({ status: "skipped", reason: "empty_content" });
      expect(diagnostics).toEqual(["no_readable_text", "html_no_text_with_script"]);
    }
  });

  it("keeps readable static text ahead of conflicting embedded data and ignores non-JSON scripts", async () => {
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const html = page(`<main><p>${report}</p></main>` + jsonScript(article("CONFLICT_PRIVATE ".repeat(20))) + jsonScript(article(report), "text/javascript"));
    const result = await extractor(html, diagnostics).extract(source(), limits);
    expect(result.status).toBe("viable");
    if (result.status !== "viable") return;
    expect(result.page.text).toContain("synthetic article account");
    expect(result.page.text).not.toContain("CONFLICT_PRIVATE");
    expect(diagnostics).toEqual([]);
  });

  it("keeps observer failures and late completions from changing extraction or reporting phantom recovery", async () => {
    const html = page(jsonScript(article(report)));
    const throwing = new SafeContentExtractor(config, async () => new Response(html, { headers: { "content-type": "text/html" } }), () => { throw new Error("SENTINEL_PRIVATE_OBSERVER"); });
    expect(await throwing.extract(source(), limits)).toMatchObject({ status: "viable" });
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const slow = new SafeContentExtractor(config, async () => {
      await new Promise((resolve) => setTimeout(resolve, 35));
      return new Response(html, { headers: { "content-type": "text/html" } });
    }, (category) => { diagnostics.push(category); });
    expect(await slow.extract(source(), { ...limits, timeoutMs: 5 })).toMatchObject({ status: "failed", code: "timeout" });
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(diagnostics).toEqual([]);
  });

  it("preserves high-rank ownership: two recovered pages prevent rank-four/five backfill", async () => {
    const candidates = [1, 2, 3, 4, 5].map(source);
    const fetched: number[] = [];
    const diagnostics: ExtractionTextDiagnostic[] = [];
    const fetcher = async (input: string | URL) => {
      const rank = Number(new URL(input).pathname.split("-").at(-1));
      fetched.push(rank);
      return new Response(page(rank < 3 ? jsonScript(article(report)) : "<script>no static article</script>"), { headers: { "content-type": "text/html" } });
    };
    const request: EvidenceRequest = { problemId: `problem_${"Z".repeat(43)}` as never, query: "test", purpose: "verify", successCriterion: "supported", priority: 1, problemDepth: 0, createdOrder: 0 };
    const acquirer = new EvidenceAcquirer({ search: { search: async () => candidates }, extractor: new SafeContentExtractor(config, fetcher, (category) => { diagnostics.push(category); }) });
    const result = await acquirer.acquire({
      requests: [request], knownSources: [], availableEvidenceSourceIds: [],
      budget: { searchesRemaining: 3, sourcesRemaining: 12, assessmentsRemaining: 8, depthRemaining: 2 },
      limits: {},
    });
    expect(fetched.sort()).toEqual([1, 2, 3]);
    expect(result.results[0].ownedConsumedSources.map((candidate) => candidate.rank)).toEqual([1, 2, 3]);
    expect(result.evidence[0].sources.map((item) => item.sourceId)).toEqual([source(1).sourceId, source(2).sourceId]);
    expect(result.budget.sourcesRemaining).toBe(9);
    expect(diagnostics.filter((category) => category === "json_ld_recovered")).toHaveLength(2);
  });
});
