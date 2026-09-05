import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("fixture lookup is keyboard reachable on desktop and mobile", async ({ page }) => {
  await page.goto("/");
  const query = page.getByLabel("Search query");
  await expect(query).toBeVisible();
  await query.fill("weather");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(page.getByText(/Fixture result for weather/)).toBeVisible();
});

test("home has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});
