import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("isolated production opt-in sends only coarse Analytics pageview payloads", async ({ page }) => {
  const scriptFile = process.env.DOROTHY_E2E_ANALYTICS_SCRIPT;
  test.skip(!scriptFile || process.env.VITE_TELEMETRY_PROVIDER !== "vercel" || process.env.DOROTHY_E2E_PREVIEW !== "1", "Requires locally captured SDK script and isolated opt-in preview");
  const payloads: string[] = [];
  const scriptRequests: Array<string | undefined> = [];
  await page.addInitScript(() => {
    const userAgent = navigator.userAgent.replace("Headless", "");
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgent", { get: () => userAgent });
  });
  await page.route("**/_vercel/insights/script.js", (route) => {
    scriptRequests.push(route.request().headers().referer);
    return route.fulfill({ contentType: "application/javascript", body: readFileSync(scriptFile!, "utf8") });
  });
  await page.route("**/_vercel/insights/view", (route) => {
    payloads.push(route.request().postData() ?? "");
    return route.fulfill({ status: 200, body: "" });
  });
  await page.goto("/threads/new?q=PRIVATE_PROMPT");
  expect(scriptRequests).toEqual([]);
  await page.goto("/threads/PRIVATE_THREAD_ID");
  await expect.poll(() => payloads.length).toBe(1);
  await page.goto("/");
  await expect.poll(() => payloads.length).toBe(2);
  await page.getByRole("link", { name: "/settings" }).click();
  await expect.poll(() => payloads.length).toBe(3);
  expect(scriptRequests).toEqual([undefined, undefined]);
  const pageviews = payloads.map((value) => JSON.parse(value) as { o: string; dp: string; r?: string });
  expect(pageviews.every(({ r }) => r === undefined || r === "")).toBe(true);
  expect(pageviews.map(({ o, dp }) => ({ o, dp }))).toEqual([
    { o: `${new URL(page.url()).origin}/threads/:threadId`, dp: "/threads/:threadId" },
    { o: `${new URL(page.url()).origin}/`, dp: "/" },
    { o: `${new URL(page.url()).origin}/settings`, dp: "/settings" },
  ]);
  expect(payloads.join(" ")).not.toMatch(/PRIVATE_PROMPT|PRIVATE_THREAD_ID|returnTo/u);
});

test("same-origin sensitive incoming referrer is omitted from Analytics beacon", async ({ page }) => {
  const scriptFile = process.env.DOROTHY_E2E_ANALYTICS_SCRIPT;
  test.skip(!scriptFile || process.env.VITE_TELEMETRY_PROVIDER !== "vercel" || process.env.DOROTHY_E2E_PREVIEW !== "1", "Requires locally captured SDK script and isolated opt-in preview");
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error("isolated preview baseURL required");
  const sensitiveReferrer = new URL("/threads/new?q=PRIVATE_REFERRER_PROMPT", baseURL).href;
  const payloads: string[] = [];
  await page.addInitScript(() => {
    const userAgent = navigator.userAgent.replace("Headless", "");
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgent", { get: () => userAgent });
  });
  await page.route("**/_vercel/insights/script.js", (route) => route.fulfill({ contentType: "application/javascript", body: readFileSync(scriptFile!, "utf8") }));
  await page.route("**/_vercel/insights/view", (route) => { payloads.push(route.request().postData() ?? ""); return route.fulfill({ status: 200, body: "" }); });
  await page.goto("/", { referer: sensitiveReferrer });
  expect(await page.evaluate(() => document.referrer)).toBe(sensitiveReferrer);
  await expect.poll(() => payloads.length).toBe(1);
  const pageview = JSON.parse(payloads[0]!) as { o: string; dp: string; r?: string };
  expect(pageview).toMatchObject({ o: new URL("/", baseURL).href, dp: "/" });
  expect(pageview.r).toBeUndefined();
  expect(payloads[0]).not.toContain("PRIVATE_REFERRER_PROMPT");
});

test("default fixture build does not request Analytics scripts", async ({ page }) => {
  test.skip(process.env.VITE_TELEMETRY_PROVIDER === "vercel", "Covered by isolated opt-in case");
  const requests: string[] = [];
  page.on("request", (request) => { if (/vercel-scripts|\/_vercel\/insights\/script/u.test(request.url())) requests.push(request.url()); });
  await page.goto("/");
  await page.getByRole("link", { name: "/settings" }).click();
  await expect(page).toHaveURL(/\/settings$/u);
  expect(requests).toEqual([]);
});

test("external document referrer does not trigger Analytics SDK", async ({ page }) => {
  test.skip(process.env.VITE_TELEMETRY_PROVIDER !== "vercel", "Only run with isolated fixture opt-in");
  const scripts: string[] = [];
  page.on("request", (request) => { if (/vercel-scripts|\/_vercel\/insights\/script/u.test(request.url())) scripts.push(request.url()); });
  await page.goto("/", { referer: "https://external.test/private-incoming-path" });
  await page.getByRole("link", { name: "/settings" }).click();
  await expect(page).toHaveURL(/\/settings$/u);
  expect(scripts).toEqual([]);
});

test("analytics script failure cannot prevent fixture route navigation", async ({ page }) => {
  test.skip(process.env.VITE_TELEMETRY_PROVIDER !== "vercel", "Only run with isolated fixture opt-in");
  await page.route(/vercel-scripts\.com\/v1\/script(?:\.debug)?\.js|\/_vercel\/insights\/script\.js/u, (route) => route.abort());
  await page.goto("/");
  await page.getByRole("link", { name: "/settings" }).click();
  await expect(page).toHaveURL(/\/settings$/u);
});

test("opt-in analytics scripts never receive sensitive referrers on initial load or SPA transitions", async ({ page }) => {
  test.skip(process.env.VITE_TELEMETRY_PROVIDER !== "vercel", "Only run with isolated fixture opt-in");
  const scripts: Array<{ url: string; referrer: string | undefined }> = [];
  await page.route(/va\.vercel-scripts\.com\/v1\/script(?:\.debug)?\.js|\/_vercel\/insights\/script\.js/u, (route) => {
    const request = route.request();
    scripts.push({ url: request.url(), referrer: request.headers().referer });
    // Network capture without making a Vercel-side request.
    return route.fulfill({ contentType: "application/javascript", body: "" });
  });
  await page.goto("/threads/new?q=PRIVATE_PROMPT");
  expect(scripts).toHaveLength(0);
  await page.goto("/threads/PRIVATE_THREAD_ID");
  await expect.poll(() => scripts.length).toBe(1);
  expect(scripts[0]?.referrer).toBeUndefined();
  await page.goto("/unlock?returnTo=%2Fthreads%2FPRIVATE_THREAD_ID");
  expect(scripts).toHaveLength(1);
  await page.goto("/");
  await expect.poll(() => scripts.length).toBe(2);
  expect(scripts.every((entry) => !entry.url.includes("PRIVATE"))).toBe(true);
  await page.getByRole("link", { name: "/settings" }).click();
  await expect(page).toHaveURL(/\/settings$/u);
  expect(scripts).toHaveLength(2);
  await expect.poll(() => page.evaluate(() => window.vaq?.filter(([type]) => type === "pageview").map(([, data]) => data))).toEqual([
    { route: "/", path: "/" }, { route: "/settings", path: "/settings" },
  ]);
});
