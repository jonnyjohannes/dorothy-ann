/* Development-only, count/bucket-only view of already-fetched static HTML. */
import { inspectEmptyHtmlShape } from "../src/infrastructure/extraction/safe-content-extractor.js";

type Shape = ReturnType<typeof inspectEmptyHtmlShape>;
export interface StaticShapeProbeResult {
  sample_index: 1 | 2;
  inspection: "ok" | "failed";
  shape: Shape | null;
}

export function createLocalStaticShapeProbe(
  emit: (result: StaticShapeProbeResult) => void,
  inspect: (html: string) => Shape = inspectEmptyHtmlShape,
): (sample: { html: string; baseUrl: string }) => void {
  let captured = 0;
  let pending = Promise.resolve();
  return (sample) => {
    if (captured >= 2) return;
    const sample_index = ++captured as 1 | 2;
    pending = pending.then(() => {
      let result: StaticShapeProbeResult;
      try { result = { sample_index, inspection: "ok", shape: inspect(sample.html) }; }
      catch { result = { sample_index, inspection: "failed", shape: null }; }
      try { emit(result); } catch { /* diagnostics cannot affect extraction */ }
    });
  };
}
