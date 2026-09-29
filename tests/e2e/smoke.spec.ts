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

test("thread transcript scrolls with arrow and page keys without stealing prompt focus", async ({ page }) => {
  await page.goto("/new");
  const prompt = page.getByLabel("Search query");
  await prompt.fill("keyboard transcript scrolling");
  await prompt.press("Enter");
  await expect(page).toHaveURL(/\/threads\/(?!new$)[^/]+$/);
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(prompt).toBeEnabled();
  const transcript = page.getByRole("region", { name: "Thread content" });
  await expect(page.locator(".app-route-scroll")).toHaveCount(1);
  await transcript.evaluate((element) => {
    element.insertAdjacentHTML("beforeend", Array.from({ length: 60 }, (_, index) => `<p>Long transcript paragraph ${index}</p>`).join(""));
  });
  await expect.poll(() => transcript.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await transcript.locator("blockquote").first().click();
  await expect(transcript).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => transcript.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const afterArrow = await transcript.evaluate((element) => element.scrollTop);
  await page.keyboard.press("PageDown");
  await expect.poll(() => transcript.evaluate((element) => element.scrollTop)).toBeGreaterThan(afterArrow);
  const afterPage = await transcript.evaluate((element) => element.scrollTop);
  await page.keyboard.press("PageUp");
  await expect.poll(() => transcript.evaluate((element) => element.scrollTop)).toBeLessThan(afterPage);
  const afterPageUp = await transcript.evaluate((element) => element.scrollTop);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => transcript.evaluate((element) => element.scrollTop)).toBeLessThan(afterPageUp);
  await prompt.focus();
  await expect(prompt).toBeFocused();
  const beforePromptKey = await transcript.evaluate((element) => element.scrollTop);
  await page.keyboard.press("ArrowDown");
  await expect(prompt).toBeFocused();
  expect(await transcript.evaluate((element) => element.scrollTop)).toBe(beforePromptKey);
  await prompt.press("Escape");
  await expect(transcript).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect.poll(() => transcript.evaluate((element) => element.scrollTop)).toBeGreaterThan(beforePromptKey);
  await page.waitForTimeout(550);
  await prompt.focus();
  await prompt.press("Escape");
  await expect(transcript).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
});

test("shared keyboard scrolling works on routes, saved threads, and future layout surfaces", async ({ page }) => {
  for (const [path, label] of [["/new", "Home content"], ["/settings", "Settings content"]] as const) {
    await page.goto(path);
    const route = page.getByRole("region", { name: label });
    await route.evaluate((element) => element.insertAdjacentHTML("beforeend", Array.from({ length: 60 }, (_, index) => `<p>Extra content ${index}</p>`).join("")));
    await expect(route).toHaveAttribute("tabindex", "0");
    await route.locator("p").last().click();
    await expect(route).toBeFocused();
    await page.keyboard.press("Home");
    await page.keyboard.press("PageDown");
    await expect.poll(() => route.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const afterPage = await route.evaluate((element) => element.scrollTop);
    await page.keyboard.press("PageUp");
    await expect.poll(() => route.evaluate((element) => element.scrollTop)).toBeLessThan(afterPage);
  }

  await page.goto("/threads");
  const savedThreads = page.locator(".app-thread-list-scroll");
  await savedThreads.evaluate((element) => element.insertAdjacentHTML("beforeend", Array.from({ length: 60 }, (_, index) => `<p>Saved item ${index}</p>`).join("")));
  await expect(savedThreads).toHaveAttribute("tabindex", "0");
  await savedThreads.locator("p").last().click();
  await expect(savedThreads).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => savedThreads.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("PageDown");
  const afterPage = await savedThreads.evaluate((element) => element.scrollTop);
  await page.keyboard.press("PageUp");
  await expect.poll(() => savedThreads.evaluate((element) => element.scrollTop)).toBeLessThan(afterPage);
  const find = page.getByLabel("Find threads");
  await find.focus();
  await page.keyboard.press("ArrowDown");
  await expect(find).toBeFocused();

  await page.goto("/new");
  const route = page.getByRole("region", { name: "Home content" });
  await route.evaluate((element) => {
    const nested = document.createElement("div");
    nested.className = "app-scroll-surface";
    nested.setAttribute("role", "region");
    nested.setAttribute("aria-label", "Additional layout content");
    nested.style.cssText = "height: 80px; overflow: auto";
    nested.innerHTML = Array.from({ length: 50 }, (_, index) => `<p>Nested content ${index}</p>`).join("");
    element.append(nested);
  });
  const nested = page.getByRole("region", { name: "Additional layout content" });
  await expect(nested).toHaveAttribute("tabindex", "0");
  await nested.locator("p").first().click();
  await expect(nested).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect.poll(() => nested.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await route.evaluate((element) => element.scrollTop)).toBe(0);
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
  expect(trackBounds!.x + trackBounds!.width).toBeCloseTo(await page.evaluate(() => window.innerWidth), 0);
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
  const activeAccent = await page.evaluate(() => { const probe = document.createElement("div"); probe.style.color = "var(--focus-accent)"; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; });
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
  await expect(code).toHaveAttribute("tabindex", "0");
  await code.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const afterArrow = await code.evaluate((element) => element.scrollLeft);
  await page.keyboard.press("PageDown");
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(afterArrow);
  const afterPage = await code.evaluate((element) => element.scrollLeft);
  await page.keyboard.press("PageUp");
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeLessThan(afterPage);
  await page.keyboard.press("End");
  if (test.info().project.name === "chromium") {
    const endPosition = await code.evaluate((element) => element.scrollLeft);
    await code.scrollIntoViewIfNeeded();
    const thumb = scrollbar.locator("div");
    const thumbBounds = await thumb.boundingBox();
    expect(thumbBounds).not.toBeNull();
    await thumb.dragTo(thumb, { sourcePosition: { x: thumbBounds!.width / 2, y: thumbBounds!.height / 2 }, targetPosition: { x: 0, y: thumbBounds!.height / 2 } });
    await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeLessThan(endPosition);
  }
});

test("command swatch text keeps WCAG AA contrast across theme and color-scheme variants", async ({ page }) => {
  await page.goto("/new");
  const buttons = page.locator('[aria-label="Commands"] a, [aria-label="Commands"] button');
  const commandColors: Record<string, Record<string, { backgrounds: string[]; foregrounds: string[] }>> = {
    mono: Object.fromEntries(["light", "dark", "auto"].map((theme) => [theme, { backgrounds: Array(7).fill("rgb(246, 201, 69)"), foregrounds: Array(7).fill("rgb(108, 82, 5)") }])),
    catppuccin: {
      light: { backgrounds: ["rgb(136, 57, 239)", "rgb(30, 102, 245)", "rgb(23, 146, 153)", "rgb(64, 160, 43)", "rgb(223, 142, 29)", "rgb(254, 100, 11)", "rgb(210, 15, 57)"], foregrounds: ["rgb(243, 236, 253)", "rgb(248, 250, 255)", "rgb(4, 28, 30)", "rgb(16, 40, 11)", "rgb(74, 47, 10)", "rgb(78, 29, 0)", "rgb(253, 234, 238)"] },
      dark: { backgrounds: ["rgb(203, 166, 247)", "rgb(137, 180, 250)", "rgb(148, 226, 213)", "rgb(166, 227, 161)", "rgb(249, 226, 175)", "rgb(250, 179, 135)", "rgb(243, 139, 168)"], foregrounds: ["rgb(92, 16, 181)", "rgb(6, 61, 150)", "rgb(27, 100, 88)", "rgb(36, 102, 30)", "rgb(130, 93, 10)", "rgb(133, 54, 6)", "rgb(123, 13, 43)"] },
      auto: { backgrounds: ["rgb(203, 166, 247)", "rgb(137, 180, 250)", "rgb(148, 226, 213)", "rgb(166, 227, 161)", "rgb(249, 226, 175)", "rgb(250, 179, 135)", "rgb(243, 139, 168)"], foregrounds: ["rgb(92, 16, 181)", "rgb(6, 61, 150)", "rgb(27, 100, 88)", "rgb(36, 102, 30)", "rgb(130, 93, 10)", "rgb(133, 54, 6)", "rgb(123, 13, 43)"] },
    },
    "rose-pine": {
      light: { backgrounds: ["rgb(87, 82, 121)", "rgb(144, 122, 169)", "rgb(40, 105, 131)", "rgb(86, 148, 159)", "rgb(180, 99, 122)", "rgb(215, 130, 126)", "rgb(234, 157, 52)"], foregrounds: ["rgb(208, 206, 222)", "rgb(27, 21, 33)", "rgb(205, 230, 240)", "rgb(21, 35, 38)", "rgb(17, 8, 11)", "rgb(85, 29, 26)", "rgb(90, 56, 9)"] },
      dark: { backgrounds: ["rgb(196, 167, 231)", "rgb(224, 222, 244)", "rgb(156, 207, 216)", "rgb(49, 116, 143)", "rgb(235, 111, 146)", "rgb(235, 188, 186)", "rgb(246, 193, 119)"], foregrounds: ["rgb(92, 41, 152)", "rgb(91, 80, 197)", "rgb(38, 87, 96)", "rgb(235, 245, 248)", "rgb(92, 13, 35)", "rgb(146, 46, 42)", "rgb(119, 73, 8)"] },
      auto: { backgrounds: ["rgb(196, 167, 231)", "rgb(224, 222, 244)", "rgb(156, 207, 216)", "rgb(49, 116, 143)", "rgb(235, 111, 146)", "rgb(235, 188, 186)", "rgb(246, 193, 119)"], foregrounds: ["rgb(92, 41, 152)", "rgb(91, 80, 197)", "rgb(38, 87, 96)", "rgb(235, 245, 248)", "rgb(92, 13, 35)", "rgb(146, 46, 42)", "rgb(119, 73, 8)"] },
    },
  };
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
      expect(defaultRatios.map(({ background }) => background)).toEqual(commandColors[scheme]![theme]!.backgrounds);
      expect(defaultRatios.map(({ color }) => color)).toEqual(commandColors[scheme]![theme]!.foregrounds);
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

test("Alt shortcuts navigate to new, threads, and settings from focused text input", async ({ page }) => {
  await page.goto("/new");
  await page.getByLabel("Search query").focus();
  await page.keyboard.press("Alt+Comma");
  await expect(page).toHaveURL(/\/settings$/u);
  await page.keyboard.press("Alt+a");
  await expect(page).toHaveURL(/\/new$/u);
  await page.getByLabel("Search query").focus();
  await page.keyboard.press("Alt+s");
  await expect(page).toHaveURL(/\/threads$/u);
  await page.getByLabel("Find threads").focus();
  await page.keyboard.press("Alt+c");
  await expect(page).toHaveURL(/\/threads$/u);
});

test("route shells keep document fixed and unlock uses the shared passphrase layout", async ({ page }) => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 768, height: 900 }, { width: 1440, height: 900 }, { width: 2000, height: 1300 }, { width: 2000, height: 837 }, { width: 2000, height: 382 }, { width: 924, height: 922 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["/new", "/threads", "/settings", "thread", "/unlock"]) {
    if (path === "thread") {
      await page.goto("/new");
      await page.getByLabel("Search query").fill("thread width check");
      await page.getByLabel("Search query").press("Enter");
      await expect(page).toHaveURL(/\/threads\/(?!new$)[^/?]+$/);
    } else await page.goto(path);
    const shell = page.locator("main").first();
    await expect(shell).toBeVisible();
    const isThreadsPage = path === "/threads";
    const routeScroll = page.locator(".app-route-scroll");
    await expect(routeScroll).toHaveCount(isThreadsPage ? 0 : 1);
    if (isThreadsPage) {
      await expect(page.getByRole("heading", { name: "/threads" })).toBeVisible();
      await expect(page.getByLabel("Find threads")).toBeVisible();
      const threadList = page.locator(".app-thread-list-scroll");
      await expect(threadList).toHaveCount(1);
      await expect(page.getByText("Loading threads…")).toHaveCount(0);
      const listOverflows = await threadList.evaluate((element) => element.scrollHeight > element.clientHeight);
      await expect(page.getByRole("scrollbar", { name: "Saved threads scroll position" })).toHaveCount(listOverflows ? 1 : 0);
      await expect.poll(() => page.locator(".app-threads-layout").evaluate((element) => element.getBoundingClientRect().width / window.innerWidth)).toBeGreaterThan(0.88);
    } else {
      await expect(routeScroll).toBeVisible();
      await expect.poll(() => routeScroll.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(0);
      await expect.poll(() => routeScroll.evaluate((element) => element.getBoundingClientRect().width / window.innerWidth)).toBeGreaterThan(0.88);
    }
    const expectedPromptFooter = path === "/new" || path === "thread";
    const promptFooter = page.locator(".app-prompt-footer");
    await expect(promptFooter).toHaveCount(expectedPromptFooter ? 1 : 0);
    if (expectedPromptFooter) {
      const promptBox = promptFooter.locator("form");
      const promptInput = promptFooter.getByLabel("Search query");
      const [routeBounds, footerBounds, shellBounds, promptBoxBounds, inputPadding] = await Promise.all([
        routeScroll.boundingBox(),
        promptFooter.boundingBox(),
        page.locator("main").first().boundingBox(),
        promptBox.boundingBox(),
        promptInput.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop) + Number.parseFloat(getComputedStyle(element).paddingBottom)),
      ]);
      expect(routeBounds, `${path} route bounds at ${viewport.width}x${viewport.height}`).not.toBeNull();
      expect(footerBounds, `${path} footer bounds`).not.toBeNull();
      expect(shellBounds, `${path} shell bounds`).not.toBeNull();
      expect(footerBounds!.x).toBeCloseTo(routeBounds!.x, 0);
      expect(footerBounds!.width).toBeCloseTo(routeBounds!.width, 0);
      expect(footerBounds!.y).toBeGreaterThan(routeBounds!.y);
      expect(footerBounds!.y + footerBounds!.height).toBeCloseTo(shellBounds!.y + shellBounds!.height, 0);
      expect(shellBounds!.y + shellBounds!.height - promptBoxBounds!.y - promptBoxBounds!.height).toBeGreaterThanOrEqual(16);
      expect(inputPadding).toBeLessThanOrEqual(15);
    }
    if (path === "/settings" && viewport.width >= 2000) {
      const [settingsBounds, routeBounds, controlBounds] = await Promise.all([
        page.locator('[aria-label="Settings"]').boundingBox(),
        routeScroll.boundingBox(),
        page.getByRole("button", { name: "Appearance" }).boundingBox(),
      ]);
      expect(settingsBounds).not.toBeNull();
      expect(routeBounds).not.toBeNull();
      expect(controlBounds).not.toBeNull();
      expect(settingsBounds!.width / routeBounds!.width).toBeLessThan(0.5);
      expect(controlBounds!.x + controlBounds!.width).toBeLessThanOrEqual(settingsBounds!.x + settingsBounds!.width + 1);
    }
    if (isThreadsPage) {
      const [headingBefore, searchBefore] = await Promise.all([
        page.getByRole("heading", { name: "/threads" }).boundingBox(),
        page.getByLabel("Find threads").boundingBox(),
      ]);
      await page.locator(".app-thread-list-scroll").evaluate((element) => {
        const list = document.createElement("ul");
        list.innerHTML = Array.from({ length: 36 }, (_, index) => `<li style="height:4rem;margin-block:1rem">Saved thread ${index}</li>`).join("");
        element.append(list);
      });
      const threadsScrollbar = page.getByRole("scrollbar", { name: "Saved threads scroll position" });
      await expect(threadsScrollbar).toBeVisible();
      await page.locator(".app-thread-list-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect.poll(() => page.locator(".app-thread-list-scroll").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      const [headingAfter, searchAfter] = await Promise.all([
        page.getByRole("heading", { name: "/threads" }).boundingBox(),
        page.getByLabel("Find threads").boundingBox(),
      ]);
      expect(headingAfter!.y).toBeCloseTo(headingBefore!.y, 0);
      expect(searchAfter!.y).toBeCloseTo(searchBefore!.y, 0);
      await expect(page.getByRole("scrollbar", { name: "Route content scroll position" })).toHaveCount(0);
    }
    if (path === "thread") {
      await routeScroll.evaluate((element) => element.insertAdjacentHTML("beforeend", Array.from({ length: 36 }, (_, index) => `<p>Wide thread content ${index}</p>`).join("")));
      await expect(page.getByRole("scrollbar", { name: "Route content scroll position" })).toBeVisible();
      const documentScroll = await page.evaluate(() => {
        const sentinel = document.createElement("div");
        sentinel.style.height = "300vh";
        sentinel.setAttribute("aria-hidden", "true");
        document.body.append(sentinel);
        window.scrollTo(0, document.documentElement.scrollHeight);
        const result = { windowY: window.scrollY, documentY: document.scrollingElement?.scrollTop ?? -1, viewportHeight: window.innerHeight };
        sentinel.remove();
        return result;
      });
      expect(documentScroll.windowY).toBe(0);
      expect(documentScroll.documentY).toBe(0);
      const footerAfterAttempt = await promptFooter.boundingBox();
      expect(footerAfterAttempt).not.toBeNull();
      expect(footerAfterAttempt!.y + footerAfterAttempt!.height).toBeCloseTo(documentScroll.viewportHeight, 0);
      if (test.info().project.name === "chromium") {
        await routeScroll.evaluate((element) => { element.scrollTop = 0; });
        const routeBounds = await routeScroll.boundingBox();
        expect(routeBounds).not.toBeNull();
        await page.mouse.move(routeBounds!.x + routeBounds!.width / 2, routeBounds!.y + routeBounds!.height / 2);
        await page.mouse.wheel(0, 500);
        await expect.poll(() => routeScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      }
    }
    const verticalOwners = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter((element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1)
      .map((element) => element.className));
    if (isThreadsPage || path === "thread") {
      expect(verticalOwners).toHaveLength(1);
      await expect(page.getByRole("scrollbar")).toHaveCount(1);
    }
    const documentOverflow = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight || document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(documentOverflow, `${path} document overflow`).toBe(false);
    if ((path === "/new" || path === "/unlock") && viewport.height >= 640) {
      const routeOverflows = await page.locator(".app-route-scroll").evaluate((element) => element.scrollHeight > element.clientHeight);
      expect(routeOverflows, `${path} short route overflow at ${viewport.width}x${viewport.height}`).toBe(false);
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
