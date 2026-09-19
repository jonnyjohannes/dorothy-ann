import { byLengthAsc, byStartAsc, extendedMatch, Fzf } from "fzf";

/** Project-owned fuzzy values; the fzf result types never cross this boundary. */
export interface FuzzyCandidate<TId extends string> {
  id: TId;
  searchText: string;
}

export interface FuzzyMatch<TId extends string> {
  id: TId;
  score: number;
  positions: number[];
}

/**
 * The one fzf integration point. Keep the package configuration here so
 * callers depend only on the small, stable project-owned result contract.
 */
export function rankFuzzyCandidates<TId extends string>(
  candidates: readonly FuzzyCandidate<TId>[],
  query: string,
): FuzzyMatch<TId>[] {
  if (candidates.length === 0) return [];
  if (query.length === 0) {
    return candidates.map((candidate) => ({ id: candidate.id, score: 0, positions: [] }));
  }

  const matcher = new Fzf([...candidates], {
    selector: (candidate) => candidate.searchText,
    match: extendedMatch,
    fuzzy: "v2",
    casing: "smart-case",
    normalize: true,
    tiebreakers: [byLengthAsc, byStartAsc],
    sort: true,
    forward: true,
    limit: Number.POSITIVE_INFINITY,
  });

  return matcher.find(query).map((result) => ({
    id: result.item.id,
    score: result.score,
    positions: [...result.positions].sort((a, b) => a - b),
  }));
}
