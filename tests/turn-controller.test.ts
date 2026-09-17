import { describe, expect, it } from "vitest";
import type { StoredThreadRecord, ThreadRevision, ThreadStore } from "../src/ports/storage-v3.js";
import type { TurnGateway, TurnGatewayEvent } from "../src/ports/turn-gateway.js";
import { TurnController, type TurnStartInput } from "../src/ui/controllers/turn-controller.js";

const executionId = "123e4567-e89b-12d3-a456-426614174001" as never;
const turnId = "123e4567-e89b-12d3-a456-426614174000" as never;
const threadId = "123e4567-e89b-12d3-a456-426614174002" as never;
const at = "2026-01-01T00:00:00.000Z" as never;
const accepted = { executionId, turnId, sequence: 1, type: "accepted" as const, kind: "search" as const };
const terminal = { executionId, turnId, sequence: 2, type: "terminal" as const, terminal: { kind: "search" as const, outcome: { status: "completed" as const, result: { completion: "empty" as const, destinations: [] }, execution: { kind: "recorded" as const, searchRef: "fixture" } }, sourceRecords: [] } };

function input(): TurnStartInput {
  return { threadId, turnId, executionId, kind: "search", request: "hello", createdAt: at, userMessage: { id: turnId, role: "user", content: "hello", createdAt: at }, expectedRevision: null, create: { id: threadId, title: "Hello", createdAt: at }, gatewayOptions: { maxResults: 5, researchLimits: {} } };
}
function record(revision: string): StoredThreadRecord { return { recordVersion: 1, revision: revision as ThreadRevision, expiresAt: "2026-01-08T00:00:00.000Z" as never, thread: { schemaVersion: 3, id: threadId, title: "Hello", createdAt: at, updatedAt: at, sources: [], turns: [], legacyArchive: [] } }; }
function storeWith(commit: ThreadStore["commitTerminalTurn"], load: ThreadStore["load"] = async () => ({ ok: true, value: record("r1") })): ThreadStore {
  return { commitTerminalTurn: commit, load, list: async () => ({ ok: true, value: [] }), remove: async () => ({ ok: true, value: "removed" }), exportData: async () => ({ ok: true, value: { backupVersion: 3, exportedAt: at, threads: [] } }), inspectImport: async () => ({ ok: false, failure: { code: "invalid_record", retryable: false } }), importData: async () => ({ ok: true, value: { added: [], replaced: [], skipped: [], skippedInvalid: 0, archivedLegacyEntries: 0, droppedLegacyEntries: 0 } }) } as ThreadStore;
}
function gatewayFor(events: TurnGatewayEvent[], after?: (signal: AbortSignal) => Promise<void>): TurnGateway {
  return { async *stream(_request, _options, signal) { for (const event of events) yield event; if (after) await after(signal); } };
}

describe("TurnController", () => {
  it("rejects stale, duplicate, and gapped sequences without committing", async () => {
    let commits = 0;
    const store = storeWith(async () => { commits += 1; return { ok: true, value: { disposition: "committed", record: record("r1") } }; });
    const controller = new TurnController(gatewayFor([accepted, { ...terminal, sequence: 3 }]), store);
    expect(await controller.run(input())).toMatchObject({ ok: false, error: "invalid_event" });
    expect(commits).toBe(0);
    const duplicate = new TurnController(gatewayFor([accepted, { ...accepted, sequence: 2 }]), store);
    expect(await duplicate.run(input())).toMatchObject({ ok: false, error: "invalid_event" });
  });

  it("persists a controller-created cancellation and owns one active run", async () => {
    let committed: unknown;
    const store = storeWith(async (commit) => { committed = commit; return { ok: true, value: { disposition: "committed", record: record("r1") } }; });
    const controller = new TurnController(gatewayFor([accepted], (signal) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))), store);
    const running = controller.run(input());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await controller.run(input())).toMatchObject({ ok: false, error: "already_active" });
    expect(controller.cancel()).toBe(true);
    expect(await running).toMatchObject({ ok: true, turn: { status: "interrupted", interruption: { reason: "user_cancelled" } } });
    expect(committed).toBeTruthy();
  });

  it("rebases a retryable revision conflict without rerunning the gateway", async () => {
    let attempts = 0;
    const store = storeWith(async () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, failure: { code: "revision_conflict", retryable: true } } : { ok: true, value: { disposition: "committed", record: record("r3") } };
    }, async () => ({ ok: true, value: record("r2") }));
    const controller = new TurnController(gatewayFor([accepted, terminal]), store);
    const result = await controller.run(input());
    expect(result).toMatchObject({ ok: true, disposition: "committed", record: { revision: "r3" } });
    expect(attempts).toBe(2);
  });

  it("retains the exact candidate for retryable storage failure and blocks permanent failure", async () => {
    let available = false;
    const store = storeWith(async () => available ? { ok: true, value: { disposition: "committed", record: record("r2") } } : { ok: false, failure: { code: "storage_unavailable", retryable: true } });
    const controller = new TurnController(gatewayFor([accepted, terminal]), store);
    const first = await controller.run(input());
    expect(first).toMatchObject({ ok: false, error: "commit_retryable", candidate: { id: turnId } });
    available = true;
    expect(await controller.retryCommit()).toMatchObject({ ok: true, turn: { id: turnId } });
    const blocked = new TurnController(gatewayFor([accepted, terminal]), storeWith(async () => ({ ok: false, failure: { code: "integrity_failure", retryable: false } })));
    expect(await blocked.run(input())).toMatchObject({ ok: false, error: "commit_blocked", candidate: { id: turnId } });
  });
});
