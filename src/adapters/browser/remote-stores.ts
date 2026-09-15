import { isDurableThread, isValidThread } from "../../domain/thread-state";
import { threadBackupSchema, threadSchema } from "../../domain/schemas";
import type { Thread, ThreadCommit, ThreadSummary } from "../../domain/types";
import type { ImportPreview, ImportReport, ThreadBackup, ThreadStore } from "../../ports/storage";

const MAX_RESPONSE_BYTES = 2_000_000;

export class StorageConflictError extends Error {
  constructor() { super("storage_conflict"); this.name = "StorageConflictError"; }
}

async function jsonResponse(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
  try { return JSON.parse(text); } catch { throw new Error("malformed_response"); }
}

export class RemoteThreadStore implements ThreadStore {
  private readonly revisions = new Map<string, number>();
  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    let body: unknown = null;
    try { body = response.status === 204 ? null : await jsonResponse(response); }
    catch (error) { if (response.ok) throw error; }
    if (response.status === 409) throw new StorageConflictError();
    if (!response.ok) throw new Error(typeof body === "object" && body && "error" in body && typeof body.error === "object" && body.error && "code" in body.error ? String(body.error.code) : `http_${response.status}`);
    return body;
  }
  async list(): Promise<ThreadSummary[]> {
    const body = await this.request("/api/threads") as { summaries?: unknown };
    if (!body || !Array.isArray(body.summaries)) throw new Error("malformed_response");
    return body.summaries as ThreadSummary[];
  }
  async load(threadId: string): Promise<Thread | null> { const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}`, { credentials: "same-origin", cache: "no-store" }); const body = await jsonResponse(response) as { thread?: unknown; revision?: unknown }; if (response.status === 404) return null; if (!response.ok) throw new Error("storage_error"); if (!body || !threadSchema.safeParse(body.thread).success || typeof body.revision !== "number") throw new Error("malformed_response"); this.revisions.set(threadId, body.revision); return body.thread as Thread; }
  async save(thread: Thread, activityAt?: string): Promise<void> { await this.commit({ thread, reason: "created", committedAt: (activityAt ?? new Date().toISOString()) as ThreadCommit["committedAt"] }); }
  async commit(input: ThreadCommit): Promise<Thread> { if (!isDurableThread(input.thread)) throw new Error("invalid_completed_thread"); const expectedRevision = this.revisions.get(input.thread.id) ?? 0; const body = await this.request(`/api/threads/${encodeURIComponent(input.thread.id)}`, { method: "PUT", body: JSON.stringify({ ...input, expectedRevision }) }) as { thread?: unknown; revision?: unknown }; if (!body || !isValidThread(body.thread) || typeof body.revision !== "number") throw new Error("malformed_response"); this.revisions.set(input.thread.id, body.revision); return body.thread; }
  async remove(threadId: string): Promise<void> { await this.request(`/api/threads/${encodeURIComponent(threadId)}`, { method: "DELETE" }); this.revisions.delete(threadId); }
  async exportData(threadIds?: string[]): Promise<ThreadBackup> { const query = threadIds?.length ? `?ids=${encodeURIComponent(threadIds.join(","))}` : ""; const body = await this.request(`/api/threads/export${query}`); const parsed = threadBackupSchema.safeParse(body); if (!parsed.success) throw new Error("malformed_response"); return parsed.data as ThreadBackup; }
  async inspectImport(backup: ThreadBackup): Promise<ImportPreview> { const response = await this.request("/api/threads/import/preview", { method: "POST", body: JSON.stringify({ backup }) }); return response as ImportPreview; }
  async importData(backup: ThreadBackup, options: { onConflict: "skip" | "replace" }): Promise<ImportReport> { const response = await this.request("/api/threads/import", { method: "POST", body: JSON.stringify({ backup, onConflict: options.onConflict }) }); return response as ImportReport; }
}
