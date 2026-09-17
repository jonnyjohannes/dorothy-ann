import { threadV3Schema } from "../../domain/schemas-v3.js";
import type { ThreadId } from "../../domain/model-v3.js";
import type { CommitTerminalTurnInput, CommitTerminalTurnValue, ImportReport, InspectedThreadImport, RemoveThreadInput, StoredThreadRecord, StoredThreadSummary, ThreadBackup, ThreadStore, ThreadStoreFailure, ThreadStoreResult, ValidatedImportCandidate } from "../../ports/storage-v3.js";

const MAX_RESPONSE_BYTES = 2_000_000;
const failure = <T>(code: ThreadStoreFailure["code"]): ThreadStoreResult<T> => ({ ok: false, failure: code === "revision_conflict" || code === "storage_unavailable" || code === "quota_exceeded" ? { code, retryable: true } : { code, retryable: false } });
const codes = new Set<ThreadStoreFailure["code"]>(["revision_conflict", "storage_unavailable", "quota_exceeded", "thread_not_found", "thread_deleted", "invalid_record", "integrity_failure"]);

function strictKeys(value: object, allowed: string[]) { return Object.keys(value).every((key) => allowed.includes(key)); }
function validPreview(value: unknown): value is InspectedThreadImport["preview"] {
  if (!value || typeof value !== "object" || !strictKeys(value, ["add", "conflicts", "skippedInvalid", "archivedLegacyEntries", "droppedLegacyEntries", "issues"])) return false;
  const preview = value as InspectedThreadImport["preview"];
  return [preview.add, preview.conflicts, preview.skippedInvalid, preview.archivedLegacyEntries, preview.droppedLegacyEntries].every((count) => Number.isInteger(count) && count >= 0) && Array.isArray(preview.issues) && preview.issues.length <= 20;
}
function validReport(value: unknown): value is ImportReport {
  return Boolean(value && typeof value === "object" && strictKeys(value, ["added", "replaced", "skipped", "skippedInvalid", "archivedLegacyEntries", "droppedLegacyEntries"]) && Array.isArray((value as ImportReport).added) && Array.isArray((value as ImportReport).replaced) && Array.isArray((value as ImportReport).skipped));
}
function parseRecord(value: unknown): StoredThreadRecord | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<StoredThreadRecord>;
  if (record.recordVersion !== 1 || typeof record.revision !== "string" || !record.revision || typeof record.expiresAt !== "string" || !Number.isFinite(Date.parse(record.expiresAt)) || !threadV3Schema.safeParse(record.thread).success) return undefined;
  return record as StoredThreadRecord;
}

export class BrowserRemoteThreadStore implements ThreadStore {
  private readonly candidates = new Map<ValidatedImportCandidate, unknown>();
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly basePath = "/api/storage/threads") {}

  private async request<T>(path: string, init?: RequestInit): Promise<ThreadStoreResult<T>> {
    try {
      const response = await this.fetcher(`${this.basePath}${path}`, { ...init, credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
      const text = response.status === 204 ? "" : await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) return failure("storage_unavailable");
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { return failure("storage_unavailable"); }
      if (!response.ok) {
        const code = body && typeof body === "object" && "failure" in body && typeof body.failure === "object" && body.failure && "code" in body.failure ? String(body.failure.code) : "storage_unavailable";
        return failure(codes.has(code as ThreadStoreFailure["code"]) ? code as ThreadStoreFailure["code"] : "storage_unavailable");
      }
      return { ok: true, value: body as T };
    } catch { return failure("storage_unavailable"); }
  }

  async list(): Promise<ThreadStoreResult<StoredThreadSummary[]>> {
    const result = await this.request<unknown>("");
    if (!result.ok) return result;
    if (!Array.isArray(result.value) || result.value.some((item) => {
      if (!item || typeof item !== "object" || !strictKeys(item, ["summary", "revision"])) return true;
      const value = item as Partial<StoredThreadSummary>;
      const summary = value.summary;
      return typeof value.revision !== "string" || !summary || typeof summary !== "object" || !strictKeys(summary, ["id", "title", "createdAt", "updatedAt", "lastRequestPreview", "turnCount", "legacyArchiveCount"])
        || typeof summary.id !== "string" || typeof summary.title !== "string" || typeof summary.createdAt !== "string" || typeof summary.updatedAt !== "string" || typeof summary.turnCount !== "number" || typeof summary.legacyArchiveCount !== "number";
    })) return failure("storage_unavailable");
    return { ok: true, value: result.value as StoredThreadSummary[] };
  }
  async load(threadId: ThreadId): Promise<ThreadStoreResult<StoredThreadRecord | null>> {
    const result = await this.request<unknown>(`/${encodeURIComponent(threadId)}`);
    if (!result.ok) return result;
    const parsed = parseRecord(result.value);
    return parsed === undefined ? failure("storage_unavailable") : { ok: true, value: parsed };
  }
  async commitTerminalTurn(input: CommitTerminalTurnInput): Promise<ThreadStoreResult<CommitTerminalTurnValue>> {
    const result = await this.request<CommitTerminalTurnValue>(`/${encodeURIComponent(input.threadId)}/terminal`, { method: "POST", body: JSON.stringify(input) });
    if (!result.ok) return result;
    return (result.value.disposition === "committed" || result.value.disposition === "already_committed") && parseRecord(result.value.record) ? result : failure("storage_unavailable");
  }
  async remove(input: RemoveThreadInput): Promise<ThreadStoreResult<"removed" | "already_absent">> {
    const result = await this.request<unknown>(`/${encodeURIComponent(input.threadId)}`, { method: "DELETE", body: JSON.stringify({ expectedRevision: input.expectedRevision }) });
    return !result.ok ? result : result.value === "removed" || result.value === "already_absent" ? { ok: true, value: result.value } : failure("storage_unavailable");
  }
  async exportData(threadIds?: ThreadId[]): Promise<ThreadStoreResult<ThreadBackup>> {
    const result = await this.request<unknown>(`/export${threadIds?.length ? `?ids=${encodeURIComponent(threadIds.join(","))}` : ""}`);
    if (!result.ok) return result;
    const value = result.value;
    if (!value || typeof value !== "object" || !strictKeys(value, ["backupVersion", "exportedAt", "threads"])) return failure("storage_unavailable");
    const backup = value as Partial<ThreadBackup>;
    if (backup.backupVersion !== 3 || typeof backup.exportedAt !== "string" || !Array.isArray(backup.threads) || backup.threads.some((entry) => !entry || typeof entry !== "object" || !strictKeys(entry, ["thread", "expiresAt"]) || typeof entry.expiresAt !== "string" || !threadV3Schema.safeParse(entry.thread).success)) return failure("storage_unavailable");
    return { ok: true, value: backup as ThreadBackup };
  }
  async inspectImport(value: unknown): Promise<ThreadStoreResult<InspectedThreadImport>> {
    let body: string;
    try { body = JSON.stringify({ backup: value }); } catch { return failure("invalid_record"); }
    const result = await this.request<{ preview?: InspectedThreadImport["preview"] }>("/import/preview", { method: "POST", body });
    if (!result.ok) return result;
    if (!validPreview(result.value?.preview)) return failure("storage_unavailable");
    const candidate = `browser_import_${crypto.randomUUID()}` as ValidatedImportCandidate;
    this.candidates.set(candidate, value);
    return { ok: true, value: { preview: result.value.preview, candidate } };
  }
  async importData(candidate: ValidatedImportCandidate, options: { onConflict: "keep_existing" | "replace_existing" }): Promise<ThreadStoreResult<ImportReport>> {
    const backup = this.candidates.get(candidate);
    this.candidates.delete(candidate);
    if (backup === undefined) return failure("invalid_record");
    const result = await this.request<unknown>("/import", { method: "POST", body: JSON.stringify({ backup, onConflict: options.onConflict }) });
    return !result.ok ? result : validReport(result.value) ? { ok: true, value: result.value } : failure("storage_unavailable");
  }
}
