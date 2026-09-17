import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { IdentityPolicy } from "../../application/identity-policy.js";
import type { ThreadId } from "../../domain/model-v3.js";
import { WebCryptoIdentityHasher } from "../identity/web-crypto-hasher.js";
import type { StoredThreadRecord, ThreadRevision } from "../../ports/storage-v3.js";
import { ThreadStoreBase, type PersistedThreadState, type ThreadTombstone } from "../storage/thread-store-base.js";

interface DorothyAnnV3Db extends DBSchema {
  threads: { key: string; value: unknown };
  threadSummaries: { key: string; value: unknown; indexes: { "by-updated-at": string } };
  threadRecordsV3: { key: string; value: StoredThreadRecord };
  threadTombstonesV3: { key: string; value: ThreadTombstone };
  threadIndexV3: { key: string; value: { threadId: ThreadId; updatedAt: string }; indexes: { "by-updated-at": string } };
}
const DB_NAME = "dorothy-ann";
const DB_VERSION = 5;

export function openDorothyAnnV3Db(name = DB_NAME): Promise<IDBPDatabase<DorothyAnnV3Db>> {
  return openDB<DorothyAnnV3Db>(name, DB_VERSION, { upgrade(db) {
    if (!db.objectStoreNames.contains("threads")) db.createObjectStore("threads");
    if (!db.objectStoreNames.contains("threadSummaries")) db.createObjectStore("threadSummaries").createIndex("by-updated-at", "updatedAt");
    if (!db.objectStoreNames.contains("threadRecordsV3")) db.createObjectStore("threadRecordsV3");
    if (!db.objectStoreNames.contains("threadTombstonesV3")) db.createObjectStore("threadTombstonesV3");
    if (!db.objectStoreNames.contains("threadIndexV3")) {
      const index = db.createObjectStore("threadIndexV3");
      index.createIndex("by-updated-at", "updatedAt");
    }
  } });
}

export class IndexedDbThreadStore extends ThreadStoreBase {
  constructor(
    private readonly dbPromise = openDorothyAnnV3Db(),
    clock: () => Date = () => new Date(),
    identities = new IdentityPolicy(new WebCryptoIdentityHasher(crypto.subtle)),
    revisions: () => ThreadRevision = () => `revision_${crypto.randomUUID()}` as ThreadRevision,
  ) { super(identities, clock, revisions); }

  protected async readState(threadId: ThreadId): Promise<PersistedThreadState> {
    const db = await this.dbPromise;
    let tx = db.transaction(["threadRecordsV3", "threadTombstonesV3"], "readonly");
    let [record, tombstone] = await Promise.all([tx.objectStore("threadRecordsV3").get(threadId), tx.objectStore("threadTombstonesV3").get(threadId)]);
    await tx.done;
    if (!record && !tombstone && await this.migrateLegacy(threadId)) {
      tx = db.transaction(["threadRecordsV3", "threadTombstonesV3"], "readonly");
      [record, tombstone] = await Promise.all([tx.objectStore("threadRecordsV3").get(threadId), tx.objectStore("threadTombstonesV3").get(threadId)]);
      await tx.done;
    }
    return { record: record ?? null, tombstone: tombstone ?? null };
  }

  protected async listIds(): Promise<ThreadId[]> {
    const db = await this.dbPromise;
    for (const key of await db.getAllKeys("threads")) await this.migrateLegacy(key as ThreadId);
    return (await db.getAllKeys("threadIndexV3")) as ThreadId[];
  }

  private async migrateLegacy(threadId: ThreadId): Promise<boolean> {
    const db = await this.dbPromise;
    const legacy = await db.get("threads", threadId);
    if (!legacy) return false;
    const converted = await this.convertLegacyStoredRecord(legacy);
    if (!converted) return false;
    const tx = db.transaction(["threads", "threadSummaries", "threadRecordsV3", "threadTombstonesV3", "threadIndexV3"], "readwrite");
    const [currentLegacy, currentV3, tombstone] = await Promise.all([tx.objectStore("threads").get(threadId), tx.objectStore("threadRecordsV3").get(threadId), tx.objectStore("threadTombstonesV3").get(threadId)]);
    if (currentV3 || tombstone || JSON.stringify(currentLegacy) !== JSON.stringify(legacy)) { await tx.done; return Boolean(currentV3); }
    await tx.objectStore("threadRecordsV3").put(converted, threadId);
    await tx.objectStore("threadIndexV3").put({ threadId, updatedAt: converted.thread.updatedAt }, threadId);
    await tx.objectStore("threads").delete(threadId);
    await tx.objectStore("threadSummaries").delete(threadId);
    await tx.done;
    return true;
  }

  protected async writeRecord(threadId: ThreadId, expectedRevision: ThreadRevision | null, record: StoredThreadRecord, clearTombstone: boolean): Promise<boolean> {
    const db = await this.dbPromise;
    const tx = db.transaction(["threadRecordsV3", "threadTombstonesV3", "threadIndexV3"], "readwrite");
    const records = tx.objectStore("threadRecordsV3");
    const tombstones = tx.objectStore("threadTombstonesV3");
    const [current, tombstone] = await Promise.all([records.get(threadId), tombstones.get(threadId)]);
    if ((current?.revision ?? null) !== expectedRevision || (tombstone && !clearTombstone)) { await tx.done; return false; }
    await records.put(record, threadId);
    if (clearTombstone) await tombstones.delete(threadId);
    await tx.objectStore("threadIndexV3").put({ threadId, updatedAt: record.thread.updatedAt }, threadId);
    await tx.done;
    return true;
  }

  protected async writeTombstone(threadId: ThreadId, expectedRevision: ThreadRevision, tombstone: ThreadTombstone): Promise<boolean> {
    const db = await this.dbPromise;
    const tx = db.transaction(["threadRecordsV3", "threadTombstonesV3", "threadIndexV3"], "readwrite");
    const records = tx.objectStore("threadRecordsV3");
    const current = await records.get(threadId);
    if (current?.revision !== expectedRevision) { await tx.done; return false; }
    await records.delete(threadId);
    await tx.objectStore("threadTombstonesV3").put(tombstone, threadId);
    await tx.objectStore("threadIndexV3").put({ threadId, updatedAt: tombstone.deletedAt }, threadId);
    await tx.done;
    return true;
  }

  protected async purge(threadId: ThreadId): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(["threadRecordsV3", "threadTombstonesV3", "threadIndexV3"], "readwrite");
    await Promise.all([tx.objectStore("threadRecordsV3").delete(threadId), tx.objectStore("threadTombstonesV3").delete(threadId), tx.objectStore("threadIndexV3").delete(threadId)]);
    await tx.done;
  }
}
