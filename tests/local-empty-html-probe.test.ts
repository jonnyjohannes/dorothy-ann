// @vitest-environment node
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalEmptyHtmlProbe, localProbeEnabled, renderOfflineHtml, type ProbeFailureStage } from "../scripts/local-empty-html-probe.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("local-only empty HTML probe", () => {
  it("requires both explicit opt-in and a development nonfixture runtime", () => {
    expect(localProbeEnabled("true", "development", false)).toBe(true);
    expect(localProbeEnabled("false", "development", false)).toBe(false);
    expect(localProbeEnabled("true", "production", false)).toBe(false);
    expect(localProbeEnabled("true", "development", true)).toBe(false);
    expect(localProbeEnabled(undefined, "development", false)).toBe(false);
  });

  it("retains no more than two samples and emits only result categories even if rendering fails", async () => {
    const privateText = "PRIVATE_HTML_DO_NOT_LOG";
    const emitted: unknown[] = [];
    const render = vi.fn(async (html: string) => {
      expect(typeof html).toBe("string");
      return { render: "ok" as const, failure_stage: "none" as const, read_method: "page_eval" as const, semantic_text: "none" as const, body_text: "under_120" as const, blocked_requests: 0 };
    });
    const probe = createLocalEmptyHtmlProbe((result) => { emitted.push(result); }, render);
    probe(privateText);
    probe("second");
    probe("third");
    await vi.waitFor(() => expect(emitted).toHaveLength(2));
    expect(render).toHaveBeenCalledTimes(2);
    expect(emitted).toEqual([
      { sample_index: 1, render: "ok", failure_stage: "none", read_method: "page_eval", semantic_text: "none", body_text: "under_120", blocked_requests: 0 },
      { sample_index: 2, render: "ok", failure_stage: "none", read_method: "page_eval", semantic_text: "none", body_text: "under_120", blocked_requests: 0 },
    ]);
    expect(JSON.stringify(emitted)).not.toContain(privateText);
  });

  it("swallows renderer and emitter failures without printing private HTML", async () => {
    const privateText = "PRIVATE_HTML_DO_NOT_LOG";
    const emitted: unknown[] = [];
    const probe = createLocalEmptyHtmlProbe((result) => { emitted.push(result); throw new Error(privateText); }, async () => { throw new Error(privateText); });
    probe(privateText);
    await vi.waitFor(() => expect(emitted).toHaveLength(1));
    expect(emitted).toEqual([{ sample_index: 1, render: "failed", failure_stage: "probe_runner", read_method: "none", semantic_text: null, body_text: null, blocked_requests: 0 }]);
    expect(JSON.stringify(emitted)).not.toContain(privateText);
  });

  it("reports only fixed failure stages, including deadline, with unmeasured text buckets", async () => {
    const privateText = "PRIVATE_BROWSER_FAILURE_DO_NOT_LOG";
    type BrowserLauncher = NonNullable<Parameters<typeof renderOfflineHtml>[1]>;
    type Browser = Awaited<ReturnType<BrowserLauncher>>;
    const launchFailure: BrowserLauncher = async () => { throw new Error(privateText); };
    const makeLauncher = (where: "context_setup" | "document_load" | "dom_read" | "deadline"): BrowserLauncher => async () => {
      let rejectLoad: ((error: Error) => void) | undefined;
      const page = {
        setContent: async () => {
          if (where === "document_load") throw new Error(privateText);
          if (where === "deadline") await new Promise<void>((_resolve, reject) => { rejectLoad = reject; });
        },
        waitForTimeout: async () => {},
        evaluate: async () => {
          if (where === "dom_read") throw new Error(privateText);
          return { semantic_text: "none", body_text: "none" };
        },
        locator: () => { throw new Error(privateText); },
      };
      return {
        newContext: async () => {
          if (where === "context_setup") throw new Error(privateText);
          return { route: async () => {}, routeWebSocket: async () => {}, newPage: async () => page, on: () => {} };
        },
        close: async () => { rejectLoad?.(new Error(privateText)); },
      } as unknown as Browser;
    };
    const cases: { stage: ProbeFailureStage; launch: BrowserLauncher; deadline?: number }[] = [
      { stage: "browser_launch", launch: launchFailure },
      { stage: "context_setup", launch: makeLauncher("context_setup") },
      { stage: "document_load", launch: makeLauncher("document_load") },
      { stage: "dom_read", launch: makeLauncher("dom_read") },
      { stage: "deadline", launch: makeLauncher("deadline"), deadline: 10 },
    ];
    for (const entry of cases) {
      const result = await renderOfflineHtml(privateText, entry.launch, entry.deadline);
      expect(result).toEqual({ render: "failed", failure_stage: entry.stage, read_method: "none", semantic_text: null, body_text: null, blocked_requests: 0 });
      expect(JSON.stringify(result)).not.toContain(privateText);
    }
  });

  it("recovers a count-only DOM measurement if inline page code replaces DOM helpers", async () => {
    const html = `<html><body><script>
      document.body.innerHTML += '<main>' + 'Synthetic rendered content. '.repeat(7) + '</main>';
      document.querySelector = () => { throw new Error('PRIVATE_PAGE_ERROR'); };
    </script></body></html>`;
    const result = await renderOfflineHtml(html);
    expect(result).toMatchObject({ render: "ok", failure_stage: "none", read_method: "locator", semantic_text: "at_least_120", body_text: "at_least_120" });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PAGE_ERROR");
  }, 15_000);

  it("executes inline rendering while remaining offline for HTTP, image and WebSocket requests", async () => {
    let requests = 0;
    const server = createServer((_request, response) => { requests++; response.end("PRIVATE_NETWORK_RESPONSE"); });
    server.on("upgrade", (socket) => { requests++; socket.destroy(); });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture server did not start");
    const target = `http://127.0.0.1:${address.port}`;
    const html = `<html><body><script>
      document.body.innerHTML += '<main>' + 'Rendered locally. '.repeat(12) + '</main>';
      fetch('${target}/fetch').catch(() => {});
      new Image().src = '${target}/image';
      try { new WebSocket('ws://127.0.0.1:${address.port}/socket'); } catch {}
    </script><script src="${target}/external.js"></script></body></html>`;
    const result = await renderOfflineHtml(html);
    expect(result).toMatchObject({ render: "ok", failure_stage: "none", read_method: "page_eval", semantic_text: "at_least_120" });
    expect(requests).toBe(0);
  }, 15_000);
});
