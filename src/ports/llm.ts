import type {
  AssistantContentPart,
  BestEffortResearchResolution,
  GapLedger,
  KnowledgeUnit,
  ResearchBudget,
  ResearchProblem,
  SourceId,
  SupportRef,
  SufficientResearchResolution,
  ThreadContext,
} from "../domain/types.js";

export interface ResearchProblemProposal {
  question: string;
  purpose: string;
  successCriterion: string;
  priority: 1 | 2 | 3;
}

export interface ObservationProposal {
  proposition: string;
  statement: string;
  stance: "supports" | "contradicts" | "qualifies";
  support: SupportRef[];
}

export type ResearchDirectiveProposal =
  | { kind: "resolved"; observations: ObservationProposal[] }
  | { kind: "search"; query: string; purpose: string; successCriterion: string; priority: 1 | 2 | 3 }
  | { kind: "decompose"; operator: "all" | "any"; problems: ResearchProblemProposal[] };

/** Untrusted output returned by an LLM. IDs, ledger state, and evidence are application-owned. */
export interface ResearchAssessmentProposal {
  directive: ResearchDirectiveProposal;
}

/** The knowledge shape supplied to assessment; kept as a named port concept. */
export type ResearchKnowledge = KnowledgeUnit;

/** Optional per-attempt operational measurement; never carries prompt or provider output. */
export interface AssessmentAttemptObservation {
  attempt: 1 | 2;
  elapsedMs: number;
  parseMs: number;
  inputChars: number;
  maxOutputTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  stopReason: "end_turn" | "max_tokens" | "refusal" | "other" | "unknown";
  outcome: "accepted" | "rejected" | "failed";
  reason?: "empty_response" | "invalid_json" | "missing_directive" | "unknown_directive" | "invalid_search_query" | "invalid_resolved" | "invalid_decomposition" | "provider_error";
}

export interface ResearchAssessmentInput {
  systemPrompt: string;
  problem: ResearchProblem;
  knowledge: ResearchKnowledge;
  ledger: GapLedger;
  budget: ResearchBudget;
  allowedSupportRefs: SupportRef[];
  maxOutputTokens: number;
  signal?: AbortSignal;
  onAttempt?: (observation: AssessmentAttemptObservation) => void;
}

export interface ResearchSynthesisInput {
  systemPrompt: string;
  question: string;
  answerPosition: "initial" | "follow_up";
  context: ThreadContext;
  resolution: SufficientResearchResolution | BestEffortResearchResolution;
  allowedSourceIds: SourceId[];
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface LLMProvider {
  assessResearch(input: ResearchAssessmentInput): Promise<ResearchAssessmentProposal>;
  synthesizeResearch(input: ResearchSynthesisInput): AsyncIterable<AssistantContentPart>;
}
