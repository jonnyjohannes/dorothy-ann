import type { ArtifactDraft, Thread, ThreadSummary } from "../domain/types";

export interface ThreadBackup { backupVersion: 1; exportedAt: string; threads: Array<{ schemaVersion: 1; thread: Thread }> }
export interface ImportIssue { threadId?: string; code: "invalid_backup" | "unsupported_version" | "invalid_thread"; message: string }
export interface ImportPreview { add: number; conflicts: number; skippedInvalid: number; issues: ImportIssue[] }
export interface ImportReport extends ImportPreview { added: string[]; replaced: string[]; skipped: string[] }
export interface ThreadStore { list(): Promise<ThreadSummary[]>; load(threadId: string): Promise<Thread | null>; save(thread: Thread): Promise<void>; remove(threadId: string): Promise<void>; exportData(threadIds?: string[]): Promise<ThreadBackup>; inspectImport(backup: ThreadBackup): Promise<ImportPreview>; importData(backup: ThreadBackup, options: { onConflict: "skip" | "replace" }): Promise<ImportReport> }
export interface ArtifactDraftStore { loadBySourceKey(sourceKey: string): Promise<ArtifactDraft | null>; save(draft: ArtifactDraft): Promise<void>; remove(draftId: string): Promise<void> }
