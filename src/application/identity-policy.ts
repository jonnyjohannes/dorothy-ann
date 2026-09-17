import { encodeIdentityFields, normalizeCanonicalUrl, normalizeIdentityText, serializeSupportIdentity } from "../domain/identity-material.js";
import type {
  LegacyArchiveEntryId,
  ObservationId,
  PropositionKey,
  ResearchGapId,
  ResearchProblemId,
  SourceId,
  SupportRef,
  ThreadId,
  TurnId,
} from "../domain/model-v3.js";
import type { IdentityHasher } from "../ports/identity.js";

export class IdentityCollisionError extends Error {
  constructor() {
    super("identity_collision");
    this.name = "IdentityCollisionError";
  }
}

export class IdentityPolicy {
  private readonly materialById = new Map<string, string>();

  constructor(private readonly hasher: IdentityHasher) {}

  private async derive(prefix: string, fields: readonly string[]): Promise<string> {
    const material = encodeIdentityFields(fields);
    const digest = await this.hasher.sha256Base64Url(material);
    if (!/^[A-Za-z0-9_-]{43}$/u.test(digest)) throw new Error("invalid_identity_digest");
    const id = prefix ? `${prefix}_${digest}` : digest;
    const materialKey = [...material].join(",");
    const previous = this.materialById.get(id);
    if (previous !== undefined && previous !== materialKey) throw new IdentityCollisionError();
    this.materialById.set(id, materialKey);
    return id;
  }

  async sourceId(canonicalUrl: string): Promise<SourceId> {
    return this.derive("src", [normalizeCanonicalUrl(canonicalUrl)]) as Promise<SourceId>;
  }

  async legacyArchiveEntryId(input: { threadId: ThreadId; originalIndex: number }): Promise<LegacyArchiveEntryId> {
    return this.derive("legacy", [input.threadId, String(input.originalIndex)]) as Promise<LegacyArchiveEntryId>;
  }

  async propositionKey(proposition: string): Promise<PropositionKey> {
    return this.derive("prop", [normalizeIdentityText(proposition)]) as Promise<PropositionKey>;
  }

  async observationId(input: {
    propositionKey: PropositionKey;
    statement: string;
    stance: "supports" | "contradicts" | "qualifies";
    support: SupportRef[];
  }): Promise<ObservationId> {
    const support = input.support.map((reference) => reference.type === "turn" ? `turn:${reference.turnId}` : `source:${reference.sourceId}`);
    return this.derive("obs", [input.propositionKey, normalizeIdentityText(input.statement), input.stance, serializeSupportIdentity(support)]) as Promise<ObservationId>;
  }

  async problemId(input: {
    turnId: TurnId;
    parentId?: ResearchProblemId;
    question: string;
    purpose: string;
    successCriterion: string;
  }): Promise<ResearchProblemId> {
    return this.derive("problem", [
      input.turnId,
      input.parentId ?? "",
      normalizeIdentityText(input.question),
      normalizeIdentityText(input.purpose),
      normalizeIdentityText(input.successCriterion),
    ]) as Promise<ResearchProblemId>;
  }

  async gapIdentity(input: {
    problemId: ResearchProblemId;
    question: string;
    purpose: string;
    successCriterion: string;
  }): Promise<{ gapId: ResearchGapId; fingerprint: string }> {
    const fields = [normalizeIdentityText(input.question), normalizeIdentityText(input.purpose), normalizeIdentityText(input.successCriterion)];
    const fingerprint = await this.derive("", fields);
    const gapId = await this.derive("gap", [input.problemId, ...fields]) as ResearchGapId;
    return { gapId, fingerprint };
  }
}
