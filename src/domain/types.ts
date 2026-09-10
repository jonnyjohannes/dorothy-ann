export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type ThreadId = Brand<string, "ThreadId">; export type TurnId = Brand<string, "TurnId">; export type MessageId = Brand<string, "MessageId">; export type ResearchRunId = Brand<string, "ResearchRunId">; export type SourceId = Brand<string, "SourceId">; export type ArtifactDraftId = Brand<string, "ArtifactDraftId">; export type IsoTimestamp = Brand<string, "IsoTimestamp">;
export type TurnStatus = "pending" | "running" | "completed" | "failed" | "interrupted";
export type TurnMode = "chat" | "research";
export type AssistantContentPart = { type: "text"; markdown: string } | { type: "citation"; sourceId: SourceId };
export interface AssistantContent { parts: AssistantContentPart[] }
export interface UserMessage { id: MessageId; role: "user"; content: string; createdAt: IsoTimestamp }
export interface UsageMetadata { inputTokens?: number; outputTokens?: number; searches?: number; extractedPages?: number; estimatedCostUsd?: number }
export interface AssistantMessage { id: MessageId; role: "assistant"; content: AssistantContent; createdAt: IsoTimestamp; usage?: UsageMetadata }
export interface SearchResult { sourceId: SourceId; rank: number; title: string; url: string; canonicalUrl: string; displayUrl: string; snippet?: string; publishedAt?: IsoTimestamp }
export interface ExtractedPage { sourceId: SourceId; canonicalUrl: string; title?: string; text: string; extractedAt: IsoTimestamp; characterCount: number }
export type ExtractionOutcome = { sourceId: SourceId; status: "viable"; page: ExtractedPage } | { sourceId: SourceId; status: "skipped"; reason: "duplicate" | "unsafe_url" | "blocked" | "unsupported_content" | "empty_content" | "limit_reached" } | { sourceId: SourceId; status: "failed"; code: "fetch_failed" | "timeout" | "extract_failed"; retryable: boolean };
export interface ContextEvidence { source: SearchResult; page: ExtractedPage }
export interface EvidencePack { query: string; sources: ContextEvidence[]; createdAt: IsoTimestamp }
export type ResearchRunStatus = "searching" | "extracting" | "ready" | "partial" | "insufficient_evidence" | "synthesizing" | "completed" | "failed" | "interrupted";
export interface ResearchRun { id: ResearchRunId; origin: "search" | "promoted_lookup"; status: ResearchRunStatus; queries: string[]; lookupId?: string; targetViablePages: number; sources: SearchResult[]; extractions: ExtractionOutcome[]; evidenceSourceIds: SourceId[]; startedAt: IsoTimestamp; updatedAt: IsoTimestamp; completedAt?: IsoTimestamp; failure?: TurnFailure }
export interface TurnFailure { stage: "search" | "extraction" | "synthesis" | "chat" | "report"; code: string; message: string; retryable: boolean; occurredAt: IsoTimestamp }
export interface Turn { id: TurnId; mode: TurnMode; status: TurnStatus; createdAt: IsoTimestamp; updatedAt: IsoTimestamp; userMessage: UserMessage; assistantMessage?: AssistantMessage; lookupResults?: SearchResult[]; researchRun?: ResearchRun; failure?: TurnFailure }
export interface Thread { schemaVersion: 1 | 2; id: ThreadId; title: string; createdAt: IsoTimestamp; updatedAt: IsoTimestamp; modelRef: string; searchRef: string; turns: Turn[] }
export type ThreadSaveReason = "created" | "query_started" | "lookup_completed" | "research_stage" | "turn_completed" | "turn_failed" | "turn_interrupted" | "renamed";
export interface ThreadCommit { thread: Thread; reason: ThreadSaveReason; requestId?: string; committedAt: IsoTimestamp }
export interface StoredThreadEnvelopeV2 { schemaVersion: 2; thread: Thread; lastMeaningfulActivityAt: IsoTimestamp; expiresAt: IsoTimestamp }
export interface ThreadSummary { id: ThreadId; title: string; createdAt: IsoTimestamp; updatedAt: IsoTimestamp; lastTurnPreview?: string }
export interface ArtifactDraft { schemaVersion: 1; id: ArtifactDraftId; threadId: ThreadId; sourceKey: string; format: "dorothy_ann_report" | "transcript"; scope: "answer" | "topic"; turnId?: TurnId; markdown: string; sourceUpdatedAt: IsoTimestamp; dirty: boolean; createdAt: IsoTimestamp; updatedAt: IsoTimestamp }
export interface ExportArtifact { format: "dorothy_ann_report" | "transcript"; scope: "answer" | "topic"; filename: string; mimeType: "text/markdown"; markdown: string; generatedAt: IsoTimestamp; sourceUpdatedAt: IsoTimestamp }
