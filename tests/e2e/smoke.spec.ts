import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("explicit fixture search is keyboard reachable on desktop and mobile", async ({ page }) => {
  await page.goto("/");
  const query = page.getByLabel("Search query");
  await expect(query).toBeVisible();
  await query.fill("/search weather");
  await query.press("Enter");
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fixture result for weather" }).first()).toBeVisible();
});

test("ordinary fixture input completes a research turn", async ({ page }) => {
  await page.goto("/");
  const query = page.getByLabel("Search query");
  await query.fill("what happened?");
  await query.press("Enter");
  await expect(page.getByText("This is a bounded fixture answer grounded in the available evidence.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("home has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});
