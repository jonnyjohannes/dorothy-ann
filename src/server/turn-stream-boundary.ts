import { Hono, type Context } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";
import { collectTurnSourceIds } from "../application/commit-terminal-turn.js";
import { researchResolutionV3Schema, researchTurnV3Schema, searchTurnV3Schema, threadContextV3Schema } from "../domain/schemas.js";
import type { ResearchLimits } from "../application/evidence-acquirer.js";
import type {
  CanonicalSource,
  ResearchCheckpoint,
  ResearchResolution,
  ResearchTurn,
  SearchTurn,
  SourceId,
  ThreadContext,
  Turn,
  TurnId,
  TurnKind,
  ExecutionId,
} from "../domain/types.js";

export type TurnPhase = "searching" | "assessing" | "decomposing" | "extracting" | "recursing" | "resolving" | "synthesizing";

export interface SourceDeltaOccurrence {
  sourceId: SourceId;
  role: "search_destination" | "research_evidence";
  rank?: number;
}

export type TurnGatewayRequest =
  | { executionId: ExecutionId; turnId: TurnId; kind: "search"; query: string }
  | { executionId: ExecutionId; turnId: TurnId; kind: "research"; question: string; context: ThreadContext; answerPosition: "initial" | "follow_up" };

export type TurnExecutionRequest =
  | Extract<TurnGatewayRequest, { kind: "search" }> & { maxResults: number }
  | Extract<TurnGatewayRequest, { kind: "research" }> & { limits: ResearchLimits };

type TerminalPayload<T extends Turn> = T extends { id: unknown; kind: unknown; createdAt: unknown; finishedAt: unknown; userMessage: unknown }
  ? Omit<T, "id" | "kind" | "createdAt" | "finishedAt" | "userMessage">
  : never;

export type TurnExecutionTerminal =
  | { kind: "search"; outcome: TerminalPayload<SearchTurn>; sourceRecords: CanonicalSource[] }
  | { kind: "research"; outcome: TerminalPayload<ResearchTurn>; sourceRecords: CanonicalSource[] };

export type TurnExecutionSignal =
  | { type: "phase"; phase: TurnPhase }
  | { type: "source_delta"; sources: CanonicalSource[]; occurrences: SourceDeltaOccurrence[] }
  | { type: "research_state"; state: { kind: "checkpoint"; checkpoint: ResearchCheckpoint } | { kind: "resolution"; resolution: ResearchResolution } }
  | { type: "answer_delta"; delta: string };

export interface TurnExecutor {
  execute(request: TurnExecutionRequest, onSignal: (signal: TurnExecutionSignal) => void | Promise<void>, signal: AbortSignal): Promise<TurnExecutionTerminal>;
}

export interface TurnExecutionEventBase {
  executionId: ExecutionId;
  turnId: TurnId;
  sequence: number;
}

export type TurnExecutionEvent =
  | (TurnExecutionEventBase & { type: "error"; code: "invalid_event" | "invalid_terminal" | "execution_failed"; message: string })
  | (TurnExecutionEventBase & { type: "accepted"; kind: TurnKind })
  | (TurnExecutionEventBase & { type: "phase"; phase: TurnPhase })
  | (TurnExecutionEventBase & { type: "source_delta"; sources: CanonicalSource[]; occurrences: SourceDeltaOccurrence[] })
  | (TurnExecutionEventBase & { type: "research_state"; state: { kind: "checkpoint"; checkpoint: ResearchCheckpoint } | { kind: "resolution"; resolution: ResearchResolution } })
  | (TurnExecutionEventBase & { type: "answer_delta"; delta: string })
  | (TurnExecutionEventBase & { type: "terminal"; terminal: TurnExecutionTerminal });

export interface TurnStreamBoundaryOptions {
  executor: TurnExecutor;
  maxRequestBytes: number;
  maxResults: number;
  researchLimits: ResearchLimits;
  authenticate?: (context: Context) => boolean | Promise<boolean>;
  sameOrigin?: (context: Context) => boolean;
  heartbeatMs?: number;
}

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);

const boundedText = (minimum: number, maximum: number) => z.string().refine((value) => [...value].length >= minimum && [...value].length <= maximum);
const sourceId = z.string().regex(/^src_[A-Za-z0-9_-]{43}$/);
const sourceSchema = z.strictObject({
  sourceId,
  title: boundedText(1, 500),
  url: boundedText(1, 2_048).url(),
  canonicalUrl: boundedText(1, 2_048).url(),
  displayUrl: boundedText(1, 512),
  snippet: boundedText(0, 1_000).optional(),
  publishedAt: z.string().datetime().optional(),
});
const occurrenceSchema = z.strictObject({ sourceId, role: z.enum(["search_destination", "research_evidence"]), rank: z.number().int().positive().max(10).optional() });
const requestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ executionId: uuid, turnId: uuid, kind: z.literal("search"), query: boundedText(1, 2_000) }),
  z.strictObject({ executionId: uuid, turnId: uuid, kind: z.literal("research"), question: boundedText(1, 2_000), context: threadContextV3Schema, answerPosition: z.enum(["initial", "follow_up"]) }),
]);

function jsonError(context: Context, status: 400 | 401 | 403 | 413 | 500 | 503, code: string, message: string) {
  return context.json({ error: { code, message } }, status);
}

async function readBoundedJson(request: Request, maximum: number): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413; code: string; message: string }> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) return { ok: false, status: 413, code: "request_too_large", message: "request body is too large" };
  if (!request.body) return { ok: false, status: 400, code: "invalid_request", message: "request body is required" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        return { ok: false, status: 413, code: "request_too_large", message: "request body is too large" };
      }
      chunks.push(next.value);
    }
  } catch {
    return { ok: false, status: 400, code: "invalid_request", message: "request body could not be read" };
  }
  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, status: 400, code: "invalid_request", message: "request body must be valid JSON" };
  }
}

const researchPhases = new Set<TurnPhase>(["searching", "extracting", "assessing", "decomposing", "recursing", "resolving", "synthesizing"]);

function validateSignal(signal: TurnExecutionSignal, request: TurnExecutionRequest): boolean {
  if (signal.type === "phase") return request.kind === "research" ? researchPhases.has(signal.phase) : signal.phase === "searching";
  if (signal.type === "answer_delta") return request.kind === "research" && signal.delta.length <= 64_000;
  if (signal.type === "research_state") {
    if (request.kind !== "research") return false;
    return signal.state.kind === "resolution" ? researchResolutionV3Schema.safeParse(signal.state.resolution).success : typeof signal.state.checkpoint === "object" && signal.state.checkpoint !== null;
  }
  if (signal.type === "source_delta") {
    if (signal.sources.length > 10 || signal.occurrences.length > 10) return false;
    return signal.sources.every((source) => sourceSchema.safeParse(source).success)
      && signal.occurrences.every((occurrence) => occurrenceSchema.safeParse(occurrence).success)
      && signal.occurrences.every((occurrence) => signal.sources.some((source) => source.sourceId === occurrence.sourceId));
  }
  return false;
}

function validateTerminal(terminal: TurnExecutionTerminal, kind: TurnKind, request: TurnExecutionRequest): boolean {
  if (terminal.kind !== kind || terminal.sourceRecords.length > 24) return false;
  if (!terminal.sourceRecords.every((source) => sourceSchema.safeParse(source).success)) return false;
  const timestamp = new Date(0).toISOString();
  const candidate = { ...terminal.outcome, id: request.turnId, kind, createdAt: timestamp, finishedAt: timestamp, userMessage: { id: request.turnId, role: "user", content: "request", createdAt: timestamp } };
  const parsed = kind === "search" ? searchTurnV3Schema.safeParse(candidate) : researchTurnV3Schema.safeParse(candidate);
  if (!parsed.success) return false;
  const supplied = new Set(terminal.sourceRecords.map((source) => String(source.sourceId)));
  return supplied.size === terminal.sourceRecords.length && [...collectTurnSourceIds(parsed.data)].every((sourceId) => supplied.has(String(sourceId)));
}

function eventName(type: TurnExecutionEvent["type"]): string {
  return type === "accepted" ? "turn.accepted" : type === "terminal" ? "turn.terminal" : `turn.${type}`;
}

/** Portable authenticated HTTP/SSE boundary. It owns framing and validation, not execution policy. */
export function createTurnStreamBoundary(options: TurnStreamBoundaryOptions): Hono {
  const app = new Hono();
  app.post("/", async (context) => {
    if (options.sameOrigin && !options.sameOrigin(context)) return jsonError(context, 403, "forbidden", "same-origin request required");
    if (options.authenticate && !(await options.authenticate(context))) return jsonError(context, 401, "unauthorized", "authentication required");
    const body = await readBoundedJson(context.req.raw, options.maxRequestBytes);
    if (!body.ok) return jsonError(context, body.status, body.code, body.message);
    const parsed = requestSchema.safeParse(body.value);
    if (!parsed.success) return jsonError(context, 400, "invalid_request", "turn request is malformed");
    const request = parsed.data as TurnGatewayRequest;
    const requestForExecutor: TurnExecutionRequest = request.kind === "search"
      ? { ...request, maxResults: options.maxResults }
      : { ...request, limits: options.researchLimits };
    const abort = new AbortController();
    const abortRequest = () => abort.abort();
    context.req.raw.signal.addEventListener("abort", abortRequest, { once: true });
    return stream(context, async (writer) => {
      let sequence = 1;
      let terminalSent = false;
      let protocolInvalid = false;
      const write = async (type: TurnExecutionEvent["type"], payload: Omit<TurnExecutionEvent, keyof TurnExecutionEventBase | "type">) => {
        const event = { executionId: request.executionId, turnId: request.turnId, sequence, type, ...payload } as TurnExecutionEvent;
        sequence += 1;
        await writer.write(`id: ${event.sequence}\nevent: ${eventName(type)}\ndata: ${JSON.stringify(event)}\n\n`);
      };
      await write("accepted", { kind: request.kind });
      const heartbeat = setInterval(() => { void writer.write(`: heartbeat\n\n`); }, options.heartbeatMs ?? 15_000);
      try {
        const terminal = await options.executor.execute(requestForExecutor, async (signal) => {
          if (terminalSent) return;
          if (!validateSignal(signal, requestForExecutor)) {
            protocolInvalid = true;
            abort.abort();
            return;
          }
          await write(signal.type, signal.type === "phase" ? { phase: signal.phase } : signal.type === "source_delta" ? { sources: signal.sources, occurrences: signal.occurrences } : signal.type === "research_state" ? { state: signal.state } : { delta: signal.delta });
        }, abort.signal);
        if (!terminalSent && !context.req.raw.signal.aborted && !abort.signal.aborted && !protocolInvalid && validateTerminal(terminal, request.kind, requestForExecutor)) {
          terminalSent = true;
          await write("terminal", { terminal });
        } else if (!terminalSent) {
          const code = protocolInvalid ? "invalid_event" : "invalid_terminal";
          await write("error", { code, message: protocolInvalid ? "Turn execution emitted an invalid event." : "Turn execution returned an invalid result." });
        }
      } catch {
        if (!terminalSent && !context.req.raw.signal.aborted) await write("error", { code: "execution_failed", message: "Turn execution failed." });
      } finally {
        clearInterval(heartbeat);
        context.req.raw.signal.removeEventListener("abort", abortRequest);
      }
    });
  });
  return app;
}

export { requestSchema as turnGatewayRequestSchema };
