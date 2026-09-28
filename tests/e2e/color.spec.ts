import { expect, test } from "@playwright/test";

test("legacy accent stays inert; native caret cycles and scroll focus uses the random shared accent", async ({ page }) => {
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
      expect(colors.caret).not.toBe("");
      const focusAccent = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--focus-accent)";
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      expect(colors.border).toBe(focusAccent);
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
  expect(await scroller.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
  expect(await indicator.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  const focusOutline = await indicator.evaluate((element) => getComputedStyle(element).outlineColor);
  expect(focusOutline).toBe(await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--scroll-focus-color)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }));
  await indicator.focus();
  expect(await indicator.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  expect(await scroller.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
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
  expect(await scroller.evaluate((element) => getComputedStyle(element).outlineColor)).toBe(focusOutline);
  expect(await input.evaluate((element) => getComputedStyle(element).animationDuration)).toBe("32s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await input.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
});

test("one random accent colors global selection and focus controls per screen", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("dorothy-ann-color-scheme", "catppuccin");
    Math.random = () => location.search.includes("second") ? 0.99 : location.pathname === "/threads" ? 0.5 : 0;
  });
  await page.goto("/new?first");
  const prompt = page.getByLabel("Search query");
  await expect(prompt).toBeFocused();
  const first = await prompt.locator("xpath=..").evaluate((element) => getComputedStyle(element).borderTopColor);
  const selection = () => page.evaluate(() => {
    const probe = document.createElement("span");
    probe.textContent = "selection color probe";
    document.body.append(probe);
    const color = getComputedStyle(probe, "::selection").backgroundColor;
    probe.remove();
    return color;
  });
  expect(await selection()).toBe(first);
  await prompt.fill("same screen retains its color");
  expect(await prompt.locator("xpath=..").evaluate((element) => getComputedStyle(element).borderTopColor)).toBe(first);
  await page.keyboard.press("Alt+S");
  const fuzzySearch = page.getByLabel("Find threads");
  await expect(fuzzySearch).toBeVisible();
  await fuzzySearch.focus();
  const screenFocus = await fuzzySearch.evaluate((element) => getComputedStyle(element).borderTopColor);
  expect(screenFocus).not.toBe(first);
  expect(await selection()).toBe(screenFocus);
  const fuzzyListboxFocus = await page.evaluate(() => {
    const listbox = document.createElement("div");
    listbox.className = "ui-fuzzy-listbox";
    listbox.tabIndex = 0;
    document.body.append(listbox);
    listbox.focus();
    return getComputedStyle(listbox).outlineColor;
  });
  expect(fuzzyListboxFocus).toBe(screenFocus);
  await page.goto("/new?second");
  const nextLoad = await page.getByLabel("Search query").locator("xpath=..").evaluate((element) => getComputedStyle(element).borderTopColor);
  expect(nextLoad).not.toBe(first);
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

test("a mounted surface keeps its hue across temporary overflow changes", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    localStorage.setItem("dorothy-ann-color-scheme", "catppuccin");
  });
  await page.goto("/new");
  await page.evaluate(() => {
    const first = document.createElement("div");
    first.className = "app-scroll-surface";
    first.style.cssText = "height:70px;overflow:auto;width:180px";
    first.textContent = "overflow ".repeat(100);
    document.body.append(first);
  });
  const surfaces = page.locator(".app-scroll-surface");
  const indicators = page.getByRole("scrollbar", { name: "Page scroll position" });
  await expect(indicators).toHaveCount(1);
  const originalSlot = await surfaces.first().evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"));
  await surfaces.first().evaluate((element) => { element.style.height = "100000px"; window.dispatchEvent(new Event("resize")); });
  await expect(indicators).toHaveCount(0);
  await page.evaluate(() => {
    const second = document.createElement("div");
    second.className = "app-scroll-surface";
    second.style.cssText = "height:70px;overflow:auto;width:180px";
    second.textContent = "overflow ".repeat(100);
    document.body.append(second);
  });
  await expect(indicators).toHaveCount(1);
  expect(await surfaces.nth(1).evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"))).not.toBe(originalSlot);
  await surfaces.first().evaluate((element) => { element.style.height = "70px"; window.dispatchEvent(new Event("resize")); });
  await expect(indicators).toHaveCount(2);
  expect(await surfaces.first().evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"))).toBe(originalSlot);
});

test("dormant reservations do not duplicate simultaneous visible scroll hues", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    localStorage.setItem("dorothy-ann-color-scheme", "catppuccin");
  });
  await page.goto("/new");
  await page.evaluate(() => {
    for (let index = 0; index < 8; index++) {
      const surface = document.createElement("div");
      surface.className = "app-scroll-surface";
      surface.style.cssText = "height:70px;overflow:auto;width:180px";
      surface.textContent = "overflow ".repeat(100);
      document.body.append(surface);
    }
  });
  const surfaces = page.locator(".app-scroll-surface");
  const indicators = page.getByRole("scrollbar", { name: "Page scroll position" });
  await expect(indicators).toHaveCount(8);
  const firstSlot = await surfaces.first().evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"));
  await surfaces.evaluateAll((elements) => {
    for (const element of elements.slice(1)) (element as HTMLElement).style.height = "100000px";
    window.dispatchEvent(new Event("resize"));
  });
  await expect(indicators).toHaveCount(1);
  await page.evaluate(() => {
    const surface = document.createElement("div");
    surface.className = "app-scroll-surface";
    surface.style.cssText = "height:70px;overflow:auto;width:180px";
    surface.textContent = "overflow ".repeat(100);
    document.body.append(surface);
  });
  await expect(indicators).toHaveCount(2);
  const ninthSlot = await surfaces.last().evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"));
  expect(ninthSlot).not.toBe(firstSlot);
  expect(await surfaces.first().evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"))).toBe(firstSlot);
  // Find the dormant holder of the borrowed slot without assuming the shuffled order.
  const borrowedIndex = await surfaces.evaluateAll((elements, slot) => elements.findIndex((element, index) => index > 0 && index < 8 && (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color") === slot), ninthSlot);
  expect(borrowedIndex).toBeGreaterThan(0);
  await surfaces.nth(borrowedIndex).evaluate((element) => { (element as HTMLElement).style.height = "70px"; window.dispatchEvent(new Event("resize")); });
  await expect(indicators).toHaveCount(3);
  expect(await surfaces.nth(borrowedIndex).evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"))).toBe(ninthSlot);
  expect(await surfaces.last().evaluate((element) => (element as HTMLElement).style.getPropertyValue("--scroll-thumb-color"))).toBe(ninthSlot);
});

test("scroll focus uses the random accent while user turns use the image hue", async ({ page }) => {
  await page.goto("/new");
  await page.getByLabel("Search query").fill("color fixture topic");
  await page.getByLabel("Search query").press("Enter");
  await expect(page).toHaveURL(/\/threads\/(?!new$)[^/?]+$/);
  const scroller = page.locator(".app-route-scroll");
  await scroller.evaluate((element) => element.insertAdjacentHTML("beforeend", "<p>Long content</p>".repeat(100)));
  const indicator = page.getByRole("scrollbar", { name: "Route content scroll position" });
  await expect(indicator).toBeVisible();
  await scroller.focus();
  await expect(indicator).toHaveClass(/surface-focused/);
  for (const scheme of ["mono", "catppuccin", "rose-pine"]) {
    for (const theme of ["light", "dark", "auto"]) {
      await page.emulateMedia({ colorScheme: theme === "auto" ? "dark" : "light" });
      await page.evaluate(({ scheme, theme }) => {
        localStorage.setItem("dorothy-ann-color-scheme", scheme);
        localStorage.setItem("dorothy-ann-theme", theme);
        window.dispatchEvent(new Event("dorothy-ann-preference-change"));
      }, { scheme, theme });
      const colors = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.cssText = "color:var(--scroll-focus-color);background:var(--command-accent-5)";
        document.body.append(probe);
        const indicator = document.querySelector<HTMLElement>(".app-scroll-indicator[aria-label='Route content scroll position']")!;
        const turn = document.querySelector<HTMLElement>("blockquote[class*='userTurn']")!;
        const result = { focus: getComputedStyle(indicator).outlineColor, expected: getComputedStyle(probe).color,
          image: getComputedStyle(probe).backgroundColor, turn: getComputedStyle(turn).borderLeftColor,
          offset: getComputedStyle(indicator).outlineOffset, paper: getComputedStyle(document.documentElement).backgroundColor };
        probe.remove();
        const luminance = (value: string) => {
          const scale = value.startsWith("color(srgb") ? 1 : 255;
          const [r, g, b] = value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => channel / scale).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
        };
        const first = luminance(result.focus), second = luminance(result.paper);
        return { ...result, ratio: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05) };
      });
      expect(colors.focus).toBe(colors.expected);
      expect(colors.turn).toBe(colors.image);
      expect(colors.offset).toBe("0px");
      expect(colors.ratio, `${scheme}/${theme} scroll-focus contrast`).toBeGreaterThanOrEqual(3);
    }
  }
  await indicator.evaluate((element) => element.remove());
  await scroller.evaluate((element) => element.classList.remove("has-custom-scroll-indicator"));
  await scroller.focus();
  const fallback = await scroller.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--scroll-focus-color)";
    document.body.append(probe);
    const value = { outline: getComputedStyle(element).outlineColor, expected: getComputedStyle(probe).color };
    probe.remove();
    return value;
  });
  expect(fallback.outline).toBe(fallback.expected);
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
  expect(initial.caret).not.toBe("");
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
        const foreground = getComputedStyle(element.querySelector("button")!).color;
        const previewNode = element.querySelector("small");
        const preview = previewNode ? getComputedStyle(previewNode).color : foreground;
        const ratio = (foregroundColor: string, backgroundColor: string) => {
          const text = luminance(foregroundColor), fill = luminance(backgroundColor);
          return (Math.max(text, fill) + 0.05) / (Math.min(text, fill) + 0.05);
        };
        const slots = Array.from({ length: 8 }, (_, index) => {
          const probe = document.createElement("span");
          probe.style.cssText = `color:var(--thread-foreground-${index + 1}, var(--command-foreground-1));background:var(--accent-${index + 1})`;
          document.body.append(probe);
          const value = ratio(getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor);
          probe.remove();
          return value;
        });
        return { ratio: ratio(foreground, styles.backgroundColor), foreground, preview, background: styles.backgroundColor, slots };
      });
      expect(contrast.preview).toBe(contrast.foreground);
      expect(contrast.ratio, `${scheme}/${theme} ${contrast.foreground} on ${contrast.background} selected row contrast`).toBeGreaterThanOrEqual(4.5);
      for (const [index, value] of contrast.slots.entries()) expect(value, `${scheme}/${theme} slot ${index + 1} foreground contrast`).toBeGreaterThanOrEqual(4.5);
    }
  }
  const activeButton = page.locator('li[class*="threadSelected"] button').first();
  await activeButton.focus();
  await expect(activeButton).toBeFocused();
  expect(await activeButton.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  if (test.info().project.name === "chromium") {
    await page.emulateMedia({ forcedColors: "active" });
    const outline = await page.locator('li[class*="threadSelected"]').evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).toBe("solid");
    await page.emulateMedia({ forcedColors: "none" });
  }
});
