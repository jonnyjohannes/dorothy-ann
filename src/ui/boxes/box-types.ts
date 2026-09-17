import type {
  CanonicalSource,
  LegacyArchiveEntry,
  Thread,
  ThreadId,
  ThreadSummary,
  Turn,
} from "../../domain/types";

export type BoxIntent =
  | { type: "new_thread_requested" }
  | { type: "prompt_submitted"; value: string }
  | { type: "command_requested"; command: string }
  | { type: "source_open_requested"; sourceId: string }
  | { type: "thread_open_requested"; threadId: ThreadId }
  | { type: "thread_delete_requested"; threadId: ThreadId }
  | { type: "preference_changed"; key: string; value: string }
  | { type: "passphrase_submitted"; passphrase: string }
  | { type: "retry_requested" }
  | { type: "route_escape_requested" };

export interface TranscriptItem {
  kind: "turn" | "legacy";
  id: string;
  createdAt: string;
  request: string;
  markdown?: string;
  status?: string;
  legacy?: LegacyArchiveEntry;
  turn?: Turn;
}

export interface ThreadViewState {
  thread: Thread;
  sources: CanonicalSource[];
}

export interface ThreadsViewState {
  threads: ThreadSummary[];
  activeThreadId?: ThreadId;
  loading?: boolean;
  error?: string;
}
