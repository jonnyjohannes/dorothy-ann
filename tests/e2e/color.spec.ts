import { expect, test } from "@playwright/test";

test("legacy accent stays inert and editing/scroll focus remains ink-paper", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dorothy-ann-primary-accent", "e068a5"));
  await page.goto("/new");
  const input = page.getByLabel("Search query");
  for (const scheme of ["mono", "catppuccin", "rose-pine"]) {
    for (const theme of ["light", "dark", "auto"]) {
      await page.evaluate(({ scheme, theme }) => {
        localStorage.setItem("dorothy-ann-color-scheme", scheme);
        localStorage.setItem("dorothy-ann-theme", theme);
        window.dispatchEvent(new Event("dorothy-ann-preference-change"));
      }, { scheme, theme });
      await input.focus();
      const colors = await input.evaluate((element) => {
        const root = getComputedStyle(document.documentElement);
        return { ink: root.color, caret: getComputedStyle(element).caretColor,
          border: getComputedStyle(element.parentElement!).borderColor, override: document.documentElement.style.getPropertyValue("--accent") };
      });
      expect(colors.caret).toBe(colors.ink);
      expect(colors.border).toBe(colors.ink);
      expect(colors.override).toBe("");
      await input.fill("composition remains editable");
      await expect(input).toHaveValue("composition remains editable");
    }
  }
  await page.locator(".app-route-scroll").evaluate((element) => element.insertAdjacentHTML("beforeend", "<p>Long content</p>".repeat(100)));
  const scroller = page.locator(".app-route-scroll");
  const indicator = page.getByRole("scrollbar", { name: "Route content scroll position" });
  await expect(indicator).toBeVisible();
  await scroller.focus();
  await expect(indicator).toHaveClass(/surface-focused/);
  expect(await scroller.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
  expect(await indicator.evaluate((element) => getComputedStyle(element).outlineColor)).toBe(await scroller.evaluate((element) => getComputedStyle(element).color));
  await indicator.focus();
  expect(await indicator.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  if (test.info().project.name === "chromium") {
    await page.emulateMedia({ forcedColors: "active" });
    await indicator.focus();
    expect(await indicator.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
    expect(await indicator.locator("div").evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    await page.emulateMedia({ forcedColors: "none" });
  }
  await indicator.evaluate((element) => element.remove());
  await scroller.evaluate((element) => element.classList.remove("has-custom-scroll-indicator"));
  await scroller.focus();
  expect(await scroller.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  expect(await scroller.evaluate((element) => getComputedStyle(element).outlineColor)).toBe(await scroller.evaluate((element) => getComputedStyle(element).color));
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await input.evaluate((element) => getComputedStyle(element).caretColor)).toBe(await scroller.evaluate((element) => getComputedStyle(element).color));
});

test("a page draw assigns stable distinct scroll slots and matches the native fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    localStorage.setItem("dorothy-ann-color-scheme", "catppuccin");
  });
  await page.goto("/new");
  await expect(page.locator(".app-route-scroll")).toBeVisible();
  await page.evaluate(() => {
    const route = document.querySelector(".app-route-scroll")!;
    for (let index = 0; index < 3; index++) {
      const surface = document.createElement("div");
      surface.className = "app-scroll-surface";
      surface.style.cssText = "height:70px;overflow:auto;width:180px";
      surface.textContent = "overflow ".repeat(100);
      route.append(surface);
    }
  });
  const surfaces = page.locator(".app-scroll-surface");
  await expect.poll(() => page.getByRole("scrollbar", { name: "Page scroll position" }).count()).toBe(3);
  const read = () => surfaces.evaluateAll((elements) => elements.map((element) => ({
    slot: (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"),
    native: getComputedStyle(element).scrollbarColor,
  })));
  const first = await read();
  expect(new Set(first.map((entry) => entry.slot)).size).toBe(3);
  if (test.info().project.name === "chromium") for (const entry of first) expect(entry.native).toContain("rgb(");
  const indicators = page.getByRole("scrollbar", { name: "Page scroll position" });
  for (let index = 0; index < 3; index++) {
    expect(await indicators.nth(index).evaluate((element) => element.style.getPropertyValue("--scroll-thumb-color"))).toBe(first[index]!.slot);
  }
  await surfaces.first().evaluate((element) => { element.scrollTop = 30; });
  expect((await read()).map((entry) => entry.slot)).toEqual(first.map((entry) => entry.slot));
  await surfaces.nth(1).evaluate((element) => element.remove());
  await page.evaluate(() => {
    const surface = document.createElement("div");
    surface.className = "app-scroll-surface";
    surface.style.cssText = "height:70px;overflow:auto;width:180px";
    surface.textContent = "overflow ".repeat(100);
    document.querySelector(".app-route-scroll")!.append(surface);
  });
  await expect.poll(() => page.getByRole("scrollbar", { name: "Page scroll position" }).count()).toBe(3);
  const replaced = await read();
  expect(new Set(replaced.map((entry) => entry.slot)).size).toBe(3);
  expect(replaced[0]!.slot).toBe(first[0]!.slot);
  expect(replaced[1]!.slot).toBe(first[2]!.slot);
  await page.evaluate(() => { localStorage.setItem("dorothy-ann-color-scheme", "mono"); window.dispatchEvent(new Event("dorothy-ann-preference-change")); });
  expect((await read()).map((entry) => entry.slot)).toEqual(["var(--accent-1)", "var(--accent-1)", "var(--accent-1)"]);
  await page.evaluate(() => { localStorage.setItem("dorothy-ann-color-scheme", "rose-pine"); window.dispatchEvent(new Event("dorothy-ann-preference-change")); });
  expect((await read()).map((entry) => entry.slot)).toEqual(replaced.map((entry) => entry.slot));
  await page.reload();
  await expect(page.getByLabel("Search query")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--accent"))).toBe("");
});

test("a locked route keeps its scroll hue while a menu and another surface mount", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    localStorage.setItem("dorothy-ann-color-scheme", "catppuccin");
  });
  await page.goto("/new");
  await page.locator(".app-route-scroll").evaluate((element) => element.insertAdjacentHTML("beforeend", "<p>Long content</p>".repeat(100)));
  const route = page.locator(".app-route-scroll");
  const indicator = page.getByRole("scrollbar", { name: "Route content scroll position" });
  await expect(indicator).toBeVisible();
  const originalSlot = await route.evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"));
  await page.getByLabel("Search query").fill("/");
  await expect(page.getByRole("listbox", { name: "Commands" })).toBeVisible();
  await expect(indicator).toHaveCount(0);
  await page.evaluate(() => {
    const surface = document.createElement("div");
    surface.className = "app-scroll-surface";
    surface.style.cssText = "height:70px;overflow:auto;width:180px";
    surface.textContent = "overflow ".repeat(100);
    document.body.append(surface);
  });
  const added = page.locator(".app-scroll-surface");
  await expect(page.getByRole("scrollbar", { name: "Page scroll position" })).toBeVisible();
  expect(await added.evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"))).not.toBe(originalSlot);
  await page.getByLabel("Search query").press("Escape");
  await expect(indicator).toBeVisible();
  expect(await route.evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"))).toBe(originalSlot);
  expect(await indicator.evaluate((element) => element.style.getPropertyValue("--scroll-thumb-color"))).toBe(originalSlot);
});

test("thread search and row selection keep distinct focus and hue cues", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dorothy-ann-color-scheme", "catppuccin"));
  for (const title of ["first fixture topic", "second fixture topic"]) {
    await page.goto("/new");
    const prompt = page.getByLabel("Search query");
    await prompt.fill(title);
    await prompt.press("Enter");
    await expect(page).toHaveURL(/\/threads\/(?!new$)[^/?]+$/);
    await expect(page.getByText("This is a bounded fixture answer grounded in the available evidence.")).toBeVisible();
  }
  await page.goto("/threads");
  const search = page.getByLabel("Find threads");
  await expect(search).toBeVisible();
  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  const read = () => rows.evaluateAll((elements) => {
    const selected = elements.find((element) => element.className.includes("threadSelected"))! as HTMLElement;
    const style = getComputedStyle(selected);
    const ink = getComputedStyle(document.documentElement).color;
    return { slot: selected.style.getPropertyValue("--thread-active-accent"), background: style.backgroundColor, ink, caret: getComputedStyle(document.querySelector<HTMLInputElement>('[aria-label="Find threads"]')!).caretColor };
  });
  expect((await read()).slot).toBe("var(--accent-1)");
  const initial = await read();
  expect(initial.caret).toBe(initial.ink);
  await rows.nth(1).hover();
  const moved = await read();
  expect(moved.slot).toBe("var(--accent-2)");
  expect(moved.background).not.toBe(initial.background);
  await rows.nth(1).hover();
  expect((await read()).slot).toBe(moved.slot);
  await search.press("ArrowDown");
  expect((await read()).slot).toBe("var(--accent-3)");
  await search.fill("does not exist");
  await expect(rows).toHaveCount(0);
  await search.fill("");
  await expect(rows).toHaveCount(2);
  expect((await read()).slot).toBe("var(--accent-3)");
  for (const scheme of ["mono", "catppuccin", "rose-pine"]) {
    for (const theme of ["light", "dark"]) {
      await page.evaluate(({ scheme, theme }) => {
        localStorage.setItem("dorothy-ann-color-scheme", scheme);
        localStorage.setItem("dorothy-ann-theme", theme);
        window.dispatchEvent(new Event("dorothy-ann-preference-change"));
      }, { scheme, theme });
      const contrast = await page.locator('li[class*="threadSelected"]').evaluate((element) => {
        const styles = getComputedStyle(element);
        const channels = (value: string) => {
          const scale = value.startsWith("color(srgb") ? 1 : 255;
          return value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => channel / scale).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        };
        const luminance = (value: string) => {
          const [red, green, blue] = channels(value);
          return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
        };
        const ink = luminance(getComputedStyle(document.documentElement).color);
        const fill = luminance(styles.backgroundColor);
        return { ratio: (Math.max(ink, fill) + 0.05) / (Math.min(ink, fill) + 0.05), ink: getComputedStyle(document.documentElement).color, background: styles.backgroundColor };
      });
      expect(contrast.ratio, `${scheme}/${theme} ${contrast.ink} on ${contrast.background} selected row ink contrast`).toBeGreaterThanOrEqual(4.5);
    }
  }
  if (test.info().project.name === "chromium") {
    await page.emulateMedia({ forcedColors: "active" });
    const outline = await page.locator('li[class*="threadSelected"]').evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).toBe("solid");
    await page.emulateMedia({ forcedColors: "none" });
  }
});
