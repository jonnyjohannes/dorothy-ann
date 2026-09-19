import type {
  CanonicalSource,
  IsoTimestamp,
  ResearchCheckpoint,
  ResearchResolution,
  ResearchTurn,
  ThreadContext,
  TurnInterruption,
  UserMessage,
  InterruptedResearchState,
} from "../domain/types.js";
import type { AnswerSynthesizer } from "./answer-synthesizer.js";
import { collectResearchStateSourceIds } from "./commit-terminal-turn.js";

export type ResearchResolutionResult = (ResearchResolution & {
  /** Canonical metadata admitted during acquisition, used for reference closure. */
  sources?: CanonicalSource[];
}) | { checkpoint: ResearchCheckpoint; sources?: CanonicalSource[] };

export interface ResearchResolverInput {
  turnId: ResearchTurn["id"];
  question: string;
  userMessage: UserMessage;
  context: ThreadContext;
  signal?: AbortSignal;
}

export interface ResearchResolver {
  resolve(input: ResearchResolverInput): Promise<ResearchResolutionResult>;
}

export interface ResearchTurnExecutionInput {
  turnId: ResearchTurn["id"];
  userMessage: UserMessage;
  createdAt: IsoTimestamp;
  context: ThreadContext;
  answerPosition: "initial" | "follow_up";
  resolver: ResearchResolver;
  synthesizer: Pick<AnswerSynthesizer, "synthesize">;
  assessmentModelRef: string;
  synthesisModelRef: string;
  searchRef: string;
  finishedAt?: () => IsoTimestamp;
  signal?: AbortSignal;
  interruptionReason?: TurnInterruption["reason"];
}

export interface ResearchTurnExecutionResult {
  turn: ResearchTurn;
  sources: CanonicalSource[];
}

type ResearchExecution = Extract<ResearchTurn["execution"], { kind: "recorded" }>;

function timestamp(input: ResearchTurnExecutionInput): IsoTimestamp {
  return (input.finishedAt?.() ?? new Date().toISOString()) as IsoTimestamp;
}

function execution(input: ResearchTurnExecutionInput): ResearchExecution {
  return {
    kind: "recorded",
    assessmentModelRef: input.assessmentModelRef,
    synthesisModelRef: input.synthesisModelRef,
    searchRef: input.searchRef,
  };
}

function interrupted(
  input: ResearchTurnExecutionInput,
  researchState: InterruptedResearchState,
  message: string,
): ResearchTurn {
  return {
    id: input.turnId,
    kind: "research",
    status: "interrupted",
    execution: execution(input),
    createdAt: input.createdAt,
    finishedAt: timestamp(input),
    userMessage: input.userMessage,
    interruption: {
      reason: input.interruptionReason ?? "user_cancelled",
      message,
    },
    researchState,
  };
}

function safeCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error ? error.message : "";
}

function sourceRecords(context: ThreadContext, admitted: CanonicalSource[] = []): CanonicalSource[] {
  const byId = new Map<string, CanonicalSource>();
  for (const source of context.knownSources) byId.set(source.sourceId, source);
  for (const source of admitted) byId.set(source.sourceId, source);
  return [...byId.values()];
}

function sourceClosure(
  state: ResearchResolution | ResearchCheckpoint,
  context: ThreadContext,
): CanonicalSource[] {
  const byId = new Map<string, CanonicalSource>();
  for (const source of sourceRecords(context, state.sources)) byId.set(source.sourceId, source);
  for (const source of state.sources ?? []) {
    const previous = byId.get(source.sourceId);
    if (previous && previous.canonicalUrl !== source.canonicalUrl) throw new Error("source_reference_conflict");
    byId.set(source.sourceId, source);
  }
  const required = collectResearchStateSourceIds(state);
  for (const sourceId of required) if (!byId.has(sourceId)) throw new Error("source_reference_missing");
  return [...required].map((sourceId) => byId.get(sourceId)!).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function failureStage(error: unknown): "assessment" | "acquisition" | "resolution" | "transport" {
  const value = safeCode(error);
  if (value === "assessment_failed" || value === "assessment_unavailable") return "assessment";
  if (value === "acquisition_failed" || value === "search_unavailable" || value === "extraction_failed") return "acquisition";
  if (value === "transport_failed") return "transport";
  return "resolution";
}
function failureMessage(stage: "assessment" | "acquisition" | "resolution" | "transport"): string {
  if (stage === "assessment") return "Research assessment was unavailable or invalid.";
  if (stage === "acquisition") return "Research could not acquire usable evidence.";
  if (stage === "transport") return "Research lost its provider connection.";
  return "Research resolution stopped before a validated answer was available.";
}

/** Resolves once and, only for a sufficient/best-effort root, synthesizes once. */
export async function executeResearchTurn(input: ResearchTurnExecutionInput): Promise<ResearchTurnExecutionResult> {
  if (input.signal?.aborted) {
    return {
      turn: interrupted(input, { kind: "unavailable" }, "Research was interrupted before it started."),
      sources: [],
    };
  }

  let resolution: ResearchResolutionResult;
  try {
    resolution = await input.resolver.resolve({
      turnId: input.turnId,
      question: input.userMessage.content,
      userMessage: input.userMessage,
      context: input.context,
      signal: input.signal,
    });
    if ("checkpoint" in resolution) {
      return {
        turn: {
          id: input.turnId,
          kind: "research",
          status: "failed",
          execution: execution(input),
          createdAt: input.createdAt,
          finishedAt: timestamp(input),
          userMessage: input.userMessage,
          failure: { kind: "execution_failure", stage: "resolution", code: "resolution_invalid", message: "Research execution stopped before a validated answer was available.", retryable: false },
          researchState: { kind: "checkpoint", checkpoint: resolution.checkpoint },
        },
        sources: sourceClosure(resolution.checkpoint, input.context),
      };
    }
    if (input.signal?.aborted) {
      const state = resolution.status === "sufficient" || resolution.status === "best_effort"
        ? { kind: "resolution" as const, resolution }
        : { kind: "unavailable" as const };
      return { turn: interrupted(input, state, "Research was interrupted."), sources: [] };
    }
    if (resolution.status === "insufficient") {
      return {
        turn: {
          id: input.turnId,
          kind: "research",
          status: "failed",
          execution: execution(input),
          createdAt: input.createdAt,
          finishedAt: timestamp(input),
          userMessage: input.userMessage,
          failure: { kind: "insufficient_evidence", message: "The available evidence was insufficient to answer this question.", retryable: true },
          researchState: { kind: "resolution", resolution },
        },
        sources: sourceClosure(resolution, input.context),
      };
    }
  } catch (error) {
    if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { turn: interrupted(input, { kind: "unavailable" }, "Research was interrupted."), sources: [] };
    }
    const stage = failureStage(error);
    const turn: ResearchTurn = {
      id: input.turnId,
      kind: "research",
      status: "failed",
      execution: execution(input),
      createdAt: input.createdAt,
      finishedAt: timestamp(input),
      userMessage: input.userMessage,
      failure: {
        kind: "execution_failure",
        stage,
        code: stage === "resolution" ? "resolution_invalid" : `${stage}_failed` as "assessment_failed" | "acquisition_failed" | "transport_failed",
        message: failureMessage(stage),
        retryable: stage !== "resolution",
      },
      researchState: { kind: "unavailable" },
    } as ResearchTurn;
    return { turn, sources: [] };
  }

  let sources: CanonicalSource[];
  try {
    sources = sourceClosure(resolution, input.context);
  } catch {
    const failed: ResearchTurn = {
      id: input.turnId,
      kind: "research",
      status: "failed",
      execution: execution(input),
      createdAt: input.createdAt,
      finishedAt: timestamp(input),
      userMessage: input.userMessage,
      failure: { kind: "execution_failure", stage: "resolution", code: "resolution_invalid", message: "Research produced an invalid source reference.", retryable: false },
      researchState: { kind: "unavailable" },
    };
    return { turn: failed, sources: [] };
  }

  try {
    // This is the sole root synthesis call. Child resolution never receives a
    // synthesizer and therefore cannot create child answers or turns.
    const answer = await input.synthesizer.synthesize({
      question: input.userMessage.content,
      answerPosition: input.answerPosition,
      context: input.context,
      resolution,
      signal: input.signal,
    });
    if (input.signal?.aborted) {
      return { turn: interrupted(input, { kind: "resolution", resolution }, "Research was interrupted."), sources };
    }
    const result = resolution.status === "sufficient"
      ? { completion: "sufficient" as const, answer, resolution }
      : { completion: "best_effort" as const, answer, resolution };
    return {
      turn: {
        id: input.turnId,
        kind: "research",
        status: "completed",
        execution: execution(input),
        createdAt: input.createdAt,
        finishedAt: timestamp(input),
        userMessage: input.userMessage,
        result,
      },
      sources,
    };
  } catch (error) {
    if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { turn: interrupted(input, { kind: "resolution", resolution }, "Research was interrupted."), sources };
    }
    const code = safeCode(error);
    const synthesisCode: "unavailable" | "invalid_output" | "rate_limited" | "refused" = code === "rate_limited"
      ? "rate_limited"
      : code === "refused"
        ? "refused"
        : code === "synthesis_empty"
          ? "invalid_output"
          : "unavailable";
    const failed: ResearchTurn = {
      id: input.turnId,
      kind: "research",
      status: "failed",
      execution: execution(input),
      createdAt: input.createdAt,
      finishedAt: timestamp(input),
      userMessage: input.userMessage,
      failure: synthesisCode === "refused"
        ? { kind: "synthesis_failure", code: synthesisCode, message: "The answer was refused.", retryable: false }
        : synthesisCode === "rate_limited"
          ? { kind: "synthesis_failure", code: synthesisCode, message: "Synthesis provider rate limited the request.", retryable: true }
          : { kind: "synthesis_failure", code: synthesisCode, message: "The answer could not be synthesized from the validated research.", retryable: true },
      researchState: { kind: "resolution", resolution },
    };
    return { turn: failed, sources };
  }
}
