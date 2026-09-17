import { config as loadEnv } from "dotenv";
import { serve } from "@hono/node-server";
import { createApp } from "../app.js";
import { loadConfig } from "./config.js";
import { FileSystemPromptSource } from "./system-prompts.js";
import { IdentityPolicy } from "../../src/application/identity-policy.js";
import { WebCryptoIdentityHasher } from "../../src/infrastructure/identity/web-crypto-hasher.js";
import { RedisThreadStore } from "../../src/infrastructure/storage/redis-thread-store.js";

loadEnv({ path: ".env.local" });
loadEnv();
const port = Number(process.env.PORT ?? 8787);
const config = loadConfig();
const systemPrompts = await new FileSystemPromptSource().load();
const identities = new IdentityPolicy(new WebCryptoIdentityHasher());
const threadStoreV3 = !config.DOROTHY_FIXTURE_MODE && config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN
  ? RedisThreadStore.fromUpstash(config.UPSTASH_REDIS_REST_URL, config.UPSTASH_REDIS_REST_TOKEN, identities)
  : undefined;
serve({ fetch: createApp({ config, systemPrompts, threadStoreV3 }).fetch, port }, (info) => { console.log(`dorothy-ann listening on http://localhost:${info.port}`); });
