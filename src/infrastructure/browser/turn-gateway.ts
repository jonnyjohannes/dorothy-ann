import { createParser } from "eventsource-parser";
import { z } from "zod";
import { researchResolutionV3Schema, sourceRecordV3Schema } from "../../domain/schemas.js";
import type { ExecutionId, TurnId } from "../../domain/types.js";
import type {
  TurnGateway,
  TurnGatewayEvent,
  TurnGatewayOptions,
  TurnGatewayRequest,
} from "../../ports/turn-gateway.js";

export interface FetchTurnGatewayOptions {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  maxEventBytes?: number;
}

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
const sourceId = z.string().regex(/^src_[A-Za-z0-9_-]{43}$/);
const source = sourceRecordV3Schema;
const base = z.object({ executionId: uuid, turnId: uuid, sequence: z.number().int().positive() }).strict();
const eventSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("error"), code: z.enum(["invalid_event", "invalid_terminal", "execution_failed"]), message: z.string().min(1).max(500) }),
  base.extend({ type: z.literal("accepted"), kind: z.enum(["search", "research"]) }),
  base.extend({ type: z.literal("phase"), phase: z.enum(["searching", "assessing", "decomposing", "extracting", "recursing", "resolving", "synthesizing"]) }),
  base.extend({
    type: z.literal("source_delta"),
    sources: z.array(source).max(10),
    occurrences: z.array(z.object({ sourceId, role: z.enum(["search_destination", "research_evidence"]), rank: z.number().int().positive().max(10).optional() }).strict()).max(10),
  }),
  base.extend({
    type: z.literal("research_state"),
    state: z.union([
      z.object({ kind: z.literal("resolution"), resolution: researchResolutionV3Schema }).strict(),
      z.object({ kind: z.literal("checkpoint"), checkpoint: z.record(z.string(), z.unknown()) }).strict(),
    ]),
  }),
  base.extend({ type: z.literal("answer_delta"), delta: z.string().max(64_000) }),
  base.extend({
    type: z.literal("terminal"),
    terminal: z.object({
      kind: z.enum(["search", "research"]),
      outcome: z.record(z.string(), z.unknown()),
      sourceRecords: z.array(source).max(24),
    }).strict(),
  }),
]);

const eventNameToType: Record<string, TurnGatewayEvent["type"]> = {
  "turn.error": "error",
  "turn.accepted": "accepted",
  "turn.phase": "phase",
  "turn.source_delta": "source_delta",
  "turn.research_state": "research_state",
  "turn.answer_delta": "answer_delta",
  "turn.terminal": "terminal",
};

function decodeEvent(message: { event?: string; id?: string; data: string }): TurnGatewayEvent | null {
  if (!message.event || message.event === "message") return null;
  const type = eventNameToType[message.event];
  if (!type || !message.id) throw new Error("invalid turn event envelope");
  let payload: unknown;
  try { payload = JSON.parse(message.data); } catch { throw new Error("invalid turn event data"); }
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success || parsed.data.type !== type || String(parsed.data.sequence) !== message.id) throw new Error("invalid turn event");
  return parsed.data as TurnGatewayEvent;
}

async function* parseStream(response: Response, maxEventBytes: number): AsyncGenerator<TurnGatewayEvent> {
  if (!response.ok || !response.body) throw new Error("turn stream unavailable");
  const queue: TurnGatewayEvent[] = [];
  let parseFailure: Error | undefined;
  const parser = createParser({
    maxBufferSize: maxEventBytes,
    onEvent: (message) => {
      try {
        const event = decodeEvent(message);
        if (event) queue.push(event);
      } catch (error) { parseFailure = error instanceof Error ? error : new Error("invalid turn event"); }
    },
    onError: (error) => { parseFailure = error; },
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      parser.feed(decoder.decode(next.value, { stream: true }));
      if (parseFailure) throw parseFailure;
      while (queue.length) yield queue.shift()!;
    }
    parser.feed(decoder.decode());
    parser.reset({ consume: true });
    if (parseFailure) throw parseFailure;
    while (queue.length) yield queue.shift()!;
  } finally { reader.releaseLock(); }
}

export function createFetchTurnGateway(options: FetchTurnGatewayOptions = {}): TurnGateway {
  const requestFetch = options.fetch ?? globalThis.fetch;
  const endpoint = options.endpoint ?? "/api/turn";
  const maxEventBytes = options.maxEventBytes ?? 256_000;
  return {
    async *stream(request: TurnGatewayRequest, gatewayOptions: TurnGatewayOptions, signal: AbortSignal): AsyncIterable<TurnGatewayEvent> {
      // Operational ceilings are injected by the authenticated server boundary;
      // clients send only the provider-neutral request contract.
      const body = request;
      const response = await requestFetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body), signal });
      yield* parseStream(response, maxEventBytes);
    },
  };
}

export function isGatewayIdentity(event: TurnGatewayEvent, executionId: ExecutionId, turnId: TurnId): boolean {
  return event.executionId === executionId && event.turnId === turnId;
}
