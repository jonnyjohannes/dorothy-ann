import { describe, expect, it } from "vitest";
import { createFetchTurnGateway } from "../src/infrastructure/browser/turn-gateway.js";

const executionId = "123e4567-e89b-12d3-a456-426614174001" as never;
const turnId = "123e4567-e89b-12d3-a456-426614174000" as never;
const request = { executionId, turnId, kind: "search" as const, query: "hello" };
const options = { maxResults: 5, researchLimits: {} };
function response(body: string): Response {
  return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
}
function event(type: string, sequence: number, payload: Record<string, unknown>): string {
  return `id: ${sequence}\nevent: turn.${type}\ndata: ${JSON.stringify({ executionId, turnId, sequence, type, ...payload })}\n\n`;
}

describe("browser turn gateway", () => {
  it("decodes and validates SSE events while preserving sequence and identity", async () => {
    const gateway = createFetchTurnGateway({ fetch: async () => response(event("accepted", 1, { kind: "search" }) + event("terminal", 2, { terminal: { kind: "search", outcome: { status: "completed", result: { completion: "empty", destinations: [] }, execution: { kind: "recorded", searchRef: "fixture" } }, sourceRecords: [] } })) });
    const events: unknown[] = [];
    for await (const item of gateway.stream(request, options, new AbortController().signal)) events.push(item);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ sequence: 1, type: "accepted" });
    expect(events[1]).toMatchObject({ sequence: 2, type: "terminal" });
  });

  it("rejects malformed decoded payloads instead of exposing unvalidated events", async () => {
    const gateway = createFetchTurnGateway({ fetch: async () => response(event("accepted", 1, { kind: "search" }).replace('"kind":"search"', '"kind":"unknown"')) });
    const iterator = gateway.stream(request, options, new AbortController().signal)[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow("invalid turn event");
  });
});
