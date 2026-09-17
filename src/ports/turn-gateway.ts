import type {
  CanonicalSource,
  ExecutionId,
  ResearchCheckpoint,
  ResearchResolution,
  ThreadContext,
  TurnId,
  TurnKind,
} from "../domain/model-v3.js";
export interface TurnGatewaySearchRequest {
  executionId: ExecutionId;
  turnId: TurnId;
  kind: "search";
  query: string;
}
export interface TurnGatewayResearchRequest {
  executionId: ExecutionId;
  turnId: TurnId;
  kind: "research";
  question: string;
  context: ThreadContext;
}
export type TurnGatewayRequest = TurnGatewaySearchRequest | TurnGatewayResearchRequest;

export interface TurnGatewayResearchLimits {
  maxCandidatesPerSearch?: number;
  maxSourcesPerRequest?: number;
  extractionConcurrency?: number;
  extractionMaxCharacters?: number;
  extractionTimeoutMs?: number;
  maxSearchResults?: number;
  maxConcurrentSearches?: number;
  maxConcurrentExtractions?: number;
  maxExtractedCharsPerPage?: number;
}
export interface TurnGatewayOptions {
  maxResults: number;
  researchLimits: TurnGatewayResearchLimits;
}

export type TurnGatewayPhase = "searching" | "assessing" | "decomposing" | "extracting" | "resolving" | "synthesizing";
export interface TurnGatewaySourceOccurrence {
  sourceId: CanonicalSource["sourceId"];
  role: "search_destination" | "research_evidence";
  rank?: number;
}
export type TurnGatewayEvent =
  | { executionId: ExecutionId; turnId: TurnId; sequence: number; type: "accepted"; kind: TurnKind }
  | { executionId: ExecutionId; turnId: TurnId; sequence: number; type: "phase"; phase: TurnGatewayPhase }
  | { executionId: ExecutionId; turnId: TurnId; sequence: number; type: "source_delta"; sources: CanonicalSource[]; occurrences: TurnGatewaySourceOccurrence[] }
  | { executionId: ExecutionId; turnId: TurnId; sequence: number; type: "research_state"; state: { kind: "checkpoint"; checkpoint: ResearchCheckpoint } | { kind: "resolution"; resolution: ResearchResolution } }
  | { executionId: ExecutionId; turnId: TurnId; sequence: number; type: "answer_delta"; delta: string }
  | { executionId: ExecutionId; turnId: TurnId; sequence: number; type: "terminal"; terminal: TurnGatewayTerminal };

export type TurnGatewayTerminal =
  | {
      kind: "search";
      outcome: Omit<import("../domain/model-v3.js").SearchTurn, "id" | "kind" | "createdAt" | "finishedAt" | "userMessage">;
      sourceRecords: CanonicalSource[];
    }
  | {
      kind: "research";
      outcome: Omit<import("../domain/model-v3.js").ResearchTurn, "id" | "kind" | "createdAt" | "finishedAt" | "userMessage">;
      sourceRecords: CanonicalSource[];
    };

export interface TurnGateway {
  stream(request: TurnGatewayRequest, options: TurnGatewayOptions, signal: AbortSignal): AsyncIterable<TurnGatewayEvent>;
}
