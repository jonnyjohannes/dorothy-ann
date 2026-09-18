import { joinKnowledge } from "../domain/knowledge.js";
import type {
  CanonicalSource,
  GapLedger,
  KnowledgeUnit,
  ResearchBudget,
  ResearchCheckpoint,
  ResearchGap,
  ResearchProblem,
  ResearchResolution,
  ResearchTaskRecord,
  SupportRef,
  TurnId,
} from "../domain/types.js";
import type {
  ResearchAssessmentProposal,
  ResearchAssessor,
  ResearchAssessment,
} from "./research-assessor.js";
import type { EvidenceAcquirer, EvidenceAcquisitionResult, EvidenceRequest, ResearchLimits } from "./evidence-acquirer.js";
import type { IdentityPolicy } from "./identity-policy.js";
import { sourceIdSchema, turnIdSchema } from "../domain/schemas.js";

export const MAX_RESEARCH_DEPTH = 2;

export interface ResearchAssessmentRequest {
  problem: ResearchProblem;
  knowledge: KnowledgeUnit;
  ledger: GapLedger;
  budget: ResearchBudget;
  allowedSupportRefs: SupportRef[];
}

export interface ResearchResolverDependencies {
  identities: IdentityPolicy;
  assessor: ResearchAssessor;
  /** Decodes one provider response. Validation and trusted IDs remain in assessor. */
  assess(request: ResearchAssessmentRequest): Promise<ResearchAssessmentProposal>;
  acquirer: EvidenceAcquirer;
  acquisitionLimits?: ResearchLimits;
}

export interface ResearchResolverInput {
  turnId: TurnId;
  problem: ResearchProblem;
  knowledge: KnowledgeUnit;
  ledger: GapLedger;
  budget: ResearchBudget;
}

export type ResearchResolverOutcome =
  | { kind: "resolution"; resolution: ResearchResolution & { sources?: CanonicalSource[] } }
  | { kind: "checkpoint"; checkpoint: ResearchCheckpoint };

const cloneLedger = (ledger: GapLedger): GapLedger => ({
  gaps: ledger.gaps.map((gap) => ({ ...gap, problem: { ...gap.problem, context: gap.problem.context } })),
  assessmentsUsed: ledger.assessmentsUsed,
  searchesUsed: ledger.searchesUsed,
  sourcesConsumed: ledger.sourcesConsumed,
});

const useful = (knowledge: KnowledgeUnit): boolean => knowledge.findings.length > 0 || knowledge.evidence.some((pack) => pack.sources.length > 0);
const key = (knowledge: KnowledgeUnit): string => JSON.stringify(knowledge);
const normalized = (value: string): string => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
const isUnavailable = (error: unknown): boolean => error instanceof Error && /provider_unavailable|search_unavailable|unavailable/iu.test(error.message);
const isInterrupted = (error: unknown): boolean => error instanceof Error && /abort|interrupt|cancel/iu.test(error.message);

function refsFor(problem: ResearchProblem, knowledge: KnowledgeUnit): SupportRef[] {
  const refs = new Map<string, SupportRef>();
  for (const turn of problem.context.turns) {
    if (turnIdSchema.safeParse(turn.turnId).success) refs.set(`turn:${turn.turnId}`, { type: "turn", turnId: turn.turnId });
  }
  for (const source of problem.context.knownSources) {
    if (sourceIdSchema.safeParse(source.sourceId).success) refs.set(`source:${source.sourceId}`, { type: "source", sourceId: source.sourceId });
  }
  for (const pack of [...problem.context.availableEvidence, ...knowledge.evidence]) {
    for (const source of pack.sources) {
      if (sourceIdSchema.safeParse(source.sourceId).success) refs.set(`source:${source.sourceId}`, { type: "source", sourceId: source.sourceId });
    }
  }
  for (const finding of knowledge.findings) for (const observation of finding.observations) {
    for (const ref of observation.support) {
      if (ref.type === "turn" && turnIdSchema.safeParse(ref.turnId).success) refs.set(`turn:${ref.turnId}`, ref);
      if (ref.type === "source" && sourceIdSchema.safeParse(ref.sourceId).success) refs.set(`source:${ref.sourceId}`, ref);
    }
  }
  return [...refs.values()].sort((left, right) => {
    const a = left.type === "turn" ? `turn:${left.turnId}` : `source:${left.sourceId}`;
    const b = right.type === "turn" ? `turn:${right.turnId}` : `source:${right.sourceId}`;
    return a.localeCompare(b);
  });
}

export class ResearchResolver {
  constructor(private readonly dependencies: ResearchResolverDependencies) {}

  async resolve(input: ResearchResolverInput): Promise<ResearchResolverOutcome> {
    const state = {
      ledger: cloneLedger(input.ledger),
      budget: { ...input.budget },
      knowledge: joinKnowledge(input.problem.id, [input.knowledge]),
      tasks: [] as ResearchTaskRecord[],
      admittedSources: [] as CanonicalSource[],
      activeFingerprints: new Set<string>(),
    };
    try {
      await this.ensureGap(input.problem, state.ledger);
      const result = await this.resolveProblem(input.turnId, input.problem, state.knowledge, state, undefined);
      if (result.kind === "checkpoint") return result;
      return { kind: "resolution", resolution: this.resolution(result.knowledge, state, result.stopReason) };
    } catch (error) {
      const reason = isInterrupted(error) ? "interrupted" : "execution_failure";
      return {
        kind: "checkpoint",
        checkpoint: {
          reason,
          knowledge: state.knowledge,
          ledger: state.ledger,
          tasks: state.tasks,
          sources: state.admittedSources.length ? state.admittedSources : undefined,
        },
      };
    }
  }

  private async ensureGap(problem: ResearchProblem, ledger: GapLedger, operatorFromParent?: "all" | "any"): Promise<ResearchGap> {
    const existing = ledger.gaps.find((gap) => gap.problem.id === problem.id);
    if (existing) return existing;
    const identity = await this.dependencies.identities.gapIdentity({
      problemId: problem.id,
      question: problem.question,
      purpose: problem.purpose,
      successCriterion: problem.successCriterion,
    });
    const gap: ResearchGap = {
      id: identity.gapId,
      problem,
      operatorFromParent,
      status: "open",
      support: [],
      fingerprint: identity.fingerprint,
      createdOrder: ledger.gaps.length,
    };
    ledger.gaps.push(gap);
    return gap;
  }

  private async resolveProblem(
    turnId: TurnId,
    problem: ResearchProblem,
    startingKnowledge: KnowledgeUnit,
    state: { ledger: GapLedger; budget: ResearchBudget; knowledge: KnowledgeUnit; tasks: ResearchTaskRecord[]; admittedSources: CanonicalSource[]; activeFingerprints: Set<string> },
    operatorFromParent: "all" | "any" | undefined,
  ): Promise<{ kind: "resolution"; knowledge: KnowledgeUnit; stopReason: ResearchResolution["stopReason"] } | { kind: "checkpoint"; checkpoint: ResearchCheckpoint }> {
    const gap = await this.ensureGap(problem, state.ledger, operatorFromParent);
    if (state.activeFingerprints.has(gap.fingerprint)) {
      gap.status = "blocked";
      return { kind: "resolution", knowledge: startingKnowledge, stopReason: "duplicate_problem" };
    }
    if (problem.depth > MAX_RESEARCH_DEPTH || state.budget.depthRemaining < 0) {
      gap.status = "blocked";
      return { kind: "resolution", knowledge: startingKnowledge, stopReason: "depth_limit_reached" };
    }

    state.activeFingerprints.add(gap.fingerprint);
    try {
      if (state.budget.assessmentsRemaining <= 0) {
        gap.status = "blocked";
        return { kind: "resolution", knowledge: startingKnowledge, stopReason: "assessment_budget_exhausted" };
      }
      const before = startingKnowledge;
      const assessment = await this.assess(turnId, problem, before, state);
      const directive = assessment.directive;
      if (directive.kind === "resolved") {
        const merged = joinKnowledge(problem.id, [before, directive.knowledge]);
        state.knowledge = joinKnowledge(problem.id, [state.knowledge, merged]);
        if (key(before) === key(merged)) {
          gap.status = "blocked";
          return { kind: "resolution", knowledge: merged, stopReason: "no_new_knowledge" };
        }
        gap.status = "resolved";
        gap.support = merged.findings.flatMap((finding) => finding.observations.flatMap((observation) => observation.support));
        return { kind: "resolution", knowledge: merged, stopReason: "sufficient" };
      }

      if (directive.kind === "search") {
        if (state.budget.searchesRemaining <= 0) {
          gap.status = "blocked";
          return { kind: "resolution", knowledge: before, stopReason: "search_budget_exhausted" };
        }
        if (state.budget.sourcesRemaining <= 0) {
          gap.status = "blocked";
          return { kind: "resolution", knowledge: before, stopReason: "source_budget_exhausted" };
        }
        if (state.tasks.some((task) => normalized(task.query) === normalized(directive.query))) {
          gap.status = "blocked";
          return { kind: "resolution", knowledge: before, stopReason: "no_new_knowledge" };
        }
        const acquisition = await this.acquire(problem, directive, state);
        for (const source of acquisition.admittedSources) {
          const canonical = { ...source } as CanonicalSource & { rank?: number };
          delete canonical.rank;
          if (!state.admittedSources.some((existing) => existing.sourceId === source.sourceId)) state.admittedSources.push(canonical);
        }
        const afterSearch = joinKnowledge(problem.id, [before, { problemId: problem.id, findings: [], evidence: acquisition.evidence, unresolvedGapIds: [] }]);
        state.knowledge = joinKnowledge(problem.id, [state.knowledge, afterSearch]);
        const task: ResearchTaskRecord = {
          problemId: problem.id,
          query: directive.query,
          purpose: directive.purpose,
          priority: directive.priority,
          status: acquisition.evidence.length > 0 ? (acquisition.results.some((result) => result.failure) ? "partial" : "completed") : "failed",
          evidence: acquisition.results.flatMap((result) => result.ownedConsumedSources.map((source) => ({ sourceId: source.sourceId, rank: source.rank }))),
        };
        state.tasks.push(task);
        if (key(before) === key(afterSearch)) {
          gap.status = "blocked";
          return { kind: "resolution", knowledge: afterSearch, stopReason: acquisition.results.some((result) => result.failure?.code === "search_unavailable") ? "provider_unavailable" : "no_new_knowledge" };
        }
        gap.status = "open";
        // Search is followed by a parent reassessment. The current frame is
        // released first so this deliberate same-problem revisit is not
        // mistaken for an ancestor cycle.
        state.activeFingerprints.delete(gap.fingerprint);
        return this.resolveProblem(turnId, problem, afterSearch, state, operatorFromParent);
      }

      gap.status = "decomposed";
      let combined = before;
      let completedChild = false;
      const children = [...directive.problems].sort((left, right) => left.priority - right.priority || normalized(left.question).localeCompare(normalized(right.question)));
      for (const childProposal of children) {
        if (problem.depth >= MAX_RESEARCH_DEPTH || state.budget.depthRemaining <= 0) break;
        const childId = await this.dependencies.identities.problemId({
          turnId,
          parentId: problem.id,
          question: childProposal.question,
          purpose: childProposal.purpose,
          successCriterion: childProposal.successCriterion,
        });
        const child: ResearchProblem = {
          id: childId,
          parentId: problem.id,
          question: childProposal.question,
          purpose: childProposal.purpose,
          successCriterion: childProposal.successCriterion,
          context: problem.context,
          depth: problem.depth + 1,
        };
        const childResult = await this.resolveProblem(turnId, child, combined, state, directive.operator);
        if (childResult.kind === "checkpoint") return childResult;
        combined = joinKnowledge(problem.id, [combined, childResult.knowledge]);
        state.knowledge = joinKnowledge(problem.id, [state.knowledge, combined]);
        completedChild ||= useful(childResult.knowledge);
        if (directive.operator === "any" && completedChild) break;
      }
      if (problem.depth >= MAX_RESEARCH_DEPTH || state.budget.depthRemaining <= 0) {
        gap.status = "blocked";
        return { kind: "resolution", knowledge: combined, stopReason: "depth_limit_reached" };
      }
      state.activeFingerprints.delete(gap.fingerprint);
      const reassessed = await this.resolveProblem(turnId, problem, combined, state, operatorFromParent);
      if (reassessed.kind === "checkpoint") return reassessed;
      if (reassessed.stopReason === "duplicate_problem") {
        gap.status = completedChild ? "resolved" : "blocked";
      }
      return reassessed;
    } finally {
      state.activeFingerprints.delete(gap.fingerprint);
    }
  }

  private async assess(turnId: TurnId, problem: ResearchProblem, knowledge: KnowledgeUnit, state: { ledger: GapLedger; budget: ResearchBudget },): Promise<ResearchAssessment> {
    const request: ResearchAssessmentRequest = {
      problem,
      knowledge,
      ledger: state.ledger,
      budget: state.budget,
      allowedSupportRefs: refsFor(problem, knowledge),
    };
    let proposal: ResearchAssessmentProposal;
    try {
      proposal = await this.dependencies.assess(request);
    } catch (error) {
      if (isUnavailable(error)) throw new Error("provider_unavailable");
      throw error;
    }
    const assessment = await this.dependencies.assessor.assess({
      ...request,
      proposal,
      turnId,
      evidence: knowledge.evidence,
    });
    state.budget.assessmentsRemaining -= 1;
    state.ledger.assessmentsUsed += 1;
    return assessment;
  }

  private async acquire(problem: ResearchProblem, directive: Extract<ResearchAssessment["directive"], { kind: "search" }>, state: { budget: ResearchBudget; ledger: GapLedger }): Promise<EvidenceAcquisitionResult> {
    const request: EvidenceRequest = {
      problemId: problem.id,
      query: directive.query,
      purpose: directive.purpose,
      successCriterion: directive.successCriterion,
      priority: directive.priority,
      problemDepth: problem.depth,
      createdOrder: state.ledger.gaps.length,
    };
    const result = await this.dependencies.acquirer.acquire({
      requests: [request],
      knownSources: problem.context.knownSources,
      availableEvidenceSourceIds: problem.context.availableEvidence.flatMap((pack) => pack.sources.map((source) => source.sourceId)),
      budget: state.budget,
      limits: this.dependencies.acquisitionLimits ?? {},
    });
    const searches = state.budget.searchesRemaining - result.budget.searchesRemaining;
    const sources = state.budget.sourcesRemaining - result.budget.sourcesRemaining;
    state.budget = result.budget;
    state.ledger.searchesUsed += searches;
    state.ledger.sourcesConsumed += sources;
    return result;
  }

  private resolution(knowledge: KnowledgeUnit, state: { ledger: GapLedger; tasks: ResearchTaskRecord[]; admittedSources: CanonicalSource[] }, stopReason: ResearchResolution["stopReason"]): ResearchResolution & { sources?: CanonicalSource[] } {
    const rootOpen = state.ledger.gaps.some((gap) => gap.status === "open");
    const sources = state.admittedSources.length ? state.admittedSources : undefined;
    const usefulKnowledge = useful(knowledge);
    if (!rootOpen && stopReason === "sufficient") return { status: "sufficient", stopReason: "sufficient", knowledge, ledger: state.ledger, tasks: state.tasks, sources };
    return usefulKnowledge
      ? { status: "best_effort", stopReason: stopReason === "sufficient" ? "no_new_knowledge" : stopReason, knowledge, ledger: state.ledger, tasks: state.tasks, sources }
      : { status: "insufficient", stopReason: stopReason === "sufficient" ? "no_new_knowledge" : stopReason, knowledge, ledger: state.ledger, tasks: state.tasks, sources };
  }
}

export class ResearchResolverExecutionError extends Error {
  constructor(message = "research_resolver_execution_failure") {
    super(message);
    this.name = "ResearchResolverExecutionError";
  }
}

