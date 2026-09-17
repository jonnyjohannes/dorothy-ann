export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ThreadId = Brand<string, "ThreadId">;
export type TurnId = Brand<string, "TurnId">;
export type MessageId = Brand<string, "MessageId">;
export type ExecutionId = Brand<string, "ExecutionId">;
export type SourceId = Brand<string, "SourceId">;
export type LegacyArchiveEntryId = Brand<string, "LegacyArchiveEntryId">;
export type ResearchProblemId = Brand<string, "ResearchProblemId">;
export type ResearchGapId = Brand<string, "ResearchGapId">;
export type PropositionKey = Brand<string, "PropositionKey">;
export type ObservationId = Brand<string, "ObservationId">;
export type IsoTimestamp = Brand<string, "IsoTimestamp">;

export type AssistantContentPart =
  | { type: "text"; markdown: string }
  | { type: "citation"; sourceId: SourceId };
export interface AssistantContent { parts: AssistantContentPart[] }
export interface UserMessage {
  id: MessageId;
  role: "user";
  content: string;
  createdAt: IsoTimestamp;
}
export interface UsageMetadata {
  inputTokens?: number;
  outputTokens?: number;
  searches?: number;
  extractedPages?: number;
  estimatedCostUsd?: number;
}

export interface CanonicalSource {
  sourceId: SourceId;
  title: string;
  url: string;
  canonicalUrl: string;
  displayUrl: string;
  snippet?: string;
  publishedAt?: IsoTimestamp;
}
export interface SearchResult extends CanonicalSource { rank: number }
export interface ThreadSourceRecord extends CanonicalSource { ordinal: number }

export interface ExtractedPageSnapshot {
  text: string;
  extractedAt: IsoTimestamp;
  characterCount: number;
}
export interface ContextEvidence {
  sourceId: SourceId;
  page: ExtractedPageSnapshot;
}
export interface EvidencePack {
  problemId: ResearchProblemId;
  requestOrder: number;
  query: string;
  sources: ContextEvidence[];
  createdAt: IsoTimestamp;
}

export type SupportRef =
  | { type: "turn"; turnId: TurnId }
  | { type: "source"; sourceId: SourceId };
export interface SupportedObservation {
  id: ObservationId;
  propositionKey: PropositionKey;
  statement: string;
  stance: "supports" | "contradicts" | "qualifies";
  support: SupportRef[];
}
export interface SupportedFinding {
  propositionKey: PropositionKey;
  proposition: string;
  observations: SupportedObservation[];
  status: "supported" | "contested" | "insufficient";
}
export interface KnowledgeUnit {
  problemId: ResearchProblemId;
  findings: SupportedFinding[];
  evidence: EvidencePack[];
  unresolvedGapIds: ResearchGapId[];
}

export type ThreadContextTurn =
  | { turnId: TurnId; kind: "research"; request: string; outcome: "sufficient" | "best_effort"; answer: AssistantContent }
  | { turnId: TurnId; kind: "search"; request: string; outcome: "search" }
  | { turnId: TurnId; kind: "research"; request: string; outcome: "insufficient" }
  | { turnId: TurnId; kind: TurnKind; request: string; outcome: "failed" | "interrupted" };
export interface ThreadContext {
  threadId: ThreadId;
  turns: ThreadContextTurn[];
  knownSources: CanonicalSource[];
  availableEvidence: EvidencePack[];
}

export interface ResearchProblem {
  id: ResearchProblemId;
  parentId?: ResearchProblemId;
  question: string;
  purpose: string;
  successCriterion: string;
  context: ThreadContext;
  depth: number;
}
export interface ResearchBudget {
  searchesRemaining: number;
  sourcesRemaining: number;
  assessmentsRemaining: number;
  depthRemaining: number;
}
export interface ResearchGap {
  id: ResearchGapId;
  problem: ResearchProblem;
  operatorFromParent?: "all" | "any";
  status: "open" | "decomposed" | "resolved" | "blocked";
  support: SupportRef[];
  fingerprint: string;
  createdOrder: number;
}
export interface GapLedger {
  gaps: ResearchGap[];
  assessmentsUsed: number;
  searchesUsed: number;
  sourcesConsumed: number;
}
export type ResolutionStopReason =
  | "sufficient"
  | "search_budget_exhausted"
  | "source_budget_exhausted"
  | "assessment_budget_exhausted"
  | "depth_limit_reached"
  | "no_new_knowledge"
  | "duplicate_problem"
  | "provider_unavailable";
export interface ResearchEvidenceRef { sourceId: SourceId; rank: number }
export interface ResearchTaskRecord {
  problemId: ResearchProblemId;
  query: string;
  purpose: string;
  priority: 1 | 2 | 3;
  status: "completed" | "partial" | "failed";
  evidence: ResearchEvidenceRef[];
}
export interface ResearchResolutionBase {
  knowledge: KnowledgeUnit;
  ledger: GapLedger;
  tasks: ResearchTaskRecord[];
}
export interface SufficientResearchResolution extends ResearchResolutionBase {
  status: "sufficient";
  stopReason: "sufficient";
}
export interface BestEffortResearchResolution extends ResearchResolutionBase {
  status: "best_effort";
  stopReason: Exclude<ResolutionStopReason, "sufficient">;
}
export interface InsufficientResearchResolution extends ResearchResolutionBase {
  status: "insufficient";
  stopReason: Exclude<ResolutionStopReason, "sufficient">;
}
export type ResearchResolution = SufficientResearchResolution | BestEffortResearchResolution | InsufficientResearchResolution;
export interface ResearchCheckpoint {
  reason: "interrupted" | "execution_failure";
  knowledge: KnowledgeUnit;
  ledger: GapLedger;
  tasks: ResearchTaskRecord[];
}

export type TurnKind = "search" | "research";
export interface TerminalTurnBase<K extends TurnKind> {
  id: TurnId;
  kind: K;
  retryOfTurnId?: TurnId;
  createdAt: IsoTimestamp;
  finishedAt: IsoTimestamp;
  userMessage: UserMessage;
}
export interface SearchExecutionProvenance { kind: "recorded"; searchRef: string }
export interface ResearchExecutionProvenance {
  kind: "recorded";
  assessmentModelRef: string;
  synthesisModelRef: string;
  searchRef: string;
}
export interface UnavailableExecutionProvenance { kind: "unavailable" }
export interface SearchDestinationRef { sourceId: SourceId; rank: number }
export type SearchTurnResult =
  | { completion: "results"; destinations: [SearchDestinationRef, ...SearchDestinationRef[]] }
  | { completion: "empty"; destinations: [] };
export type SearchTurnFailure =
  | { code: "provider_unavailable" | "invalid_response" | "search_failed"; message: string; retryable: boolean }
  | { code: "rate_limited"; message: string; retryable: true; retryAfterSeconds?: number };
export interface TurnInterruption {
  reason: "user_cancelled" | "navigation" | "connection_lost";
  message: string;
}
type SearchTerminalBase = TerminalTurnBase<"search"> & { execution: SearchExecutionProvenance | UnavailableExecutionProvenance };
export type SearchTurn =
  | (SearchTerminalBase & { status: "completed"; result: SearchTurnResult })
  | (SearchTerminalBase & { status: "failed"; failure: SearchTurnFailure })
  | (SearchTerminalBase & { status: "interrupted"; interruption: TurnInterruption });

export type ResearchTurnResult =
  | { completion: "sufficient"; answer: AssistantContent; resolution: SufficientResearchResolution; usage?: UsageMetadata }
  | { completion: "best_effort"; answer: AssistantContent; resolution: BestEffortResearchResolution; usage?: UsageMetadata };
export interface InsufficientEvidenceFailure { kind: "insufficient_evidence"; message: string; retryable: true }
export type SynthesisFailure =
  | { kind: "synthesis_failure"; code: "unavailable" | "invalid_output"; message: string; retryable: true }
  | { kind: "synthesis_failure"; code: "rate_limited"; message: string; retryable: true; retryAfterSeconds?: number }
  | { kind: "synthesis_failure"; code: "refused"; message: string; retryable: false };
export type ResearchExecutionFailure =
  | { kind: "execution_failure"; stage: "assessment"; code: "assessment_failed"; message: string; retryable: true }
  | { kind: "execution_failure"; stage: "acquisition"; code: "acquisition_failed"; message: string; retryable: true }
  | { kind: "execution_failure"; stage: "resolution"; code: "resolution_invalid"; message: string; retryable: false }
  | { kind: "execution_failure"; stage: "transport"; code: "transport_failed"; message: string; retryable: true };
export type IncompleteResearchState =
  | { kind: "checkpoint"; checkpoint: ResearchCheckpoint }
  | { kind: "unavailable" };
export type InterruptedResearchState =
  | { kind: "resolution"; resolution: SufficientResearchResolution | BestEffortResearchResolution }
  | IncompleteResearchState;
type ResearchTerminalBase = TerminalTurnBase<"research"> & { execution: ResearchExecutionProvenance | UnavailableExecutionProvenance };
export type CompletedResearchTurn = ResearchTerminalBase & { status: "completed"; result: ResearchTurnResult };
export type FailedResearchTurn =
  | (ResearchTerminalBase & { status: "failed"; failure: InsufficientEvidenceFailure; researchState: { kind: "resolution"; resolution: InsufficientResearchResolution } })
  | (ResearchTerminalBase & { status: "failed"; failure: SynthesisFailure; researchState: { kind: "resolution"; resolution: SufficientResearchResolution | BestEffortResearchResolution } })
  | (ResearchTerminalBase & { status: "failed"; failure: ResearchExecutionFailure; researchState: IncompleteResearchState });
export type InterruptedResearchTurn = ResearchTerminalBase & { status: "interrupted"; interruption: TurnInterruption; researchState: InterruptedResearchState };
export type ResearchTurn = CompletedResearchTurn | FailedResearchTurn | InterruptedResearchTurn;
export type Turn = SearchTurn | ResearchTurn;

export interface LegacyArchiveDestinationRef {
  sourceId: SourceId;
  rank: number;
  legacyCitationId?: string;
}
export interface LegacyArchiveEntry {
  id: LegacyArchiveEntryId;
  originalIndex: number;
  legacyKind: "chat" | "research";
  legacyStatus: "completed" | "failed" | "interrupted";
  createdAt: IsoTimestamp;
  finishedAt: IsoTimestamp;
  request: string;
  answerMarkdown?: string;
  statusMessage?: string;
  destinations: LegacyArchiveDestinationRef[];
}
export interface Thread {
  schemaVersion: 3;
  id: ThreadId;
  title: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  sources: ThreadSourceRecord[];
  turns: Turn[];
  legacyArchive: LegacyArchiveEntry[];
}
export interface ThreadSummary {
  id: ThreadId;
  title: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  lastRequestPreview?: string;
  turnCount: number;
  legacyArchiveCount: number;
}
