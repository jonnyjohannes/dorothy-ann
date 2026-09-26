/* Local development probe only. Never import this from the portable app or browser. */
export type TextBucket = "none" | "under_120" | "at_least_120";
export interface LocalHtmlProbeResult {
  sample_index: 1 | 2;
  render: "ok" | "failed";
  semantic_text: TextBucket;
  body_text: TextBucket;
  blocked_requests: number;
}
type RenderResult = Omit<LocalHtmlProbeResult, "sample_index">;

export function localProbeEnabled(flag: string | undefined, nodeEnv: string | undefined, fixture: boolean): boolean {
  return flag === "true" && nodeEnv === "development" && !fixture;
}

/** Offline context means external scripts cannot load; a negative result is inconclusive. */
export async function renderOfflineHtml(html: string): Promise<RenderResult> {
  let blocked = 0;
  let browser: Awaited<ReturnType<(typeof import("@playwright/test"))["chromium"]["launch"]>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { chromium } = await import("@playwright/test");
    browser = await chromium.launch({ headless: true, timeout: 5_000 });
    const running = browser;
    timer = setTimeout(() => { void running.close().catch(() => {}); }, 4_000);
    const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
    await context.route("**/*", async (route) => {
      blocked = Math.min(12, blocked + 1);
      await route.abort();
    });
    await context.routeWebSocket("**/*", (socket) => {
      blocked = Math.min(12, blocked + 1);
      socket.close();
    });
    const page = await context.newPage();
    context.on("page", (opened) => { if (opened !== page) void opened.close().catch(() => {}); });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 2_500 });
    await page.waitForTimeout(500);
    const text = await page.evaluate(() => {
      const bucket = (value: string | undefined): "none" | "under_120" | "at_least_120" => {
        const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
        if (!normalized) return "none";
        const characters = normalized[Symbol.iterator]();
        for (let length = 0; length < 120; length++) if (characters.next().done) return "under_120";
        return "at_least_120";
      };
      const semantic = document.querySelector("article") ?? document.querySelector("main") ?? document.querySelector("[role='main']");
      return { semantic_text: bucket((semantic as HTMLElement | null)?.innerText), body_text: bucket(document.body?.innerText) };
    });
    return { render: "ok", ...text, blocked_requests: blocked };
  } catch {
    return { render: "failed", semantic_text: "none", body_text: "none", blocked_requests: blocked };
  } finally {
    if (timer) clearTimeout(timer);
    await browser?.close().catch(() => {});
  }
}

/** Captures no URLs and queues at most two bounded HTML bodies for this process. */
export function createLocalEmptyHtmlProbe(
  emit: (result: LocalHtmlProbeResult) => void,
  render: (html: string) => Promise<RenderResult> = renderOfflineHtml,
): (html: string) => void {
  let captured = 0;
  let pending = Promise.resolve();
  return (html) => {
    if (captured >= 2) return;
    const sample_index = ++captured as 1 | 2;
    pending = pending.then(async () => {
      let result: RenderResult;
      try { result = await render(html); }
      catch { result = { render: "failed", semantic_text: "none", body_text: "none", blocked_requests: 0 }; }
      try { emit({ sample_index, ...result }); } catch { /* diagnostics cannot affect extraction */ }
    });
  };
}
