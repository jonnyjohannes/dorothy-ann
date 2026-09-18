import { collectTurnSourceIds } from "../../application/commit-terminal-turn.js";
import type {
  AssistantContent,
  CanonicalSource,
  ExecutionId,
  ResearchCheckpoint,
  ResearchResolution,
  ThreadContext,
  ThreadId,
  Turn,
  TurnId,
  UserMessage,
} from "../../domain/types.js";
import { turnV3Schema } from "../../domain/schemas.js";
import type { CommitTerminalTurnInput, StoredThreadRecord, ThreadRevision, ThreadStore, ThreadStoreFailure } from "../../ports/storage-v3.js";
import type { TurnGateway, TurnGatewayEvent, TurnGatewayOptions, TurnGatewayRequest } from "../../ports/turn-gateway.js";
import { isGatewayIdentity } from "../../infrastructure/browser/turn-gateway.js";

export interface TurnStartInput {
  threadId: ThreadId;
  turnId: TurnId;
  executionId: ExecutionId;
  kind: "search" | "research";
  request: string;
  userMessage: UserMessage;
  createdAt: UserMessage["createdAt"];
  expectedRevision: ThreadRevision | null;
  create?: CommitTerminalTurnInput["create"];
  context?: ThreadContext;
  gatewayOptions: TurnGatewayOptions;
}

export interface TurnControllerView {
  active: boolean;
  lastSequence: number;
  events: TurnGatewayEvent[];
  answerDraft: string;
  sources: CanonicalSource[];
  researchState?: { kind: "checkpoint"; checkpoint: ResearchCheckpoint } | { kind: "resolution"; resolution: ResearchResolution };
}

export type TurnControllerError =
  | "already_active"
  | "invalid_event"
  | "invalid_terminal"
  | "turn_error"
  | "commit_retryable"
  | "commit_blocked";

export type TurnControllerResult =
  | { ok: true; turn: Turn; record: StoredThreadRecord; disposition: "committed" | "already_committed" }
  | { ok: false; error: TurnControllerError; message?: string; failure?: ThreadStoreFailure; candidate?: Turn };

interface Candidate {
  input: TurnStartInput;
  turn: Turn;
  sourceRecords: CanonicalSource[];
}
interface ActiveRun {
  input: TurnStartInput;
  abort: AbortController;
  events: TurnGatewayEvent[];
  answerDraft: string;
  sources: Map<string, CanonicalSource>;
  researchState?: { kind: "checkpoint"; checkpoint: ResearchCheckpoint } | { kind: "resolution"; resolution: ResearchResolution };
  terminalSources?: CanonicalSource[];
  cancelled?: "user_cancelled" | "navigation";
}

function nowIso(): TurnStartInput["createdAt"] { return new Date().toISOString() as TurnStartInput["createdAt"]; }
function boundedMessage(message: string): string { return [...message].slice(0, 500).join("") || "Turn was interrupted."; }
function gatewayRequest(input: TurnStartInput): TurnGatewayRequest {
  if (input.kind === "search") return { executionId: input.executionId, turnId: input.turnId, kind: "search", query: input.request };
  if (!input.context) throw new Error("research context required");
  return { executionId: input.executionId, turnId: input.turnId, kind: "research", question: input.request, context: input.context };
}
function sourceClosure(turn: Turn, sources: CanonicalSource[]): boolean {
  const referenced = collectTurnSourceIds(turn);
  const supplied = new Set<string>(sources.map((source) => String(source.sourceId)));
  return supplied.size === sources.length && [...referenced].every((sourceId) => supplied.has(sourceId));
}

export class TurnController {
  private active?: ActiveRun;
  private pending?: Candidate;
  private readonly view: TurnControllerView = { active: false, lastSequence: 0, events: [], answerDraft: "", sources: [] };

  constructor(
    private readonly gateway: TurnGateway,
    private readonly store: ThreadStore,
    private readonly clock: () => TurnStartInput["createdAt"] = nowIso,
    private readonly onViewChange?: (view: TurnControllerView) => void,
  ) {}

  get snapshot(): TurnControllerView { return { ...this.view, events: [...this.view.events], sources: [...this.view.sources] }; }
  get pendingCandidate(): Turn | undefined { return this.pending?.turn; }

  async run(input: TurnStartInput): Promise<TurnControllerResult> {
    if (this.active) return { ok: false, error: "already_active" };
    const abort = new AbortController();
    const active: ActiveRun = { input, abort, events: [], answerDraft: "", sources: new Map() };
    this.active = active;
    this.view.active = true;
    this.view.lastSequence = 0;
    this.view.events = [];
    this.view.answerDraft = "";
    this.view.sources = [];
    this.view.researchState = undefined;
    this.emit();
    let terminal: Turn | undefined;
    let protocolError: TurnControllerError | undefined;
    let protocolMessage: string | undefined;
    try {
      for await (const event of this.gateway.stream(gatewayRequest(input), input.gatewayOptions, abort.signal)) {
        const accepted = this.acceptEvent(active, event);
        if (!accepted.ok) { protocolError = accepted.error; protocolMessage = accepted.message; abort.abort(); break; }
        this.emit();
        if (event.type === "terminal") {
          const candidate = this.buildTerminal(active, event);
          if (!candidate) { protocolError = "invalid_terminal"; abort.abort(); break; }
          terminal = candidate;
          break;
        }
      }
    } catch {
      if (!active.cancelled && !protocolError) return this.finishInterruption(active, "connection_lost");
    }
    if (protocolError) return this.finishWithoutCommit(active, protocolError, protocolMessage);
    if (terminal) return this.finishWithCommit({ input, turn: terminal, sourceRecords: this.sourcesForTerminal(active, terminal) });
    return this.finishInterruption(active, active.cancelled ?? "connection_lost");
  }

  cancel(reason: "user_cancelled" | "navigation" = "user_cancelled"): boolean {
    if (!this.active) return false;
    this.active.cancelled = reason;
    this.active.abort.abort();
    return true;
  }

  async retryCommit(): Promise<TurnControllerResult> {
    if (!this.pending) return { ok: false, error: "commit_retryable" };
    const pending = this.pending;
    return this.finishWithCommit(pending);
  }

  private acceptEvent(active: ActiveRun, event: TurnGatewayEvent): { ok: true } | { ok: false; error: TurnControllerError; message?: string } {
    if (!isGatewayIdentity(event, active.input.executionId, active.input.turnId)) return { ok: false, error: "invalid_event" };
    const expected = active.events.length + 1;
    if (event.sequence !== expected) return { ok: false, error: "invalid_event" };
    if (expected === 1 && event.type !== "accepted") return { ok: false, error: "invalid_event" };
    if (expected > 1 && event.type === "accepted") return { ok: false, error: "invalid_event" };
    if (event.type === "accepted" && event.kind !== active.input.kind) return { ok: false, error: "invalid_event" };
    if (event.type === "error") return { ok: false, error: "turn_error", message: event.message };
    active.events.push(event);
    this.view.lastSequence = event.sequence;
    this.view.events = [...active.events];
    if (event.type === "answer_delta") active.answerDraft += event.delta;
    if (event.type === "source_delta") for (const source of event.sources) active.sources.set(source.sourceId, source);
    if (event.type === "research_state") active.researchState = event.state;
    this.view.answerDraft = active.answerDraft;
    this.view.sources = [...active.sources.values()];
    this.view.researchState = active.researchState;
    return { ok: true };
  }

  private buildTerminal(active: ActiveRun, event: Extract<TurnGatewayEvent, { type: "terminal" }>): Turn | undefined {
    const base = { id: active.input.turnId, kind: active.input.kind, createdAt: active.input.createdAt, finishedAt: this.clock(), userMessage: active.input.userMessage };
    const candidate = { ...base, ...event.terminal.outcome } as Turn;
    if (candidate.kind !== active.input.kind) return undefined;
    if (!sourceClosure(candidate, event.terminal.sourceRecords)) return undefined;
    active.terminalSources = event.terminal.sourceRecords;
    const parsed = turnV3Schema.safeParse(candidate);
    if (!parsed.success) return undefined;
    return candidate;
  }

  private sourcesForTerminal(active: ActiveRun, turn: Turn): CanonicalSource[] {
    const sourceIds = collectTurnSourceIds(turn);
    return (active.terminalSources ?? [...active.sources.values()]).filter((source) => sourceIds.has(source.sourceId));
  }

  private async finishInterruption(active: ActiveRun, reason: "user_cancelled" | "navigation" | "connection_lost"): Promise<TurnControllerResult> {
    const base = { id: active.input.turnId, kind: active.input.kind, createdAt: active.input.createdAt, finishedAt: this.clock(), userMessage: active.input.userMessage, execution: { kind: "unavailable" as const } };
    const interruption = { reason, message: boundedMessage(reason === "connection_lost" ? "The connection was lost." : "The turn was interrupted.") };
    let researchState: { kind: "checkpoint"; checkpoint: ResearchCheckpoint } | { kind: "resolution"; resolution: Exclude<ResearchResolution, { status: "insufficient" }> } | { kind: "unavailable" } = { kind: "unavailable" };
    if (active.researchState?.kind === "checkpoint") researchState = active.researchState;
    else if (active.researchState?.kind === "resolution" && active.researchState.resolution.status !== "insufficient") researchState = active.researchState as { kind: "resolution"; resolution: Exclude<ResearchResolution, { status: "insufficient" }> };
    const turn: Turn = active.input.kind === "search"
      ? { ...base, kind: "search", status: "interrupted", interruption }
      : { ...base, kind: "research", status: "interrupted", interruption, researchState };
    if (!turnV3Schema.safeParse(turn).success) return this.finishWithoutCommit(active, "invalid_terminal");
    return this.finishWithCommit({ input: active.input, turn, sourceRecords: [] });
  }

  private finishWithoutCommit(active: ActiveRun, error: TurnControllerError, message?: string): TurnControllerResult {
    if (this.active === active) this.active = undefined;
    this.view.active = false;
    this.emit();
    return { ok: false, error, message };
  }

  private async finishWithCommit(candidate: Candidate): Promise<TurnControllerResult> {
    if (this.active?.input.turnId === candidate.input.turnId) this.active = undefined;
    this.view.active = false;
    const result = await this.commit(candidate);
    this.emit();
    return result;
  }

  private async commit(candidate: Candidate): Promise<TurnControllerResult> {
    let expectedRevision = candidate.input.expectedRevision;
    let create = candidate.input.create;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await this.store.commitTerminalTurn({ threadId: candidate.input.threadId, expectedRevision, create, sourceRecords: candidate.sourceRecords, turn: candidate.turn });
      if (result.ok) { this.pending = undefined; return { ok: true, turn: candidate.turn, record: result.value.record, disposition: result.value.disposition }; }
      if (result.failure.code !== "revision_conflict" || attempt > 0) {
        if (result.failure.retryable) { this.pending = candidate; return { ok: false, error: "commit_retryable", failure: result.failure, candidate: candidate.turn }; }
        return { ok: false, error: "commit_blocked", failure: result.failure, candidate: candidate.turn };
      }
      const loaded = await this.store.load(candidate.input.threadId);
      if (!loaded.ok) {
        if (loaded.failure.retryable) { this.pending = candidate; return { ok: false, error: "commit_retryable", failure: loaded.failure, candidate: candidate.turn }; }
        return { ok: false, error: "commit_blocked", failure: loaded.failure, candidate: candidate.turn };
      }
      expectedRevision = loaded.value?.revision ?? null;
      create = loaded.value ? undefined : candidate.input.create;
    }
    this.pending = candidate;
    return { ok: false, error: "commit_retryable" , candidate: candidate.turn };
  }

  private emit(): void { this.onViewChange?.(this.snapshot); }
}

export type { AssistantContent };
