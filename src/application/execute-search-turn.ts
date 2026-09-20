import type {
  SourceRecord,
  IsoTimestamp,
  SearchTurn,
  SearchResultKind,
  TurnInterruption,
  UserMessage,
} from "../domain/types.js";
import type { SearchOptions, SearchProvider } from "../ports/providers.js";
import type { SearchResult } from "../domain/types.js";

export interface SearchTurnExecutionInput {
  turnId: SearchTurn["id"];
  userMessage: UserMessage;
  createdAt: IsoTimestamp;
  searchRef?: string;
  provider: SearchProvider;
  maxResults?: number;
  resultKind?: SearchResultKind;
  finishedAt?: () => IsoTimestamp;
  signal?: AbortSignal;
  interruptionReason?: TurnInterruption["reason"];
}

export interface SearchTurnExecutionResult {
  turn: SearchTurn;
  sources: SourceRecord[];
}

function timestamp(input: SearchTurnExecutionInput): IsoTimestamp {
  return (input.finishedAt?.() ?? new Date().toISOString()) as IsoTimestamp;
}

function execution(input: SearchTurnExecutionInput): SearchTurn["execution"] {
  return input.searchRef ? { kind: "recorded", searchRef: input.searchRef } : { kind: "unavailable" };
}

function interruption(input: SearchTurnExecutionInput, message = "Search was interrupted."): SearchTurn {
  return {
    id: input.turnId,
    kind: "search",
    status: "interrupted",
    execution: execution(input),
    createdAt: input.createdAt,
    finishedAt: timestamp(input),
    userMessage: input.userMessage,
    interruption: {
      reason: input.interruptionReason ?? "user_cancelled",
      message,
    },
  };
}

function failureCode(error: unknown): "provider_unavailable" | "invalid_response" | "search_failed" | "rate_limited" {
  const value = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : error instanceof Error ? error.message : "";
  if (value === "rate_limited" || value === "provider_rate_limited") return "rate_limited";
  if (value === "invalid_response") return "invalid_response";
  if (value === "provider_unavailable") return "provider_unavailable";
  return "search_failed";
}

function normalizedResults(raw: unknown, maxResults: number, resultKind: SearchResultKind): SearchResult[] {
  if (!Array.isArray(raw)) throw new Error("invalid_response");
  const ids = new Set<string>();
  const urls = new Set<string>();
  const results: SearchResult[] = [];
  for (const value of raw) {
    if (results.length >= maxResults || !value || typeof value !== "object") continue;
    const result = value as Partial<SearchResult>;
    if (typeof result.sourceId !== "string" || typeof result.title !== "string" || typeof result.url !== "string" || typeof result.canonicalUrl !== "string") {
      throw new Error("invalid_response");
    }
    if (resultKind === "link" ? result.kind !== undefined && result.kind !== "link" : result.kind !== resultKind) throw new Error("invalid_response");
    const candidate = result as Partial<SearchResult> & { imageUrl?: unknown; videoUrl?: unknown; sourcePageUrl?: unknown };
    if (resultKind === "image" && (typeof candidate.imageUrl !== "string" || typeof candidate.sourcePageUrl !== "undefined" && typeof candidate.sourcePageUrl !== "string")) throw new Error("invalid_response");
    if (resultKind === "video" && (typeof candidate.videoUrl !== "string" || typeof candidate.sourcePageUrl !== "undefined" && typeof candidate.sourcePageUrl !== "string")) throw new Error("invalid_response");
    if (ids.has(result.sourceId) || urls.has(result.canonicalUrl)) continue;
    const rank = result.rank;
    if (typeof rank !== "number" || !Number.isSafeInteger(rank) || rank <= 0) throw new Error("invalid_response");
    ids.add(result.sourceId);
    urls.add(result.canonicalUrl);
    results.push({ ...result, kind: resultKind, rank } as SearchResult);
  }
  return results.sort((left, right) => left.rank - right.rank || left.sourceId.localeCompare(right.sourceId));
}

/** Executes exactly one provider search and never invokes extraction or an LLM. */
export async function executeSearchTurn(input: SearchTurnExecutionInput): Promise<SearchTurnExecutionResult> {
  const maxResults = Math.max(1, Math.min(5, input.maxResults ?? 5));
  if (input.signal?.aborted) return { turn: interruption(input, "Search was interrupted before it started."), sources: [] };
  try {
    const resultKind = input.resultKind ?? "link";
    const options: SearchOptions = { maxResults, resultKind };
    const raw = await input.provider.search(input.userMessage.content, options);
    if (input.signal?.aborted) return { turn: interruption(input), sources: [] };
    const results = normalizedResults(raw, maxResults, resultKind);
    const finishedAt = timestamp(input);
    const turn: SearchTurn = results.length > 0
      ? {
          id: input.turnId,
          kind: "search",
          status: "completed",
          execution: execution(input),
          createdAt: input.createdAt,
          finishedAt,
          userMessage: input.userMessage,
          result: {
            completion: "results",
            resultKind,
            destinations: results.map(({ sourceId, rank }) => ({ sourceId, rank })) as [{ sourceId: SearchResult["sourceId"]; rank: number }, ...{ sourceId: SearchResult["sourceId"]; rank: number }[]],
          },
        }
      : {
          id: input.turnId,
          kind: "search",
          status: "completed",
          execution: execution(input),
          createdAt: input.createdAt,
          finishedAt,
          userMessage: input.userMessage,
          result: { completion: "empty", resultKind, destinations: [] },
        };
    return { turn, sources: results.map((source) => {
      const record = { ...source } as Record<string, unknown>;
      delete record.rank;
      return record as SourceRecord;
    }) };
  } catch (error) {
    if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { turn: interruption(input), sources: [] };
    }
    const code = failureCode(error);
    const failed: SearchTurn = {
      id: input.turnId,
      kind: "search",
      status: "failed",
      execution: execution(input),
      createdAt: input.createdAt,
      finishedAt: timestamp(input),
      userMessage: input.userMessage,
      failure: {
        code,
        message: code === "rate_limited" ? "Search provider rate limited the request." : "Search provider failed to return usable results.",
        retryable: true,
      },
    };
    return { turn: failed, sources: [] };
  }
}
