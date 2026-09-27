import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("explicit fixture search is keyboard reachable on desktop and mobile", async ({ page }) => {
  await page.goto("/");
  const query = page.getByLabel("Search query");
  await expect(query).toBeVisible();
  await query.fill("/link weather");
  await query.press("Enter");
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fixture result for weather" }).first()).toBeVisible();
});

test("news command keeps a single article card and accessible cue across reload", async ({ page }) => {
  await page.goto("/");
  const query = page.getByLabel("Search query");
  await query.fill("/news update");
  await query.press("Enter");
  const evidence = page.getByRole("complementary", { name: "Evidence" });
  await expect(evidence.getByRole("img", { name: "News source" })).toBeVisible();
  await expect(evidence.locator("li")).toHaveCount(1);
  const metadata = evidence.locator("small").first();
  await expect(metadata).toHaveText("·example.com/fixture");
  const aligned = await metadata.evaluate((node) => {
    const centers = Array.from(node.children, (child) => { const box = child.getBoundingClientRect(); return box.top + box.height / 2; });
    return Math.max(...centers) - Math.min(...centers) < 3;
  });
  expect(aligned).toBe(true);
  await page.reload();
  await expect(evidence.getByRole("img", { name: "News source" })).toBeVisible();
  await expect(evidence.locator("li")).toHaveCount(1);
  await expect(evidence.getByRole("link", { name: "Link result: Fixture result for update" })).toBeVisible();
});

test("ordinary fixture input and its contextual follow-up complete", async ({ page }) => {
  await page.goto("/");
  const query = page.getByLabel("Search query");
  await query.fill("what happened?");
  await query.press("Enter");
  await expect(page.getByText("This is a bounded fixture answer grounded in the available evidence.")).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);

  await query.fill("what should I ask next?");
  await query.press("Enter");
  await expect(page.getByText("This is a bounded fixture answer grounded in the available evidence.")).toHaveCount(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("deferred fixture shows a plain provisional answer before terminal, then replaces it with cited durable content", async ({ page }) => {
  await page.goto("/");
  const query = page.getByLabel("Search query");
  await query.fill("what happened?");
  await query.press("Enter");
  const preview = page.getByRole("region", { name: "Provisional answer preview" });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("status")).toContainText("provisional · checking answer and citations");
  await expect(preview.locator("a")).toHaveCount(0);
  await expect(page.getByText("This is a bounded fixture answer grounded in the available evidence.")).toHaveCount(1);
  await expect(preview).toHaveCount(0);
  await expect(page.locator("article a[href]").first()).toBeVisible();
  await page.reload();
  await expect(preview).toHaveCount(0);
  await expect(page.getByText("This is a bounded fixture answer grounded in the available evidence.")).toHaveCount(1);
});

test("navigation during a deferred fixture preview never saves the provisional text", async ({ page }) => {
  await page.goto("/");
  const query = page.getByLabel("Search query");
  await query.fill("what happened?");
  await query.press("Enter");
  await expect(page.getByRole("region", { name: "Provisional answer preview" })).toBeVisible();
  await page.keyboard.press("Alt+s");
  await expect(page).toHaveURL(/\/threads$/);
  await expect(page.getByRole("region", { name: "Provisional answer preview" })).toHaveCount(0);
  await expect(page.getByText("This is a bounded fixture answer grounded in the available evidence.")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("This is a bounded fixture answer grounded in the available evidence.")).toHaveCount(0);
});

test("a disconnected fixture stream clears its provisional text without a saved answer", async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (typeof input !== "string" || !input.includes("/api/turn") || !response.body) return response;
      const reader = response.body.getReader();
      let pending = "";
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          while (true) {
            const next = await reader.read();
            if (next.done) { controller.close(); break; }
            pending += decoder.decode(next.value, { stream: true });
            const marker = pending.indexOf("event: turn.answer_delta");
            const end = marker < 0 ? -1 : pending.indexOf("\n\n", marker);
            if (end >= 0) {
              controller.enqueue(encoder.encode(pending.slice(0, end + 2)));
              await new Promise((resolve) => setTimeout(resolve, 350));
              controller.close();
              void reader.cancel();
              break;
            }
          }
        },
      });
      return new Response(body, { status: response.status, headers: response.headers });
    };
  });
  await page.goto("/");
  const query = page.getByLabel("Search query");
  await query.fill("what happened?");
  await query.press("Enter");
  // A deferred fixture supplies the first frame; the test transport closes before terminal.
  await expect(page.getByRole("region", { name: "Provisional answer preview" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Provisional answer preview" })).toHaveCount(0);
  await expect(page.getByText("This is a bounded fixture answer grounded in the available evidence.")).toHaveCount(0);
});

test("home has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});
