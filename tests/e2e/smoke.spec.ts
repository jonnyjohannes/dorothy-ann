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

test("home has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});
