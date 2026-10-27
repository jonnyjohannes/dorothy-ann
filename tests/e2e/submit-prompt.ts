import type { Page } from "@playwright/test";

/** Follow the actual submit affordance for each input mode. */
export async function submitPrompt(page: Page): Promise<void> {
  if (await page.evaluate(() => window.matchMedia("(hover: none) and (pointer: coarse)").matches)) {
    await page.getByRole("button", { name: "Send" }).tap();
  } else {
    await page.getByRole("textbox", { name: "Search query" }).press("Enter");
  }
}
