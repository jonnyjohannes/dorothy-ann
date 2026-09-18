// @vitest-environment node
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/runtime/config.js";
import { buildThreadContext } from "../src/domain/thread-context.js";
import type { ExecutionId, ThreadId, TurnId, UserMessage } from "../src/domain/types.js";
import { createFetchTurnGateway } from "../src/infrastructure/browser/turn-gateway.js";
import { IndexedDbThreadStore, openDorothyAnnV3Db } from "../src/infrastructure/browser/indexeddb-thread-store.js";
import { TurnController } from "../src/ui/controllers/turn-controller.js";

const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const at = (second: number) => `2026-09-18T01:00:${String(second).padStart(2, "0")}.000Z` as UserMessage["createdAt"];
const contextLimits = { maxThreadContextTurns: 8, maxThreadContextChars: 24_000, maxEvidenceCharsPerSource: 48_000, maxEvidenceCharsTotal: 96_000, maxTurnRequestBytes: 128_000 } as const;

describe("research browser flow", () => {
  it("commits a research turn and a contextual follow-up through the real stream and IndexedDB boundaries", async () => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
    const app = createApp({ config: loadConfig({ DOROTHY_FIXTURE_MODE: "true" }), systemPrompts: { assessor: "fixture assessor", synthesizer: "fixture synthesizer" } });
    const gateway = createFetchTurnGateway({ fetch: (input, init) => app.request(typeof input === "string" || input instanceof URL ? String(input) : input.url, init) });
    const databaseName = `dorothy-research-browser-${crypto.randomUUID()}`;
    const store = new IndexedDbThreadStore(openDorothyAnnV3Db(databaseName), () => new Date("2026-09-18T01:01:00.000Z"));
    const threadId = uuid(1) as ThreadId;

    const firstTurnId = uuid(2) as TurnId;
    const first = await new TurnController(gateway, store, () => at(2)).run({
      threadId,
      turnId: firstTurnId,
      executionId: uuid(3) as ExecutionId,
      kind: "research",
      request: "what happened?",
      userMessage: { id: uuid(4) as UserMessage["id"], role: "user", content: "what happened?", createdAt: at(1) },
      createdAt: at(1),
      expectedRevision: null,
      create: { id: threadId, title: "What happened?", createdAt: at(1) },
      context: { threadId, turns: [], knownSources: [], availableEvidence: [] },
      answerPosition: "initial",
      gatewayOptions: { maxResults: 5, researchLimits: {} },
    });
    expect(first).toMatchObject({ ok: true, turn: { kind: "research", status: "completed" } });
    if (!first.ok) return;

    const second = await new TurnController(gateway, store, () => at(4)).run({
      threadId,
      turnId: uuid(5) as TurnId,
      executionId: uuid(6) as ExecutionId,
      kind: "research",
      request: "what should I ask next?",
      userMessage: { id: uuid(7) as UserMessage["id"], role: "user", content: "what should I ask next?", createdAt: at(3) },
      createdAt: at(3),
      expectedRevision: first.record.revision,
      context: buildThreadContext(first.record.thread, contextLimits),
      answerPosition: "follow_up",
      gatewayOptions: { maxResults: 5, researchLimits: {} },
    });
    expect(second).toMatchObject({ ok: true, turn: { kind: "research", status: "completed" }, record: { thread: { turns: [{ id: firstTurnId }, { id: uuid(5) }] } } });
  });
});
