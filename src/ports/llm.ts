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
} from "../domain/model-v3.js";

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

export interface ResearchAssessmentInput {
  systemPrompt: string;
  problem: ResearchProblem;
  knowledge: ResearchKnowledge;
  ledger: GapLedger;
  budget: ResearchBudget;
  allowedSupportRefs: SupportRef[];
  maxOutputTokens: number;
}

export interface ResearchSynthesisInput {
  systemPrompt: string;
  question: string;
  context: ThreadContext;
  resolution: SufficientResearchResolution | BestEffortResearchResolution;
  allowedSourceIds: SourceId[];
  maxOutputTokens: number;
}

export interface LLMProvider {
  assessResearch(input: ResearchAssessmentInput): Promise<ResearchAssessmentProposal>;
  synthesizeResearch(input: ResearchSynthesisInput): AsyncIterable<AssistantContentPart>;
}
