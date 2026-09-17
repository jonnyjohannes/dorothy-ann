import type { Thread, Turn } from "../../domain/model-v3";
import type { ThreadSummary } from "../../domain/model-v3";
import type { TranscriptItem } from "./box-types";

export function rankThreads(threads: ThreadSummary[], query: string): ThreadSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  return [...threads].filter((thread) => !needle || `${thread.title} ${thread.lastRequestPreview ?? ""}`.toLocaleLowerCase().includes(needle)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
function turnMarkdown(turn: Turn): string | undefined {
  if (turn.kind !== "research" || turn.status !== "completed") return undefined;
  return turn.result.answer.parts.map((part) => part.type === "text" ? part.markdown : `[[cite:${part.sourceId}]]`).join("");
}
export function transcriptItems(thread: Thread): TranscriptItem[] {
  const turns = thread.turns.map((turn) => ({ kind: "turn" as const, id: String(turn.id), createdAt: String(turn.createdAt), request: turn.userMessage.content, markdown: turnMarkdown(turn), status: turn.status, turn }));
  const archive = thread.legacyArchive.map((entry) => ({ kind: "legacy" as const, id: String(entry.id), createdAt: String(entry.createdAt), request: entry.request, markdown: entry.answerMarkdown, status: entry.statusMessage, legacy: entry }));
  return [...turns, ...archive].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
