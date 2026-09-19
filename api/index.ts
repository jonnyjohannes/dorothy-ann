import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/runtime/config.js";
import { FileSystemPromptSource } from "../server/runtime/system-prompts.js";
import { IdentityPolicy } from "../src/application/identity-policy.js";
import { WebCryptoIdentityHasher } from "../src/infrastructure/identity/web-crypto-hasher.js";
import { RedisThreadStore } from "../src/infrastructure/storage/redis-thread-store.js";
import { createLogger } from "../server/runtime/logger.js";

const appPromise = new FileSystemPromptSource().load().then((systemPrompts) => {
  const config = loadConfig();
  const logger = createLogger({ level: config.LOG_LEVEL });
  const identities = new IdentityPolicy(new WebCryptoIdentityHasher());
  const threadStoreV3 = !config.DOROTHY_FIXTURE_MODE && config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN
    ? RedisThreadStore.fromUpstash(config.UPSTASH_REDIS_REST_URL, config.UPSTASH_REDIS_REST_TOKEN, identities)
    : undefined;
  return createApp({ config, systemPrompts, threadStoreV3, logger });
});

type VercelRequest = IncomingMessage & { body?: unknown };

function requestHeaders(req: IncomingMessage) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

async function requestBody(req: VercelRequest): Promise<BodyInit | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (req.body !== undefined) {
    return typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: ServerResponse) {
  const app = await appPromise;
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (!host) {
    res.statusCode = 400;
    res.end("missing host");
    return;
  }
  const body = await requestBody(req);
  const request = new Request(`${protocol}://${host}${req.url ?? "/"}`, {
    method: req.method,
    headers: requestHeaders(req),
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const response = await app.fetch(request);
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}
