import type { PromptSuggestion, RankedPromptSuggestion } from "../prompt-types";
import type { ThreadSummary } from "../../domain/types";
import { rankFuzzyCandidates } from "./fuzzy";

export interface RankedThreadSummary {
  thread: ThreadSummary;
  titlePositions: number[];
  previewPositions: number[];
}

export type { PromptSuggestion, RankedPromptSuggestion } from "../prompt-types";

function compareDatesDescending<T extends { updatedAt: string; id: string }>(a: T, b: T): number {
  const dateOrder = b.updatedAt.localeCompare(a.updatedAt);
  return dateOrder || a.id.localeCompare(b.id);
}

/** Match the title first, then the latest request preview, without exposing fzf. */
export function rankThreads(
  threads: readonly ThreadSummary[],
  query: string,
): RankedThreadSummary[] {
  if (query.length === 0) {
    return [...threads].sort(compareDatesDescending).map((thread) => ({
      thread,
      titlePositions: [],
      previewPositions: [],
    }));
  }

  const candidates = threads.map((thread) => ({
    id: String(thread.id),
    searchText: `${thread.title}\u0000${thread.lastRequestPreview ?? ""}`,
  }));
  const byId = new Map(threads.map((thread) => [String(thread.id), thread]));
  return rankFuzzyCandidates(candidates, query).flatMap((match) => {
    const thread = byId.get(match.id);
    if (!thread) return [];
    const titleLength = thread.title.length;
    return [{
      thread,
      titlePositions: match.positions.filter((position) => position < titleLength),
      previewPositions: match.positions
        .filter((position) => position > titleLength)
        .map((position) => position - titleLength - 1),
    }];
  });
}

/** The declared command registry order is retained for empty/equal matches. */
export function rankPromptSuggestions(
  suggestions: readonly PromptSuggestion[],
  query: string,
): RankedPromptSuggestion[] {
  if (query.length === 0) {
    return suggestions.map((suggestion) => ({
      suggestion,
      commandPositions: [],
      descriptionPositions: [],
    }));
  }

  const candidates = suggestions.map((suggestion) => ({
    id: suggestion.id,
    searchText: `${suggestion.command}\u0000${suggestion.description}\u0000${suggestion.aliases.join(" ")}`,
  }));
  const byId = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));
  return rankFuzzyCandidates(candidates, query).flatMap((match) => {
    const suggestion = byId.get(match.id);
    if (!suggestion) return [];
    const commandLength = suggestion.command.length;
    const descriptionStart = commandLength + 1;
    return [{
      suggestion,
      commandPositions: match.positions.filter((position) => position < commandLength),
      descriptionPositions: match.positions
        .filter((position) => position >= descriptionStart && position < descriptionStart + suggestion.description.length)
        .map((position) => position - descriptionStart),
    }];
  });
}
