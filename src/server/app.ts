import { Hono, type Context } from "hono";
import { createTurnStreamBoundary, type TurnStreamBoundaryOptions } from "./turn-stream-boundary.js";

export interface PortableServerRoutes {
  auth?: Hono;
  status?: Hono;
  storage?: Hono;
}

export interface PortableAppOptions extends TurnStreamBoundaryOptions {
  routes?: PortableServerRoutes;
  sameOrigin?: (context: Context) => boolean;
  authenticate?: (context: Context) => boolean | Promise<boolean>;
}

/**
 * Framework-only composition for the public server boundary. Runtime adapters
 * supply credentials, providers, storage routes, and the executor; this module
 * does not import Node, provider SDKs, or persistence implementations.
 */
export function createPortableApp(options: PortableAppOptions): Hono {
  const app = new Hono();
  app.use("/api/*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    context.header("X-Content-Type-Options", "nosniff");
    context.header("Referrer-Policy", "same-origin");
    context.header("X-Frame-Options", "DENY");
    context.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    await next();
  });
  app.get("/api/health", (context) => context.json({ ok: true }));
  if (options.routes?.auth) app.route("/api/auth", options.routes.auth);
  if (options.routes?.status) app.route("/api/status", options.routes.status);
  if (options.routes?.storage) app.route("/api/storage/threads", options.routes.storage);
  const turnBoundary = createTurnStreamBoundary(options);
  app.route("/api/turn", turnBoundary);
  app.route("/api/turn/", turnBoundary);
  return app;
}

export const createServerApp = createPortableApp;
