/* Local development probe only. Never import this from the portable app or browser. */
export type TextBucket = "none" | "under_120" | "at_least_120";
export type ProbeFailureStage = "none" | "browser_launch" | "context_setup" | "document_load" | "dom_read" | "deadline" | "probe_runner";
export interface LocalHtmlProbeResult {
  sample_index: 1 | 2;
  render: "ok" | "failed";
  failure_stage: ProbeFailureStage;
  read_method: "page_eval" | "locator" | "none";
  /** Null means rendering failed; "none" means a completed DOM had no visible text. */
  semantic_text: TextBucket | null;
  body_text: TextBucket | null;
  blocked_requests: number;
}
type RenderResult = Omit<LocalHtmlProbeResult, "sample_index">;
type Browser = Awaited<ReturnType<(typeof import("@playwright/test"))["chromium"]["launch"]>>;
type BrowserLauncher = () => Promise<Browser>;

export function localProbeEnabled(flag: string | undefined, nodeEnv: string | undefined, fixture: boolean): boolean {
  return flag === "true" && nodeEnv === "development" && !fixture;
}

function textBucket(text: string): TextBucket {
  let length = 0;
  let pendingSpace = false;
  for (const character of text) {
    if (/\s/u.test(character)) { if (length) pendingSpace = true; continue; }
    if (pendingSpace) { if (++length >= 120) return "at_least_120"; pendingSpace = false; }
    if (++length >= 120) return "at_least_120";
  }
  return length ? "under_120" : "none";
}

/** Offline context means external scripts cannot load; a negative result is inconclusive. */
export async function renderOfflineHtml(
  html: string,
  launchBrowser: BrowserLauncher = async () => {
    const { chromium } = await import("@playwright/test");
    return chromium.launch({ headless: true, timeout: 5_000 });
  },
  deadlineMs = 4_000,
): Promise<RenderResult> {
  let blocked = 0;
  let browser: Browser | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stage: Exclude<ProbeFailureStage, "none"> = "browser_launch";
  let deadlineReached = false;
  try {
    browser = await launchBrowser();
    const running = browser;
    timer = setTimeout(() => { deadlineReached = true; void running.close().catch(() => {}); }, Math.max(1, Math.min(4_000, deadlineMs)));
    stage = "context_setup";
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
    stage = "document_load";
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 2_500 });
    await page.waitForTimeout(500);
    stage = "dom_read";
    let read_method: "page_eval" | "locator" = "page_eval";
    let text: { semantic_text: TextBucket; body_text: TextBucket };
    try {
      text = await page.evaluate(() => {
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
    } catch {
      // Locator text reads use Playwright's isolated selector machinery rather
      // than page-owned DOM helpers. No page text leaves this local callback.
      read_method = "locator";
      let semanticText = "";
      for (const selector of ["article", "main", "[role='main']"]) {
        const locator = page.locator(selector).first();
        if (await locator.count()) { semanticText = await locator.innerText({ timeout: 600 }); break; }
      }
      const body = page.locator("body").first();
      const bodyText = await body.count() ? await body.innerText({ timeout: 600 }) : "";
      text = { semantic_text: textBucket(semanticText), body_text: textBucket(bodyText) };
    }
    return { render: "ok", failure_stage: "none", read_method, ...text, blocked_requests: blocked };
  } catch {
    return { render: "failed", failure_stage: deadlineReached ? "deadline" : stage, read_method: "none", semantic_text: null, body_text: null, blocked_requests: blocked };
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
      catch { result = { render: "failed", failure_stage: "probe_runner", read_method: "none", semantic_text: null, body_text: null, blocked_requests: 0 }; }
      try { emit({ sample_index, ...result }); } catch { /* diagnostics cannot affect extraction */ }
    });
  };
}
