// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { inspectEmptyHtmlShape } from "../src/infrastructure/extraction/safe-content-extractor.js";
import { createLocalStaticShapeProbe } from "../scripts/local-static-shape-probe.js";

describe("local static-response boundary inspection", () => {
  it("separates script-only HTML from static text stripped by the sanitizer", () => {
    const shell = inspectEmptyHtmlShape("<html><body><script>document.body.append('PRIVATE_RUNTIME_TEXT')</script></body></html>");
    expect(shell).toMatchObject({ bytes: "under_4k", body_present: true, root_before: false, root_after: false,
      body_before: "none", root_text_before: "none", body_dom_text_before: "none", root_dom_text_before: "none",
      body_after: "none", root_text_after: "none",
      inline_scripts: "one", external_scripts: "none" });
    const removed = inspectEmptyHtmlShape(`<html><body><nav><main>${"Important text before policy. ".repeat(12)}</main></nav><script src="/app.js"></script></body></html>`);
    expect(removed).toMatchObject({ body_before: "at_least_120", root_before: true, root_text_before: "at_least_120",
      body_dom_text_before: "at_least_120", root_dom_text_before: "at_least_120",
      body_after: "none", root_after: false, root_text_after: "none", inline_scripts: "none", external_scripts: "one" });
    expect(JSON.stringify([shell, removed])).not.toMatch(/PRIVATE_RUNTIME_TEXT|Important text|app\.js/);
  });

  it("caps process samples, never emits page identity, and swallows parser and observer failures", async () => {
    const emitted: unknown[] = [];
    const inspect = vi.fn((html: string) => {
      if (html.includes("FAIL")) throw new Error("PRIVATE_PAYLOAD");
      return inspectEmptyHtmlShape(html);
    });
    const probe = createLocalStaticShapeProbe((result) => { emitted.push(result); throw new Error("PRIVATE_OBSERVER"); }, inspect);
    probe({ html: "<body><script>PRIVATE_CONTENT</script></body>", baseUrl: "https://private.example.org/one" });
    probe({ html: "FAIL PRIVATE_CONTENT", baseUrl: "https://private.example.org/two" });
    probe({ html: "THIRD PRIVATE_CONTENT", baseUrl: "https://private.example.org/three" });
    await vi.waitFor(() => expect(emitted).toHaveLength(2));
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(emitted[0]).toMatchObject({ sample_index: 1, inspection: "ok", shape: { body_before: "none", body_after: "none" } });
    expect(emitted[1]).toEqual({ sample_index: 2, inspection: "failed", shape: null });
    expect(JSON.stringify(emitted)).not.toMatch(/PRIVATE|https:|\.org|FAIL/);
  });

  it("refuses an oversized diagnostic body without leaking contents", async () => {
    const emitted: unknown[] = [];
    const probe = createLocalStaticShapeProbe((result) => { emitted.push(result); });
    probe({ html: "SECRET" + "x".repeat(2_000_001), baseUrl: "https://example.org/" });
    await vi.waitFor(() => expect(emitted).toHaveLength(1));
    expect(emitted).toEqual([{ sample_index: 1, inspection: "failed", shape: null }]);
  });
});
