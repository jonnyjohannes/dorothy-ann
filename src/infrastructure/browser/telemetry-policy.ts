import type { BeforeSendEvent as AnalyticsEvent } from "@vercel/analytics/react";

/** Never pass a concrete path, query, fragment or third-party URL to Analytics. */
export function telemetryRoute(path: string): string | null {
  if (path === "/" || path === "/new" || path === "/threads" || path === "/settings") return path;
  if (/^\/threads\/[^/]+$/u.test(path) && path !== "/threads/new") return "/threads/:threadId";
  return null;
}

function safeEventUrl(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    const route = telemetryRoute(parsed.pathname);
    return route === null ? null : `${parsed.origin}${route}`;
  } catch { return null; }
}

export function analyticsBeforeSend(event: AnalyticsEvent): AnalyticsEvent | null {
  if (event.type !== "pageview") return null;
  const url = safeEventUrl(event.url);
  return url === null ? null : { type: "pageview", url };
}
