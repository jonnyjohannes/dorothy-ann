import { config as loadEnv } from "dotenv";
import { serve } from "@hono/node-server";
import { createApp } from "../app.js";
import { loadConfig } from "./config.js";
import { FileSystemPromptSource } from "./system-prompts.js";
import { IdentityPolicy } from "../../src/application/identity-policy.js";
import { WebCryptoIdentityHasher } from "../../src/infrastructure/identity/web-crypto-hasher.js";
import { RedisThreadStore } from "../../src/infrastructure/storage/redis-thread-store.js";
import { createLogger } from "./logger.js";

loadEnv({ path: ".env.local" });
loadEnv();
const port = Number(process.env.PORT ?? 8787);
const config = loadConfig();
const logger = createLogger({ level: config.LOG_LEVEL });
const systemPrompts = await new FileSystemPromptSource().load();
const identities = new IdentityPolicy(new WebCryptoIdentityHasher());
const threadStoreV3 = !config.DOROTHY_FIXTURE_MODE && config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN
  ? RedisThreadStore.fromUpstash(config.UPSTASH_REDIS_REST_URL, config.UPSTASH_REDIS_REST_TOKEN, identities)
  : undefined;
const { localProbeEnabled, createLocalEmptyHtmlProbe } = await import("../../scripts/local-empty-html-probe.js");
const localEmptyHtmlSample = localProbeEnabled(process.env.DOROTHY_LOCAL_EMPTY_PROBE, process.env.NODE_ENV, config.DOROTHY_FIXTURE_MODE)
  ? createLocalEmptyHtmlProbe((result) => logger.info("local_empty_html_probe", {
    stage: "diagnostic", sample_index: result.sample_index, render: result.render, failure_stage: result.failure_stage,
    read_method: result.read_method, semantic_text: result.semantic_text, body_text: result.body_text,
    blocked_requests: result.blocked_requests,
  }))
  : undefined;
if (localEmptyHtmlSample) logger.info("local_empty_html_probe_armed", { stage: "diagnostic", max_samples: 2, network: "offline" });
serve({ fetch: createApp({ config, systemPrompts, threadStoreV3, logger, localEmptyHtmlSample }).fetch, port }, (info) => { logger.info("server_listening", { stage: "runtime", port: info.port }); });
