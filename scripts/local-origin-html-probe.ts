/* Development-only comparison: the same captured HTML at about:blank and its origin, with no browser egress. */
import { renderOfflineHtml, type LocalHtmlProbeResult } from "./local-empty-html-probe.js";

type Sample = { html: string; baseUrl: string };
type Measurement = Omit<LocalHtmlProbeResult, "sample_index">;
export interface OriginHtmlProbeResult {
  sample_index: 1 | 2;
  baseline: Measurement;
  origin: Measurement;
}

export function createLocalOriginHtmlProbe(
  emit: (result: OriginHtmlProbeResult) => void,
  render: typeof renderOfflineHtml = renderOfflineHtml,
): (sample: Sample) => void {
  let captured = 0;
  let pending = Promise.resolve();
  return (sample) => {
    if (captured >= 2) return;
    const sample_index = ++captured as 1 | 2;
    pending = pending.then(async () => {
      const resources = { baseUrl: sample.baseUrl, scripts: new Map<string, string>() };
      const measure = async (atPageOrigin: boolean): Promise<Measurement> => {
        try { return await render(sample.html, undefined, 4_000, resources, { atPageOrigin }); }
        catch {
          return { render: "failed", failure_stage: "probe_runner", read_method: "none", semantic_text: null, body_text: null, blocked_requests: 0 };
        }
      };
      const baseline = await measure(false);
      const origin = await measure(true);
      try { emit({ sample_index, baseline, origin }); } catch { /* local observation cannot affect research */ }
    });
  };
}
