import { Hono } from "hono";
import type { AppConfig } from "./config.js";

export interface AppDependencies { config: AppConfig; }

export function createApp({ config }: AppDependencies) {
  const app = new Hono();
  app.use("/api/*", async (context, next) => { context.header("Cache-Control", "no-store"); context.header("X-Content-Type-Options", "nosniff"); context.header("Referrer-Policy", "same-origin"); await next(); });
  app.get("/api/health", (context) => context.json({ ok: true, fixtureMode: config.DOROTHY_FIXTURE_MODE }));
  app.get("/api/auth/session", (context) => context.json({ authenticated: false }));
  app.post("/api/auth/logout", (context) => context.body(null, 204));
  app.post("/api/auth/passphrase", async (context) => { const body = await context.req.json().catch(() => null) as { passphrase?: unknown } | null; if (!body || typeof body.passphrase !== "string" || body.passphrase.length === 0) return context.json({ error: { code: "invalid_request", message: "passphrase is required" } }, 400); return context.json({ authenticated: true, session: { subject: "owner", method: "passphrase", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), absoluteExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString() } }); });
  app.post("/api/lookup", async (context) => { const body = await context.req.json().catch(() => null) as { query?: unknown } | null; if (!body || typeof body.query !== "string" || !body.query.trim()) return context.json({ error: { code: "invalid_request", message: "query is required" } }, 400); if (!config.DOROTHY_FIXTURE_MODE) return context.json({ error: { code: "service_unavailable", message: "live search adapter is not configured in this scaffold" } }, 503); return context.json({ results: [{ sourceId: "fixture-weather", rank: 1, title: `Fixture result for ${body.query.trim()}`, url: "https://example.com/fixture", canonicalUrl: "https://example.com/fixture", displayUrl: "example.com/fixture", snippet: "A safe fixture result for local development." }] }); });
  return app;
}
