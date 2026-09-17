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
    expect(body).toContain('"message":"turn execution failed"');
    expect(body).not.toContain("provider secret");
  });
});
