import { serve } from "@hono/node-server";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp({ config: loadConfig() }).fetch, port }, (info) => { console.log(`dorothy-ann listening on http://localhost:${info.port}`); });
