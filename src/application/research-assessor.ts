import { joinKnowledge } from "../domain/knowledge.js";
import { normalizeIdentityText } from "../domain/identity-material.js";
import {
  sourceIdSchema,
  turnIdSchema,
} from "../domain/schemas.js";
import type {
  EvidencePack,
  GapLedger,
  KnowledgeUnit,
  ResearchProblem,
  ResearchProblemId,
  SupportRef,
  SupportedFinding,
  SupportedObservation,
  TurnId,
} from "../domain/types.js";
import type { IdentityPolicy } from "./identity-policy.js";

export const MAX_ASSESSMENTS = 8;
export const MAX_OBSERVATIONS = 24;
export const MAX_CHILD_PROBLEMS = 3;

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

export interface ResearchAssessmentProposal {
  directive: ResearchDirectiveProposal;
}

export type ResearchDirective =
  | { kind: "resolved"; knowledge: KnowledgeUnit }
  | { kind: "search"; query: string; purpose: string; successCriterion: string; priority: 1 | 2 | 3 }
  | { kind: "decompose"; operator: "all" | "any"; problems: ResearchProblemProposal[] };

export interface ResearchAssessment {
  problemId: ResearchProblemId;
  directive: ResearchDirective;
}

/**
 * This is the narrow seam consumed by the LLM port when it is introduced. The
 * assessor deliberately accepts an already-decoded, untrusted proposal rather
 * than importing an LLM/provider dependency.
 */
export interface ResearchAssessorInput {
  problem: ResearchProblem;
  knowledge: KnowledgeUnit;
  ledger: GapLedger;
  proposal: ResearchAssessmentProposal;
  /** The turn that owns this recursive research tree. */
  turnId?: TurnId;
  /** Exact refs exposed to the model for this assessment. */
  allowedSupportRefs?: readonly SupportRef[];
  /** Evidence already admitted for this problem; never supplied by the model. */
  evidence?: readonly EvidencePack[];
}

export class ResearchAssessmentValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ResearchAssessmentValidationError";
  }
}

const codePoints = (value: string) => [...value].length;
const hasControl = (value: string) => [...value].some((character) => {
  const code = character.codePointAt(0) ?? 0;
  return code <= 0x1f || code === 0x7f;
});

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw new ResearchAssessmentValidationError(`${field}_invalid`);
  const normalized = normalizeIdentityText(value);
  if (!normalized || codePoints(normalized) > maximum || hasControl(normalized)) {
    throw new ResearchAssessmentValidationError(`${field}_invalid`);
  }
  return normalized;
}

function priority(value: unknown, field: string): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) throw new ResearchAssessmentValidationError(`${field}_invalid`);
  return value;
}

function referenceKey(reference: SupportRef): string {
  if (!reference || typeof reference !== "object" || (reference.type !== "turn" && reference.type !== "source")) {
    throw new ResearchAssessmentValidationError("support_invalid");
  }
  const keys = Object.keys(reference);
  if (reference.type === "turn") {
    if (keys.some((key) => key !== "type" && key !== "turnId") || !turnIdSchema.safeParse(reference.turnId).success) {
      throw new ResearchAssessmentValidationError("support_invalid");
    }
    return `turn:${reference.turnId}`;
  }
  if (keys.some((key) => key !== "type" && key !== "sourceId") || !sourceIdSchema.safeParse(reference.sourceId).success) {
    throw new ResearchAssessmentValidationError("support_invalid");
  }
  return `source:${reference.sourceId}`;
}

function canonicalReferences(
  references: unknown,
  allowed: ReadonlySet<string>,
): SupportRef[] {
  if (!Array.isArray(references) || references.length === 0 || references.length > 24) {
    throw new ResearchAssessmentValidationError("support_invalid");
  }
  const unique = new Map<string, SupportRef>();
  for (const reference of references) {
    const item = reference as SupportRef;
    const key = referenceKey(item);
    if (!allowed.has(key)) throw new ResearchAssessmentValidationError("unsupported_reference");
    unique.set(key, item);
  }
  return [...unique.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, item]) => item);
}

function supportRefsFromInput(input: ResearchAssessorInput): ReadonlySet<string> {
  const refs = input.allowedSupportRefs ?? [
    ...input.problem.context.turns.map((turn) => ({ type: "turn", turnId: turn.turnId }) as SupportRef),
    ...input.problem.context.knownSources.map((source) => ({ type: "source", sourceId: source.sourceId }) as SupportRef),
    ...input.problem.context.availableEvidence.flatMap((pack) => pack.sources.map((source) => ({ type: "source", sourceId: source.sourceId }) as SupportRef)),
    ...input.knowledge.evidence.flatMap((pack) => pack.sources.map((source) => ({ type: "source", sourceId: source.sourceId }) as SupportRef)),
    ...input.knowledge.findings.flatMap((finding) => finding.observations.flatMap((observation) => observation.support)),
    ...input.ledger.gaps.flatMap((gap) => gap.support),
  ];
  const keys = new Set<string>();
  for (const reference of refs) keys.add(referenceKey(reference));
  return keys;
}

function mergeFindings(existing: KnowledgeUnit, added: SupportedFinding[], problemId: ResearchProblemId): KnowledgeUnit {
  const canonicalAdded = added.map((finding) => {
    const previous = existing.findings.find((candidate) => candidate.propositionKey === finding.propositionKey);
    return previous && normalizeIdentityText(previous.proposition) === normalizeIdentityText(finding.proposition)
      ? { ...finding, proposition: previous.proposition }
      : finding;
  });
  return joinKnowledge(problemId, [existing, {
    problemId,
    findings: canonicalAdded,
    evidence: [],
    unresolvedGapIds: [],
  }]);
}

function normalizedProposal(value: unknown, field: string): ResearchProblemProposal {
  if (!value || typeof value !== "object") throw new ResearchAssessmentValidationError(`${field}_invalid`);
  const candidate = value as Partial<ResearchProblemProposal>;
  if (Object.keys(candidate).some((key) => !["question", "purpose", "successCriterion", "priority"].includes(key))) {
    throw new ResearchAssessmentValidationError(`${field}_invalid`);
  }
  return {
    question: text(candidate.question, `${field}_question`, 2_000),
    purpose: text(candidate.purpose, `${field}_purpose`, 240),
    successCriterion: text(candidate.successCriterion, `${field}_success_criterion`, 500),
    priority: priority(candidate.priority, `${field}_priority`),
  };
}

export class ResearchAssessor {
  constructor(private readonly identities: IdentityPolicy) {}

  async assess(input: ResearchAssessorInput): Promise<ResearchAssessment> {
    if (!input || !Number.isInteger(input.ledger.assessmentsUsed) || input.ledger.assessmentsUsed < 0 || input.ledger.assessmentsUsed >= MAX_ASSESSMENTS) {
      throw new ResearchAssessmentValidationError("assessment_budget_exhausted");
    }
    if (!input.proposal || typeof input.proposal !== "object" || Object.keys(input.proposal).some((key) => key !== "directive") || !input.proposal.directive) {
      throw new ResearchAssessmentValidationError("proposal_invalid");
    }

    const directive = input.proposal.directive;
    if (!directive || typeof directive !== "object" || !["resolved", "search", "decompose"].includes(directive.kind)) {
      throw new ResearchAssessmentValidationError("directive_invalid");
    }
    const allowedDirectiveKeys = directive.kind === "resolved"
      ? ["kind", "observations"]
      : directive.kind === "search"
        ? ["kind", "query", "purpose", "successCriterion", "priority"]
        : ["kind", "operator", "problems"];
    if (Object.keys(directive).some((key) => !allowedDirectiveKeys.includes(key))) {
      throw new ResearchAssessmentValidationError("directive_invalid");
    }

    if (directive.kind === "search") {
      const query = text(directive.query, "query", 500);
      if (normalizeIdentityText(query) === normalizeIdentityText(input.problem.question)) {
        throw new ResearchAssessmentValidationError("query_not_material");
      }
      return {
        problemId: input.problem.id,
        directive: {
          kind: "search",
          query,
          purpose: text(directive.purpose, "purpose", 240),
          successCriterion: text(directive.successCriterion, "success_criterion", 500),
          priority: priority(directive.priority, "priority"),
        },
      };
    }

    if (directive.kind === "decompose") {
      if (directive.operator !== "all" && directive.operator !== "any") {
        throw new ResearchAssessmentValidationError("operator_invalid");
      }
      if (!Array.isArray(directive.problems) || directive.problems.length === 0 || directive.problems.length > MAX_CHILD_PROBLEMS) {
        throw new ResearchAssessmentValidationError("child_problem_bounds");
      }
      const seen = new Set<string>();
      const problems: ResearchProblemProposal[] = [];
      for (const raw of directive.problems) {
        const child = normalizedProposal(raw, "child");
        const identity = [normalizeIdentityText(child.question), normalizeIdentityText(child.purpose), normalizeIdentityText(child.successCriterion)].join("\u0000");
        if (seen.has(identity)) continue;
        seen.add(identity);
        // Child IDs are owned by the resolver. When the owning turn ID is
        // available, still derive the ID here to exercise collision checking
        // at the untrusted boundary without leaking provider-authored IDs.
        if (input.turnId) await this.identities.problemId({
          turnId: input.turnId,
          parentId: input.problem.id,
          question: child.question,
          purpose: child.purpose,
          successCriterion: child.successCriterion,
        });
        problems.push(child);
      }
      if (problems.length === 0) throw new ResearchAssessmentValidationError("child_problem_bounds");
      return { problemId: input.problem.id, directive: { kind: "decompose", operator: directive.operator, problems } };
    }

    if (!Array.isArray(directive.observations) || directive.observations.length === 0 || directive.observations.length > MAX_OBSERVATIONS) {
      throw new ResearchAssessmentValidationError("observation_bounds");
    }
    const allowed = supportRefsFromInput(input);
    const observations = new Map<string, SupportedObservation>();
    for (const raw of directive.observations) {
      if (!raw || typeof raw !== "object") throw new ResearchAssessmentValidationError("observation_invalid");
      const candidate = raw as Partial<ObservationProposal>;
      if (Object.keys(candidate).some((key) => !["proposition", "statement", "stance", "support"].includes(key))) {
        throw new ResearchAssessmentValidationError("observation_invalid");
      }
      if (candidate.stance !== "supports" && candidate.stance !== "contradicts" && candidate.stance !== "qualifies") {
        throw new ResearchAssessmentValidationError("stance_invalid");
      }
      const proposition = text(candidate.proposition, "proposition", 240);
      const statement = text(candidate.statement, "statement", 1_000);
      const support = canonicalReferences(candidate.support, allowed);
      const propositionKey = await this.identities.propositionKey(proposition);
      const observationId = await this.identities.observationId({ propositionKey, statement, stance: candidate.stance, support });
      const observation: SupportedObservation = { id: observationId, propositionKey, statement, stance: candidate.stance, support };
      const key = `${observationId}`;
      if (!observations.has(key)) observations.set(key, observation);
    }
    if (observations.size === 0) throw new ResearchAssessmentValidationError("observation_invalid");
    const findingsByProposition = new Map<string, SupportedFinding>();
    for (const observation of observations.values()) {
      const existing = findingsByProposition.get(observation.propositionKey);
      if (existing) existing.observations.push(observation);
      else findingsByProposition.set(observation.propositionKey, {
        propositionKey: observation.propositionKey,
        proposition: directive.observations.find((candidate) => candidate && typeof candidate === "object")?.proposition
          ? text(directive.observations.find((candidate) => candidate && typeof candidate === "object" && candidate.proposition)?.proposition, "proposition", 240)
          : "",
        observations: [observation],
        status: "supported",
      });
    }
    const findings = [...findingsByProposition.values()].map((finding) => ({
      ...finding,
      status: finding.observations.some((observation) => observation.stance === "contradicts") ? "contested" as const : "supported" as const,
    }));
    const evidence = [...(input.evidence ?? input.knowledge.evidence)];
    const knowledge = mergeFindings(input.knowledge, findings, input.problem.id);
    knowledge.evidence = evidence;
    knowledge.unresolvedGapIds = [];
    return { problemId: input.problem.id, directive: { kind: "resolved", knowledge } };
  }
}

export async function assessResearchProblem(
  identities: IdentityPolicy,
  input: Omit<ResearchAssessorInput, "proposal"> & { proposal: ResearchAssessmentProposal },
): Promise<ResearchAssessment> {
  return new ResearchAssessor(identities).assess(input);
}
