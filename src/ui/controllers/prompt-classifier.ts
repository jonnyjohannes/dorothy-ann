import type { SearchResultKind } from "../../domain/types";

export type PromptSubmission =
  | { kind: "research"; value: string }
  | { kind: "search"; resultKind: SearchResultKind; query: string };

const commands: Record<string, SearchResultKind> = { "/link": "link", "/image": "image", "/video": "video" };

/** Classifies raw PromptBox and prompt-URL input through one command grammar. */
export function classifyPromptInput(value: string): PromptSubmission | { kind: "invalid"; message: string } {
  const normalized = value.trim();
  if (!normalized) return { kind: "invalid", message: "A prompt is required." };
  const match = normalized.match(/^(\/[^\s]+)(?:\s+([\s\S]*))?$/u);
  if (!match) return { kind: "research", value: normalized };
  const resultKind = commands[match[1]];
  if (!resultKind) return { kind: "invalid", message: `Unknown command: ${match[1]}` };
  const query = match[2]?.trim() ?? "";
  return query ? { kind: "search", resultKind, query } : { kind: "invalid", message: `Usage: ${match[1]} <query>` };
}
