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

test("native scroll surfaces gain accessible square accent indicators on desktop and mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search query").fill("scroll indicator route");
  await page.getByLabel("Search query").press("Enter");
  await expect(page).toHaveURL(/\/threads\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(page.locator(".app-route-scroll")).toHaveCount(1);
  await page.evaluate(() => {
    const routeContent = document.querySelector<HTMLElement>(".app-route-scroll")!;
    routeContent.id = "scroll-test-route";
    routeContent.insertAdjacentHTML("beforeend", Array.from({ length: 30 }, (_, index) => `<p>Route content ${index}</p>`).join(""));
  });
  const routeScrollbar = page.getByRole("scrollbar", { name: "Route content scroll position" });
  await expect(routeScrollbar).toBeVisible();
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByLabel("Search query")).toBeVisible();
  const trackBounds = await routeScrollbar.boundingBox();
  const [contentBounds, headerBounds, promptBounds] = await Promise.all([
    page.locator(".app-route-scroll").boundingBox(),
    page.getByRole("banner").boundingBox(),
    page.getByLabel("Search query").boundingBox(),
  ]);
  expect(trackBounds && contentBounds && headerBounds && promptBounds).toBeTruthy();
  expect(trackBounds!.y).toBeGreaterThanOrEqual(headerBounds!.y + headerBounds!.height);
  expect(trackBounds!.y + trackBounds!.height).toBeLessThanOrEqual(promptBounds!.y);
  await routeScrollbar.focus();
  await page.keyboard.press("End");
  await expect(routeScrollbar).toHaveAttribute("aria-valuenow", /[1-9]/);
  const routeContent = page.locator("#scroll-test-route");
  const previousRouteScroll = await routeContent.evaluate((element) => element.scrollTop);
  await page.evaluate(() => {
    const menu = document.createElement("div");
    menu.className = "ui-listbox-menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Test choices");
    menu.style.cssText = "height: 100px; overflow: auto";
    menu.innerHTML = Array.from({ length: 30 }, (_, index) => `<div>Choice ${index}</div>`).join("");
    document.body.append(menu);
    const markdown = document.createElement("div");
    markdown.className = "ui-markdown";
    const code = document.createElement("pre");
    code.style.cssText = "width: 240px; height: 5rem";
    code.textContent = "x".repeat(2000);
    markdown.append(code);
    document.body.append(markdown);
  });
  const scrollbar = page.getByRole("scrollbar", { name: "Code horizontal scroll position" });
  await expect(scrollbar).toBeVisible();
  await expect(routeScrollbar).toHaveCount(0);
  await expect(routeContent).toHaveClass(/route-scroll-locked/);
  await expect(page.getByRole("scrollbar", { name: "Test choices scroll position" })).toBeVisible();
  await expect(page.getByRole("scrollbar", { name: "Page scroll position" })).toHaveCount(0);
  await expect(scrollbar).toHaveAttribute("aria-controls");
  await expect(scrollbar).toHaveAttribute("aria-valuemax", /[1-9]/);
  const geometry = await scrollbar.evaluate((element) => ({
    radius: getComputedStyle(element.firstElementChild!).borderRadius,
    accent: getComputedStyle(element.firstElementChild!).backgroundColor,
    nativeHidden: getComputedStyle(document.querySelector("pre")!).scrollbarWidth,
  }));
  expect(geometry.radius).toBe("0px");
  const activeAccent = await page.evaluate(() => { const probe = document.createElement("div"); probe.style.color = "var(--accent)"; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; });
  expect(geometry.accent).toBe(activeAccent);
  expect(geometry.nativeHidden).toBe("none");
  await scrollbar.focus();
  await page.keyboard.press("End");
  const code = page.locator("pre");
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.locator(".ui-listbox-menu").evaluate((element) => element.remove());
  await expect(routeScrollbar).toBeVisible();
  await expect(routeContent).not.toHaveClass(/route-scroll-locked/);
  await expect.poll(() => routeContent.evaluate((element) => element.scrollTop)).toBe(previousRouteScroll);
  if (test.info().project.name === "chromium") {
    const endPosition = await code.evaluate((element) => element.scrollLeft);
    await code.scrollIntoViewIfNeeded();
    const thumb = scrollbar.locator("div");
    const thumbBounds = await thumb.boundingBox();
    expect(thumbBounds).not.toBeNull();
    await thumb.dragTo(thumb, { sourcePosition: { x: Math.max(1, thumbBounds!.width - 2), y: thumbBounds!.height / 2 }, targetPosition: { x: Math.max(1, thumbBounds!.width - 37), y: thumbBounds!.height / 2 } });
    await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeLessThan(endPosition);
  }
});

test("command swatch text keeps WCAG AA contrast across theme and color-scheme variants", async ({ page }) => {
  await page.goto("/new");
  const buttons = page.locator('[aria-label="Commands"] a, [aria-label="Commands"] button');
  const contrastRatios = async () => buttons.evaluateAll((elements) => elements.map((element) => {
    const parse = (color: string) => { const scale = color.startsWith("color(srgb") ? 1 : 255; return color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => channel / scale).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4); };
    const luminance = (color: string) => { const [r, g, b] = parse(color); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
    const style = getComputedStyle(element);
    const first = luminance(style.color);
    const second = luminance(style.backgroundColor);
    return { ratio: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05), color: style.color, background: style.backgroundColor };
  }));
  for (const scheme of ["mono", "catppuccin", "rose-pine"]) {
    for (const theme of ["light", "dark", "auto"]) {
      await page.emulateMedia({ colorScheme: theme === "light" ? "light" : "dark" });
      await page.evaluate(({ scheme, theme }) => { document.documentElement.dataset.colorScheme = scheme; document.documentElement.dataset.theme = theme; }, { scheme, theme });
      const defaultRatios = await contrastRatios();
      expect(defaultRatios.every(({ ratio }) => ratio >= 4.5), `${scheme}/${theme} default contrast: ${JSON.stringify(defaultRatios)}`).toBe(true);
      for (const button of await buttons.all()) {
      await button.hover();
      const hoveredOutline = await button.evaluate((element) => getComputedStyle(element).outlineStyle);
      expect(hoveredOutline).toBe("none");
      const hoveredRatio = await button.evaluate((element) => { const style = getComputedStyle(element); const parse = (value: string) => { const scale = value.startsWith("color(srgb") ? 1 : 255; return value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => channel / scale).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4); }; const lum = (value: string) => { const [r, g, b] = parse(value); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; }; const a = lum(style.color); const b = lum(style.backgroundColor); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); });
      expect(hoveredRatio).toBeGreaterThanOrEqual(4.5);
      await button.focus();
      await page.mouse.down();
      const activeRatio = await button.evaluate((element) => { const style = getComputedStyle(element); const channels = (value: string) => { const scale = value.startsWith("color(srgb") ? 1 : 255; return value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => channel / scale).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4); }; const lum = (value: string) => { const [r, g, b] = channels(value); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; }; const a = lum(style.color); const b = lum(style.backgroundColor); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); });
      expect(activeRatio).toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      }
    }
  }
  if (test.info().project.name === "chromium") {
    await buttons.first().focus();
    await page.keyboard.press("Tab");
    await expect(buttons.nth(1)).toBeFocused();
    await expect.poll(() => buttons.nth(1).evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  }
});

test("route shells keep document fixed and unlock uses the shared passphrase layout", async ({ page }) => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["/new", "/threads", "/settings", "thread", "/unlock"]) {
    if (path === "thread") {
      await page.goto("/new");
      await page.getByLabel("Search query").fill("thread width check");
      await page.getByLabel("Search query").press("Enter");
      await expect(page).toHaveURL(/\/threads\/[^/]+$/);
    } else await page.goto(path);
    const shell = page.locator("main").first();
    await expect(shell).toBeVisible();
    await expect(page.locator(".app-route-scroll")).toHaveCount(1);
    await expect(page.locator(".app-route-scroll")).toBeVisible();
    await expect.poll(() => page.locator(".app-route-scroll").evaluate((element) => element.getBoundingClientRect().width / window.innerWidth)).toBeGreaterThan(0.88);
    const expectedPromptFooter = path === "/new" || path === "thread";
    const promptFooter = page.locator(".app-prompt-footer");
    await expect(promptFooter).toHaveCount(expectedPromptFooter ? 1 : 0);
    if (expectedPromptFooter) {
      const [routeBounds, footerBounds, shellBounds] = await Promise.all([
        page.locator(".app-route-scroll").boundingBox(),
        promptFooter.boundingBox(),
        page.locator("main").first().boundingBox(),
      ]);
      expect(routeBounds, `${path} route bounds`).not.toBeNull();
      expect(footerBounds, `${path} footer bounds`).not.toBeNull();
      expect(shellBounds, `${path} shell bounds`).not.toBeNull();
      expect(footerBounds!.x).toBeCloseTo(routeBounds!.x, 0);
      expect(footerBounds!.width).toBeCloseTo(routeBounds!.width, 0);
      expect(footerBounds!.y).toBeGreaterThan(routeBounds!.y);
      expect(footerBounds!.y + footerBounds!.height).toBeCloseTo(shellBounds!.y + shellBounds!.height, 0);
    }
    const documentOverflow = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight || document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(documentOverflow, `${path} document overflow`).toBe(false);
    if (path === "/new" || path === "/unlock") {
      const routeOverflows = await page.locator(".app-route-scroll").evaluate((element) => element.scrollHeight > element.clientHeight);
      expect(routeOverflows, `${path} short route overflow`).toBe(false);
      await expect(page.getByRole("scrollbar", { name: "Route content scroll position" })).toHaveCount(0);
    }
    if (path === "/unlock") {
      await expect(page.getByRole("heading", { name: "/unlock" })).toBeVisible();
      await expect(page.getByLabel("Passphrase")).toHaveAttribute("placeholder", "passphrase");
      await expect(page.getByLabel("Passphrase")).toHaveAttribute("type", "password");
      await expect(page.getByLabel("Passphrase")).toHaveAttribute("autocomplete", "current-password");
      const passphraseWidth = await page.evaluate(() => document.querySelector<HTMLInputElement>("#unlock-passphrase")!.getBoundingClientRect().width / document.querySelector<HTMLElement>(".app-route-scroll")!.getBoundingClientRect().width);
      expect(passphraseWidth).toBeGreaterThan(0.9);
    }
    }
  }
});

test("home has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});
