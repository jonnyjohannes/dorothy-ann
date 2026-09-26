/* Development-only feasibility pilot. No page or script content is logged or admitted. */
import { parseHTML } from "linkedom";
import { fetchPublicScript } from "../src/infrastructure/extraction/safe-content-extractor.js";
import { renderOfflineHtml, type LocalHtmlProbeResult } from "./local-empty-html-probe.js";

type Sample = { html: string; baseUrl: string };
export interface PublicScriptPilotResult extends LocalHtmlProbeResult {
  external_script_attempted: number;
  external_script_fetched: number;
}

export function createLocalPublicScriptPilot(
  emit: (result: PublicScriptPilotResult) => void,
  fetchScript: (url: string) => Promise<string | null> = fetchPublicScript,
  render: typeof renderOfflineHtml = renderOfflineHtml,
): (sample: Sample) => void {
  let captured = 0;
  let pending = Promise.resolve();
  return (sample) => {
    if (captured >= 2) return;
    const sample_index = ++captured as 1 | 2;
    pending = pending.then(async () => {
      const scripts = new Map<string, string>();
      const requested = new Set<string>();
      let attempted = 0;
      try {
        const { document } = parseHTML(sample.html);
        for (const element of document.querySelectorAll("script[src]")) {
          if (attempted >= 3) break;
          let url: string;
          try { url = new URL(element.getAttribute("src") ?? "", sample.baseUrl).toString(); }
          catch { continue; }
          if (requested.has(url)) continue;
          requested.add(url);
          attempted++;
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 3_500); });
            const body = await Promise.race([fetchScript(url), timeout]);
            if (body !== null && body.length <= 256_000) scripts.set(url, body);
          } catch { /* no raw network error may enter the diagnostic */ }
          finally { if (timer) clearTimeout(timer); }
        }
      } catch { /* malformed markup leaves the pilot offline */ }
      let result: Omit<LocalHtmlProbeResult, "sample_index">;
      try { result = await render(sample.html, undefined, 4_000, { baseUrl: sample.baseUrl, scripts }); }
      catch { result = { render: "failed", failure_stage: "probe_runner", read_method: "none", semantic_text: null, body_text: null, blocked_requests: 0 }; }
      try { emit({ sample_index, ...result, external_script_attempted: attempted, external_script_fetched: scripts.size }); }
      catch { /* observer failure cannot affect research */ }
    });
  };
}
