/* Development-only two-page UA comparison. Discards both HTML bodies; never admits diagnostic text. */
import { compareHtmlPresentation, inspectEmptyHtmlShape, type PresentationComparison } from "../src/infrastructure/extraction/safe-content-extractor.js";

type Shape = ReturnType<typeof inspectEmptyHtmlShape>;
type Summary = Pick<Shape, "bytes" | "body_dom_text_before" | "body_before" | "root_dom_text_before" | "root_text_after">;
export interface FetchPresentationProbeResult {
  sample_index: 1 | 2;
  original: Summary | null;
  refetch_outcome: PresentationComparison["outcome"];
  refetch: Summary | null;
}

function summarize(shape: Shape): Summary {
  return {
    bytes: shape.bytes, body_dom_text_before: shape.body_dom_text_before,
    body_before: shape.body_before, root_dom_text_before: shape.root_dom_text_before,
    root_text_after: shape.root_text_after,
  };
}

export function createLocalFetchPresentationProbe(
  emit: (result: FetchPresentationProbeResult) => void,
  compare: (url: string) => Promise<PresentationComparison> = compareHtmlPresentation,
): (sample: { html: string; baseUrl: string }) => void {
  let captured = 0;
  let pending = Promise.resolve();
  return (sample) => {
    if (captured >= 2) return;
    const sample_index = ++captured as 1 | 2;
    pending = pending.then(async () => {
      let original: Summary | null = null;
      let outcome: PresentationComparison = { outcome: "failed", shape: null };
      try {
        original = summarize(inspectEmptyHtmlShape(sample.html));
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const deadline = new Promise<PresentationComparison>((resolve) => {
            timer = setTimeout(() => resolve({ outcome: "timeout", shape: null }), 8_500);
          });
          outcome = await Promise.race([compare(sample.baseUrl), deadline]);
        } finally { if (timer) clearTimeout(timer); }
      } catch { /* no raw page, URL, fetch or parser error leaves the probe */ }
      const result: FetchPresentationProbeResult = {
        sample_index, original, refetch_outcome: outcome.outcome,
        refetch: outcome.outcome === "html" ? summarize(outcome.shape) : null,
      };
      try { emit(result); } catch { /* no effect on acquisition */ }
    });
  };
}
