import type { ThreadId, ThreadSummary } from "../../domain/model-v3";
import type { BoxIntent } from "../boxes/box-types";

export interface PreferenceStore { read(key: string): string | null; write(key: string, value: string): Promise<void> }
export function createSettingsController(store: PreferenceStore, apply: (key: string, value: string) => void) {
  return async (intent: Extract<BoxIntent, { type: "preference_changed" }>) => {
    apply(intent.key, intent.value);
    try { await store.write(intent.key, intent.value); return "saved" as const; } catch { return "session_only" as const; }
  };
}
export interface ThreadListPort { list(): Promise<ThreadSummary[]>; remove(id: ThreadId): Promise<void> }
export function createThreadListController(port: ThreadListPort, emit: (intent: BoxIntent) => void) {
  return { load: () => port.list(), delete: async (id: ThreadId) => { await port.remove(id); emit({ type: "thread_delete_requested", threadId: id }); } };
}
export function createAuthController(authenticate: (passphrase: string) => Promise<boolean>, emit: (intent: BoxIntent) => void) {
  let busy = false;
  return async (intent: Extract<BoxIntent, { type: "passphrase_submitted" }>) => {
    if (busy) return false;
    busy = true;
    try { const accepted = await authenticate(intent.passphrase); if (!accepted) emit({ type: "retry_requested" }); return accepted; } finally { busy = false; }
  };
}
export type SystemStatus = "ready" | "checking" | "unavailable";
export async function checkSystemStatus(check: () => Promise<boolean>): Promise<SystemStatus> { try { return await check() ? "ready" : "unavailable"; } catch { return "unavailable"; } }
