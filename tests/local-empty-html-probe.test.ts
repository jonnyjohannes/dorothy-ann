// @vitest-environment node
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalEmptyHtmlProbe, localProbeEnabled, renderOfflineHtml } from "../scripts/local-empty-html-probe.js";

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
      return { render: "ok" as const, semantic_text: "none" as const, body_text: "under_120" as const, blocked_requests: 0 };
    });
    const probe = createLocalEmptyHtmlProbe((result) => { emitted.push(result); }, render);
    probe(privateText);
    probe("second");
    probe("third");
    await vi.waitFor(() => expect(emitted).toHaveLength(2));
    expect(render).toHaveBeenCalledTimes(2);
    expect(emitted).toEqual([
      { sample_index: 1, render: "ok", semantic_text: "none", body_text: "under_120", blocked_requests: 0 },
      { sample_index: 2, render: "ok", semantic_text: "none", body_text: "under_120", blocked_requests: 0 },
    ]);
    expect(JSON.stringify(emitted)).not.toContain(privateText);
  });

  it("swallows renderer and emitter failures without printing private HTML", async () => {
    const privateText = "PRIVATE_HTML_DO_NOT_LOG";
    const emitted: unknown[] = [];
    const probe = createLocalEmptyHtmlProbe((result) => { emitted.push(result); throw new Error(privateText); }, async () => { throw new Error(privateText); });
    probe(privateText);
    await vi.waitFor(() => expect(emitted).toHaveLength(1));
    expect(emitted).toEqual([{ sample_index: 1, render: "failed", semantic_text: "none", body_text: "none", blocked_requests: 0 }]);
    expect(JSON.stringify(emitted)).not.toContain(privateText);
  });

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
    expect(result).toMatchObject({ render: "ok", semantic_text: "at_least_120" });
    expect(requests).toBe(0);
  }, 15_000);
});
