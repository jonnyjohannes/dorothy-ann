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
const offlineEnabled = localProbeEnabled(process.env.DOROTHY_LOCAL_EMPTY_PROBE, process.env.NODE_ENV, config.DOROTHY_FIXTURE_MODE);
const publicScriptEnabled = localProbeEnabled(process.env.DOROTHY_LOCAL_PUBLIC_SCRIPT_PILOT, process.env.NODE_ENV, config.DOROTHY_FIXTURE_MODE);
const originEnabled = localProbeEnabled(process.env.DOROTHY_LOCAL_ORIGIN_PROBE, process.env.NODE_ENV, config.DOROTHY_FIXTURE_MODE);
const shapeEnabled = localProbeEnabled(process.env.DOROTHY_LOCAL_STATIC_SHAPE_PROBE, process.env.NODE_ENV, config.DOROTHY_FIXTURE_MODE);
if (Number(offlineEnabled) + Number(publicScriptEnabled) + Number(originEnabled) + Number(shapeEnabled) > 1) throw new Error("conflicting_local_probes");
const localEmptyHtmlSample = shapeEnabled
  ? (await import("../../scripts/local-static-shape-probe.js")).createLocalStaticShapeProbe((result) => logger.info("local_static_shape_probe", {
    stage: "diagnostic", sample_index: result.sample_index, inspection: result.inspection,
    shape: result.shape ? {
      bytes: result.shape.bytes, body_present: result.shape.body_present,
      root_before: result.shape.root_before, root_after: result.shape.root_after,
      body_before: result.shape.body_before, root_text_before: result.shape.root_text_before,
      body_dom_text_before: result.shape.body_dom_text_before, root_dom_text_before: result.shape.root_dom_text_before,
      body_after: result.shape.body_after, root_text_after: result.shape.root_text_after,
      body_elements: result.shape.body_elements, inline_scripts: result.shape.inline_scripts,
      external_scripts: result.shape.external_scripts,
    } : null,
  }))
  : originEnabled
    ? (await import("../../scripts/local-origin-html-probe.js")).createLocalOriginHtmlProbe((result) => logger.info("local_origin_html_probe", {
    stage: "diagnostic", sample_index: result.sample_index,
    baseline: { render: result.baseline.render, failure_stage: result.baseline.failure_stage,
      read_method: result.baseline.read_method, semantic_text: result.baseline.semantic_text,
      body_text: result.baseline.body_text, blocked_requests: result.baseline.blocked_requests },
    origin: { render: result.origin.render, failure_stage: result.origin.failure_stage,
      read_method: result.origin.read_method, semantic_text: result.origin.semantic_text,
      body_text: result.origin.body_text, blocked_requests: result.origin.blocked_requests },
  }))
  : publicScriptEnabled
    ? (await import("../../scripts/local-public-script-pilot.js")).createLocalPublicScriptPilot((result) => logger.info("local_public_script_pilot", {
    stage: "diagnostic", sample_index: result.sample_index, render: result.render, failure_stage: result.failure_stage,
    read_method: result.read_method, semantic_text: result.semantic_text, body_text: result.body_text,
    blocked_requests: result.blocked_requests, external_script_attempted: result.external_script_attempted,
    external_script_fetched: result.external_script_fetched,
  }))
  : offlineEnabled
    ? createLocalEmptyHtmlProbe((result) => logger.info("local_empty_html_probe", {
      stage: "diagnostic", sample_index: result.sample_index, render: result.render, failure_stage: result.failure_stage,
      read_method: result.read_method, semantic_text: result.semantic_text, body_text: result.body_text,
      blocked_requests: result.blocked_requests,
    }))
    : undefined;
if (localEmptyHtmlSample) logger.info(shapeEnabled ? "local_static_shape_probe_armed" : originEnabled ? "local_origin_html_probe_armed" : publicScriptEnabled ? "local_public_script_pilot_armed" : "local_empty_html_probe_armed", {
  stage: "diagnostic", max_samples: 2, network: "browser_offline",
});
serve({ fetch: createApp({ config, systemPrompts, threadStoreV3, logger, localEmptyHtmlSample }).fetch, port }, (info) => { logger.info("server_listening", { stage: "runtime", port: info.port }); });
