import type { CanonicalSource, IsoTimestamp, Thread, ThreadId, ThreadSummary, Turn } from "../domain/types.js";

export type ThreadRevision = string & { readonly __brand: "ThreadRevision" };

export interface StoredThreadRecord {
  recordVersion: 1;
  revision: ThreadRevision;
  expiresAt: IsoTimestamp;
  thread: Thread;
}

export interface NewThreadSeed {
  id: ThreadId;
  title: string;
  createdAt: IsoTimestamp;
}

export interface CommitTerminalTurnInput {
  threadId: ThreadId;
  expectedRevision: ThreadRevision | null;
  create?: NewThreadSeed;
  sourceRecords: CanonicalSource[];
  turn: Turn;
}

export type CommitTerminalTurnValue = {
  disposition: "committed" | "already_committed";
  record: StoredThreadRecord;
};

export type ThreadStoreFailure =
  | { code: "revision_conflict" | "storage_unavailable" | "quota_exceeded"; retryable: true }
  | { code: "thread_not_found" | "thread_deleted" | "invalid_record" | "integrity_failure"; retryable: false };

export type ThreadStoreResult<T> = { ok: true; value: T } | { ok: false; failure: ThreadStoreFailure };

export interface StoredThreadSummary {
  summary: ThreadSummary;
  revision: ThreadRevision;
}

export interface RemoveThreadInput {
  threadId: ThreadId;
  expectedRevision?: ThreadRevision;
}

export interface ThreadBackup {
  backupVersion: 3;
  exportedAt: IsoTimestamp;
  threads: Array<{ thread: Thread; expiresAt: IsoTimestamp }>;
}

export interface ImportIssueSummary {
  threadId?: ThreadId;
  code: "unsupported_version" | "invalid_thread" | "invalid_source" | "legacy_incomplete_dropped" | "legacy_entry_dropped" | "legacy_destination_dropped";
  message: string;
}

export interface ImportPreview {
  add: number;
  conflicts: number;
  skippedInvalid: number;
  archivedLegacyEntries: number;
  droppedLegacyEntries: number;
  issues: ImportIssueSummary[];
}

export interface ImportReport {
  added: ThreadId[];
  replaced: ThreadId[];
  skipped: ThreadId[];
  skippedInvalid: number;
  archivedLegacyEntries: number;
  droppedLegacyEntries: number;
}

export type ValidatedImportCandidate = string & { readonly __brand: "ValidatedImportCandidate" };
export interface InspectedThreadImport { preview: ImportPreview; candidate: ValidatedImportCandidate }

export interface ThreadStore {
  list(): Promise<ThreadStoreResult<StoredThreadSummary[]>>;
  load(threadId: ThreadId): Promise<ThreadStoreResult<StoredThreadRecord | null>>;
  commitTerminalTurn(input: CommitTerminalTurnInput): Promise<ThreadStoreResult<CommitTerminalTurnValue>>;
  remove(input: RemoveThreadInput): Promise<ThreadStoreResult<"removed" | "already_absent">>;
  exportData(threadIds?: ThreadId[]): Promise<ThreadStoreResult<ThreadBackup>>;
  inspectImport(value: unknown): Promise<ThreadStoreResult<InspectedThreadImport>>;
  importData(candidate: ValidatedImportCandidate, options: { onConflict: "keep_existing" | "replace_existing" }): Promise<ThreadStoreResult<ImportReport>>;
}
