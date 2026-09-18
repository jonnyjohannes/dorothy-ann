import { describe, expect, it } from "vitest";
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
  it("streams a fixture research turn without protocol-invalid events", async () => {
    const response = await app.request("http://localhost/api/turn/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ executionId, turnId, kind: "research", question: "what happened?", context: { threadId: "00000000-0000-4000-8000-000000000003", turns: [], knownSources: [], availableEvidence: [] } }) });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("event: turn.research_state");
    expect(body).toContain("event: turn.answer_delta");
    expect(body).toContain("event: turn.terminal");
    expect(body).not.toContain("event: turn.error");
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
