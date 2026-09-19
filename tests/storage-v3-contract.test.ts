// @vitest-environment node

import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { commitTerminalTurn } from "../src/application/commit-terminal-turn";
import { IdentityPolicy } from "../src/application/identity-policy";
import type { CanonicalSource, SearchTurn, ThreadId, Turn } from "../src/domain/types";
import { threadV3Schema } from "../src/domain/schemas";
import { WebCryptoIdentityHasher } from "../src/infrastructure/identity/web-crypto-hasher";
import type { CommitTerminalTurnInput, StoredThreadRecord, ThreadRevision, ThreadStoreResult, CommitTerminalTurnValue } from "../src/ports/storage-v3";

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const at = (day: number) => `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`;

class InMemoryTerminalCommitHarness {
  record: StoredThreadRecord | null = null;
  deleted = false;
  private revision = 0;
  constructor(readonly identities = new IdentityPolicy(new WebCryptoIdentityHasher(webcrypto.subtle as unknown as SubtleCrypto))) {}
  async commit(input: CommitTerminalTurnInput): Promise<ThreadStoreResult<CommitTerminalTurnValue>> {
    const result = await commitTerminalTurn({ record: this.record, deleted: this.deleted }, input, {
      identities: this.identities,
      nextRevision: () => `revision-${++this.revision}` as ThreadRevision,
    });
    if (result.ok && result.value.disposition === "committed") this.record = result.value.record;
    return result;
  }
  remove() { this.record = null; this.deleted = true; }
}

async function source(identities: IdentityPolicy, url = "https://example.com/a", title = "First title"): Promise<CanonicalSource> {
  return { sourceId: await identities.sourceId(url), title, url, canonicalUrl: url, displayUrl: new URL(url).hostname };
}
function searchTurn(id: number, sourceRecord?: CanonicalSource, createdDay = 1): SearchTurn {
  return {
    id: uuid(id) as never,
    kind: "search",
    status: "completed",
    createdAt: at(createdDay) as never,
    finishedAt: at(createdDay + 1) as never,
    userMessage: { id: uuid(id + 100) as never, role: "user", content: `query ${id}`, createdAt: at(createdDay) as never },
    execution: { kind: "recorded", searchRef: "brave" },
    result: sourceRecord ? { completion: "results", destinations: [{ sourceId: sourceRecord.sourceId, rank: 1 }] } : { completion: "empty", destinations: [] },
  };
}
function createInput(threadId: ThreadId, turn: Turn, sourceRecords: CanonicalSource[] = []): CommitTerminalTurnInput {
  return { threadId, expectedRevision: null, create: { id: threadId, title: "Topic", createdAt: turn.createdAt }, sourceRecords, turn };
}

async function committedHarness() {
  const harness = new InMemoryTerminalCommitHarness();
  const threadId = uuid(900) as ThreadId;
  const sourceRecord = await source(harness.identities);
  const turn = searchTurn(1, sourceRecord);
  const result = await harness.commit(createInput(threadId, turn, [sourceRecord]));
  if (!result.ok) throw new Error(result.failure.code);
  return { harness, threadId, sourceRecord, turn, result };
}

describe("v3 terminal commit contract", () => {
  it("atomically creates the first terminal turn, sources, revision, and expiry", async () => {
    const { harness, result, sourceRecord } = await committedHarness();
    expect(result.value).toMatchObject({ disposition: "committed", record: { recordVersion: 1, revision: "revision-1", expiresAt: at(9) } });
    expect(harness.record?.thread).toMatchObject({ schemaVersion: 3, legacyArchive: [], sources: [{ ...sourceRecord, ordinal: 1 }] });
  });

  it("returns same-turn idempotency before stale revision/create checks", async () => {
    const { harness, threadId, sourceRecord, turn, result } = await committedHarness();
    const retry = await harness.commit(createInput(threadId, turn, [sourceRecord]));
    expect(retry).toEqual({ ok: true, value: { disposition: "already_committed", record: result.value.record } });
    expect(harness.record?.revision).toBe("revision-1");
  });

  it("rejects stale revisions and same-ID different turns", async () => {
    const { harness, threadId, turn } = await committedHarness();
    const stale = await harness.commit({ threadId, expectedRevision: "stale" as ThreadRevision, sourceRecords: [], turn: searchTurn(2) });
    expect(stale).toEqual({ ok: false, failure: { code: "revision_conflict", retryable: true } });
    const collision = await harness.commit({ threadId, expectedRevision: harness.record!.revision, sourceRecords: [], turn: { ...turn, userMessage: { ...turn.userMessage, content: "different" } } });
    expect(collision).toEqual({ ok: false, failure: { code: "integrity_failure", retryable: false } });
  });

  it("inserts raced turns by createdAt/id without decreasing durable activity", async () => {
    const harness = new InMemoryTerminalCommitHarness();
    const threadId = uuid(901) as ThreadId;
    await harness.commit(createInput(threadId, searchTurn(5, undefined, 5)));
    const result = await harness.commit({ threadId, expectedRevision: harness.record!.revision, sourceRecords: [], turn: searchTurn(2, undefined, 2) });
    expect(result.ok && result.value.record.thread.turns.map((turn) => turn.id)).toEqual([uuid(2), uuid(5)]);
    expect(result.ok && result.value.record.thread.updatedAt).toBe(at(6));
    expect(result.ok && result.value.record.expiresAt).toBe(at(13));
  });

  it("preserves first-admission metadata and rejects source identity collisions", async () => {
    const { harness, threadId, sourceRecord } = await committedHarness();
    const later = { ...sourceRecord, title: "Later title" };
    expect(threadV3Schema.safeParse(harness.record!.thread).success).toBe(true);
    expect(await harness.identities.sourceId(later.canonicalUrl)).toBe(later.sourceId);
    const reused = await harness.commit({ threadId, expectedRevision: harness.record!.revision, sourceRecords: [later], turn: searchTurn(2, later, 3) });
    if (!reused.ok) throw new Error(reused.failure.code);
    expect(reused.ok && reused.value.record.thread.sources[0].title).toBe("First title");

    const collision = { ...sourceRecord, canonicalUrl: "https://example.com/other", url: "https://example.com/other" };
    const rejected = await harness.commit({ threadId, expectedRevision: harness.record!.revision, sourceRecords: [collision], turn: searchTurn(3, collision, 5) });
    expect(rejected).toEqual({ ok: false, failure: { code: "integrity_failure", retryable: false } });
  });

  it("requires a matching seed for first-terminal creation", async () => {
    const harness = new InMemoryTerminalCommitHarness();
    const threadId = uuid(905) as ThreadId;
    expect(await harness.commit({ threadId, expectedRevision: null, sourceRecords: [], turn: searchTurn(1) })).toEqual({ ok: false, failure: { code: "thread_not_found", retryable: false } });
    expect(await harness.commit({ ...createInput(threadId, searchTurn(1)), create: { id: uuid(906) as ThreadId, title: "Wrong", createdAt: at(1) as never } })).toEqual({ ok: false, failure: { code: "thread_not_found", retryable: false } });
  });

  it("rejects missing, duplicate, and unreferenced supplied sources", async () => {
    const harness = new InMemoryTerminalCommitHarness();
    const threadId = uuid(902) as ThreadId;
    const sourceRecord = await source(harness.identities);
    expect(await harness.commit(createInput(threadId, searchTurn(1, sourceRecord)))).toEqual({ ok: false, failure: { code: "invalid_record", retryable: false } });
    expect(await harness.commit(createInput(threadId, searchTurn(1), [sourceRecord]))).toEqual({ ok: false, failure: { code: "invalid_record", retryable: false } });
    expect(await harness.commit(createInput(threadId, searchTurn(1, sourceRecord), [sourceRecord, sourceRecord]))).toEqual({ ok: false, failure: { code: "invalid_record", retryable: false } });
  });

  it("creates failed first attempts and blocks deleted thread recreation", async () => {
    const harness = new InMemoryTerminalCommitHarness();
    const threadId = uuid(903) as ThreadId;
    const completed = searchTurn(1);
    const base = { ...completed } as Partial<typeof completed>;
    delete base.result;
    const failed = { ...base, status: "failed" as const, failure: { code: "search_failed" as const, message: "Search failed.", retryable: true } };
    expect((await harness.commit(createInput(threadId, failed))).ok).toBe(true);
    harness.remove();
    expect(await harness.commit(createInput(threadId, searchTurn(2)))).toEqual({ ok: false, failure: { code: "thread_deleted", retryable: false } });
  });

  it("preserves an existing read-only archive while committing a new turn", async () => {
    const harness = new InMemoryTerminalCommitHarness();
    const threadId = uuid(904) as ThreadId;
    const archiveId = await harness.identities.legacyArchiveEntryId({ threadId, originalIndex: 0 });
    const legacyArchive = [{ id: archiveId, originalIndex: 0, legacyKind: "chat" as const, legacyStatus: "completed" as const, createdAt: at(1) as never, finishedAt: at(1) as never, request: "old", answerMarkdown: "old answer", destinations: [] }];
    harness.record = {
      recordVersion: 1,
      revision: "revision-import" as ThreadRevision,
      expiresAt: at(8) as never,
      thread: { schemaVersion: 3, id: threadId, title: "Legacy", createdAt: at(1) as never, updatedAt: at(1) as never, sources: [], turns: [], legacyArchive },
    };
    const result = await harness.commit({ threadId, expectedRevision: harness.record.revision, sourceRecords: [], turn: searchTurn(2, undefined, 2) });
    expect(result.ok && result.value.record.thread.legacyArchive).toEqual(legacyArchive);
  });
});
