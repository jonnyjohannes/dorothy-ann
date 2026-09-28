import { expect, test } from "@playwright/test";

const sans = "Helvetica Neue, Helvetica, Arial, sans-serif";
const mono = "Source Code Pro, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const normalized = (family: string) => family.replaceAll('"', "").replaceAll("'", "");

for (const theme of ["light", "dark"] as const) {
  test(`bundled code face stays separate from ${theme} prose and prompt`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("dorothy-ann-theme", value), theme);
    await page.goto("/new");
    await expect(page.getByRole("heading", { name: "/new" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      loadedWeights: [...document.fonts].filter((face) => face.family === "Source Code Pro" && face.status === "loaded").map((face) => face.weight).sort(),
    }))).toEqual({ theme, loadedWeights: ["400", "500", "700"] });
    const fonts = await page.evaluate(() => {
      const family = (selector: string) => getComputedStyle(document.querySelector(selector)!).fontFamily;
      return {
        prose: family(":root"), prompt: family("input[aria-label='Search query']"),
        title: family("h1 code"), command: family("[aria-label='Commands'] code"),
        shortcut: family("[aria-label='Commands'] p span code"), signature: family("header button"), tagline: family("header button span:last-child"),
      };
    });
    expect(normalized(fonts.prose)).toBe(sans);
    expect(normalized(fonts.prompt)).toBe(sans);
    for (const family of [fonts.title, fonts.command, fonts.shortcut, fonts.signature, fonts.tagline]) expect(normalized(family)).toBe(mono);
  });
}

test("a failed web font falls back without changing the Helvetica UI stack or focus", async ({ page }) => {
  let blockedFonts = 0;
  await page.route(/source-code-pro-latin-.*\.woff2/, (route) => { blockedFonts++; return route.abort(); });
  await page.goto("/new");
  await expect(page.getByRole("heading", { name: "/new" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({
    code: getComputedStyle(document.querySelector("[aria-label='Commands'] code")!).fontFamily,
    prompt: getComputedStyle(document.querySelector("input[aria-label='Search query']")!).fontFamily,
    fallbackRendered: (() => {
      const context = document.createElement("canvas").getContext("2d")!;
      context.font = '16px "Source Code Pro", ui-monospace, monospace';
      const failedWidth = context.measureText("identifier_name = 12345").width;
      context.font = "16px ui-monospace, monospace";
      return Math.abs(failedWidth - context.measureText("identifier_name = 12345").width) < 0.01;
    })(),
  }));
  expect(blockedFonts).toBeGreaterThan(0);
  expect(fonts.fallbackRendered).toBe(true);
  expect(normalized(fonts.code)).toBe(mono);
  expect(normalized(fonts.prompt)).toBe(sans);
  const prompt = page.getByLabel("Search query");
  await prompt.focus();
  await expect(prompt).toBeFocused();
  await prompt.fill("fallback remains editable");
  await expect(prompt).toHaveValue("fallback remains editable");
});

test("Markdown prose, emphasis, table and long inline/fenced code retain fonts and local horizontal scrolling", async ({ page }) => {
  await page.goto("/new");
  const route = page.getByRole("region", { name: "Home content" });
  await route.evaluate((node) => {
    const article = document.createElement("article");
    article.className = "ui-markdown";
    article.innerHTML = `<p>Long prose answer <strong class="ui-markdown__inline">emphasized label</strong> and <code class="ui-markdown__inline">identifier_name</code>.</p>
      <div class="ui-markdown__table-scroll"><table><thead><tr><th>Column one</th><th>Column two</th></tr></thead><tbody><tr>${Array.from({ length: 30 }, (_, i) => `<td>column-${i}</td>`).join("")}</tr></tbody></table></div>
      <pre><code>${"const long_identifier = 'value'; ".repeat(30)}</code></pre>`;
    node.append(article);
  });
  await page.evaluate(() => document.fonts.ready);
  const layout = await route.evaluate((node) => {
    const article = node.querySelector(".ui-markdown")!;
    const pre = article.querySelector("pre")!;
    const table = article.querySelector(".ui-markdown__table-scroll")!;
    const font = (selector: string) => getComputedStyle(article.querySelector(selector)!).fontFamily;
    return {
      prose: font("p"), emphasis: font("strong"), inline: font("p code"), fenced: font("pre code"), table: font("td"),
      routeWidth: node.clientWidth, routeScrollWidth: node.scrollWidth,
      preWidth: pre.clientWidth, preScrollWidth: pre.scrollWidth,
      tableWidth: table.clientWidth, tableScrollWidth: table.scrollWidth,
    };
  });
  for (const family of [layout.prose, layout.emphasis, layout.table]) expect(normalized(family)).toBe(sans);
  for (const family of [layout.inline, layout.fenced]) expect(normalized(family)).toBe(mono);
  expect(layout.routeScrollWidth).toBeLessThanOrEqual(layout.routeWidth + 1);
  expect(layout.preScrollWidth).toBeGreaterThan(layout.preWidth);
  expect(layout.tableScrollWidth).toBeGreaterThan(layout.tableWidth);
  const code = route.locator("pre");
  await expect(code).toHaveAttribute("tabindex", "0");
  await code.focus();
  await expect(code).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => code.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
});
