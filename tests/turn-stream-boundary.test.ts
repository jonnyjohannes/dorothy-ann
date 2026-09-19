import { describe, expect, it } from "vitest";
import { createTurnStreamBoundary, type TurnExecutor } from "../src/server/turn-stream-boundary.js";

const turnId = "123e4567-e89b-12d3-a456-426614174000";
const executionId = "123e4567-e89b-12d3-a456-426614174001";
const terminal = {
  kind: "search" as const,
  outcome: { status: "completed" as const, result: { completion: "empty" as const, destinations: [] }, execution: { kind: "recorded" as const, searchRef: "fixture" } },
  sourceRecords: [],
};
const limits = {};

function appFor(executor: TurnExecutor, options: { authenticate?: () => boolean; heartbeatMs?: number } = {}) {
  return createTurnStreamBoundary({
    executor,
    maxRequestBytes: 10_000,
    maxResults: 5,
    researchLimits: limits,
    heartbeatMs: options.heartbeatMs,
    authenticate: options.authenticate,
  });
}

describe("portable turn stream boundary", () => {
  it("validates the request, injects server limits, and sequences accepted/terminal exactly once", async () => {
    let calls = 0;
    const app = appFor({
      async execute(request, onSignal) {
        calls += 1;
        expect(request).toEqual({ executionId, turnId, kind: "search", query: "hello", maxResults: 5 });
        await onSignal({ type: "phase", phase: "searching" });
        return terminal;
      },
    });
    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ executionId, turnId, kind: "search", query: "hello" }),
    });
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(calls).toBe(1);
    expect(body.match(/event: turn\.accepted/g)).toHaveLength(1);
    expect(body.match(/event: turn\.terminal/g)).toHaveLength(1);
    expect(body).toContain("id: 1");
    expect(body).toContain("id: 3");
  });

  it("validates and sequences every legal research phase while awaiting async writes", async () => {
    const phases = ["searching", "extracting", "assessing", "decomposing", "recursing", "resolving", "synthesizing"] as const;
    const app = appFor({
      async execute(_request, onSignal) {
        for (const phase of phases) await onSignal({ type: "phase", phase });
        return { kind: "research", outcome: {}, sourceRecords: [] } as never;
      },
    });
    const response = await app.request("http://localhost/", { method: "POST", body: JSON.stringify({ executionId, turnId, kind: "research", question: "hello", answerPosition: "initial", context: { threadId: "123e4567-e89b-12d3-a456-426614174002", turns: [], knownSources: [], availableEvidence: [] } }) });
    const events = (await response.text()).split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)) as { type: string; phase?: string; sequence: number });
    expect(events.filter((event) => event.type === "phase").map((event) => event.phase)).toEqual(phases);
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1));
  });

  it("rejects terminal source-record closure before emission", async () => {
    const sourceId = `src_${"A".repeat(43)}` as never;
    const app = appFor({ execute: async () => ({ kind: "search", outcome: { status: "completed", result: { completion: "results", destinations: [{ sourceId, rank: 1 }] }, execution: { kind: "recorded", searchRef: "fixture" } }, sourceRecords: [] }) });
    const response = await app.request("http://localhost/", { method: "POST", body: JSON.stringify({ executionId, turnId, kind: "search", query: "hello" }) });
    expect(await response.text()).toContain('"code":"invalid_terminal"');
  });

  it("rejects an invalid research terminal at the server boundary", async () => {
    const app = appFor({ execute: async () => ({ kind: "research", outcome: {}, sourceRecords: [] }) as never });
    const response = await app.request("http://localhost/", { method: "POST", body: JSON.stringify({ executionId, turnId, kind: "research", question: "hello", answerPosition: "initial", context: { threadId: "123e4567-e89b-12d3-a456-426614174002", turns: [], knownSources: [], availableEvidence: [] } }) });
    const body = await response.text();
    expect(body).toContain('"code":"invalid_terminal"');
    expect(body).toContain("Turn execution returned an invalid result.");
  });

  it("rejects an invalid cast research phase before it reaches SSE", async () => {
    const app = appFor({
      async execute(_request, onSignal) {
        await onSignal({ type: "phase", phase: "private_invalid_phase" } as never);
        return { kind: "research", outcome: {}, sourceRecords: [] } as never;
      },
    });
    const response = await app.request("http://localhost/", { method: "POST", body: JSON.stringify({ executionId, turnId, kind: "research", question: "hello", answerPosition: "initial", context: { threadId: "123e4567-e89b-12d3-a456-426614174002", turns: [], knownSources: [], availableEvidence: [] } }) });
    const body = await response.text();
    expect(body).toContain('"code":"invalid_event"');
    expect(body).not.toContain("private_invalid_phase");
  });

  it("rejects malformed, oversized, unauthenticated, and cross-origin requests before streaming", async () => {
    const app = appFor({ execute: async () => terminal }, { authenticate: () => false });
    const unauthenticated = await app.request("http://localhost/", { method: "POST", body: "{}" });
    expect(unauthenticated.status).toBe(401);
    const malformed = await appFor({ execute: async () => terminal }).request("http://localhost/", { method: "POST", body: JSON.stringify({ kind: "search" }) });
    expect(malformed.status).toBe(400);
    const oversized = await appFor({ execute: async () => terminal }).request("http://localhost/", { method: "POST", headers: { "content-length": "10001" }, body: "{}" });
    expect(oversized.status).toBe(413);
  });

  it("emits heartbeat comments without consuming application sequence", async () => {
    const app = appFor({
      async execute(_request, _onSignal, signal) {
        await new Promise<void>((resolve) => setTimeout(resolve, 15));
        expect(signal.aborted).toBe(false);
        return terminal;
      },
    }, { heartbeatMs: 2 });
    const response = await app.request("http://localhost/", { method: "POST", body: JSON.stringify({ executionId, turnId, kind: "search", query: "hello" }) });
    const body = await response.text();
    expect(body).toContain(": heartbeat");
    expect(body.match(/id: /g)).toHaveLength(2);
  });

  it("forwards connection cancellation to the executor and does not fabricate a terminal", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const app = appFor({
      async execute(_request, _onSignal, signal) {
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => { cancelled = true; resolve(); }, { once: true }));
        return terminal;
      },
    });
    const request = new Request("http://localhost/", { method: "POST", body: JSON.stringify({ executionId, turnId, kind: "search", query: "hello" }), signal: controller.signal });
    const responsePromise = app.fetch(request);
    await new Promise((resolve) => setTimeout(resolve, 2));
    controller.abort();
    const body = await (await responsePromise).text();
    expect(cancelled).toBe(true);
    expect(body).not.toContain("turn.terminal");
  });

  it("sanitizes executor failures into one bounded error event", async () => {
    const app = appFor({ execute: async () => { throw new Error("provider secret and stack"); } });
    const response = await app.request("http://localhost/", { method: "POST", body: JSON.stringify({ executionId, turnId, kind: "search", query: "hello" }) });
    const body = await response.text();
    expect(body).toContain("turn.error");
    expect(body).toContain('"message":"Turn execution failed."');
    expect(body).not.toContain("provider secret");
  });
});
