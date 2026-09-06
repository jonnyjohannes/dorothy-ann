import { handle } from "@hono/node-server/vercel";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";

export default handle(createApp({ config: loadConfig() }));
