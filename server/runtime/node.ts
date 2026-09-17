import { config as loadEnv } from "dotenv";
import { serve } from "@hono/node-server";
import { createApp } from "../app.js";
import { loadConfig } from "./config.js";
import { FileSystemPromptSource } from "./system-prompts.js";

loadEnv({ path: ".env.local" });
loadEnv();
const port = Number(process.env.PORT ?? 8787);
const systemPrompts = await new FileSystemPromptSource().load();
serve({ fetch: createApp({ config: loadConfig(), systemPrompts }).fetch, port }, (info) => { console.log(`dorothy-ann listening on http://localhost:${info.port}`); });
