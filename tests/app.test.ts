import { describe, expect, it, vi } from "vitest";
import type { ResearchTimingRecord } from "../server/runtime/research-timing";
import { createApp } from "../server/app";
import { loadConfig } from "../server/runtime/config";

const systemPrompts = { assessor: "fixture assessor", synthesizer: "fixture synthesizer" };
const app = createApp({ config: loadConfig({ DOROTHY_FIXTURE_MODE: "true" }), systemPrompts });
const liveApp = createApp({ config: loadConfig({ DOROTHY_FIXTURE_MODE: "false" }), systemPrompts });
const executionId = "00000000-0000-4000-8000-000000000001";
const turnId = "00000000-0000-4000-8000-000000000002";

describe("portable v3 Hono API", () => {
  it("reports health and provider status without exposing secrets", async () => {
    expect((await app.request("http://localhost/api/health")).status).toBe(200);
    const response = await app.request("http://localhost/api/status");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ fixtureMode: true, provider: true, search: true, llm: true, storage: false });
  });
  it("streams one fixture search turn through the target boundary", async () => {
    const response = await app.request("http://localhost/api/turn/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ executionId, turnId, kind: "search", query: "weather" }) });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("event: turn.accepted");
    expect(body).toContain("event: turn.source_delta");
    expect(body).toContain("event: turn.terminal");
  });
  it("streams fixture research phases at real operation boundaries", async () => {
    const response = await app.request("http://localhost/api/turn/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ executionId, turnId, kind: "research", question: "what happened?", context: { threadId: "00000000-0000-4000-8000-000000000003", turns: [], knownSources: [], availableEvidence: [] } }) });
    expect(response.status).toBe(200);
    const body = await response.text();
    const events = body.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)) as { type: string; phase?: string });
    expect(events.filter((event) => event.type === "phase").map((event) => event.phase)).toEqual([
      "resolving", "searching", "extracting", "resolving", "assessing", "resolving", "synthesizing",
    ]);
    const types = events.map((event) => event.type);
    expect(types.indexOf("research_state")).toBeLessThan(types.indexOf("answer_delta"));
    expect(events.findIndex((event) => event.phase === "synthesizing")).toBeGreaterThan(types.indexOf("research_state"));
    expect(events.findIndex((event) => event.phase === "synthesizing")).toBeLessThan(types.indexOf("answer_delta"));
    expect(types.at(-1)).toBe("terminal");
    expect(body).not.toContain("event: turn.error");
  });

  it("emits one sanitized opt-in timing summary outside the SSE contract", async () => {
    const records: ResearchTimingRecord[] = [];
    const timedApp = createApp({
      config: loadConfig({ DOROTHY_FIXTURE_MODE: "true" }),
      systemPrompts: { assessor: "SENTINEL_ASSESSOR_PROMPT", synthesizer: "SENTINEL_SYNTHESIZER_PROMPT" },
      researchTimingSink: (record) => { records.push(record); },
    });
    const response = await timedApp.request("http://localhost/api/turn/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ executionId, turnId, kind: "research", question: "SENTINEL_USER_QUESTION", context: { threadId: "00000000-0000-4000-8000-000000000003", turns: [], knownSources: [], availableEvidence: [] } }) });
    const body = await response.text();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ event: "research_timing", schema_version: 1, terminal_status: "completed", counts: { searches_used: 1, sources_consumed: 1, assessments_used: 1 } });
    const serialized = JSON.stringify(records[0]);
    for (const secret of ["SENTINEL_USER_QUESTION", "SENTINEL_ASSESSOR_PROMPT", "SENTINEL_SYNTHESIZER_PROMPT", executionId, turnId, "example.com"]) expect(serialized).not.toContain(secret);
    expect(body).not.toContain("research_timing");
    expect(body).not.toContain("execution_ms");
  });
  it("keeps timing console output disabled by default", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await app.request("http://localhost/api/turn/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ executionId, turnId, kind: "research", question: "timing disabled", context: { threadId: "00000000-0000-4000-8000-000000000003", turns: [], knownSources: [], availableEvidence: [] } }) });
    await response.text();
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("reports missing live provider readiness without exposing configuration", async () => {
    const response = await liveApp.request("http://localhost/api/status");
    expect(await response.json()).toEqual({ fixtureMode: false, provider: false, search: false, llm: false, storage: false });
  });
  it("requires authentication outside fixture mode", async () => {
    const response = await liveApp.request("http://localhost/api/turn/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ executionId, turnId, kind: "search", query: "weather" }) });
    expect(response.status).toBe(401);
  });
  it("rejects malformed and oversized turn requests", async () => {
    const malformed = await app.request("http://localhost/api/turn/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "search", query: "" }) });
    expect(malformed.status).toBe(400);
    const oversized = await app.request("http://localhost/api/turn/", { method: "POST", headers: { "content-type": "application/json", "content-length": "999999" }, body: "{}" });
    expect(oversized.status).toBe(413);
  });
});
