import type { EvidencePack, KnowledgeUnit, ResearchGapId, ResearchProblemId, SupportRef, SupportedFinding, SupportedObservation } from "./types.js";

export class KnowledgeIntegrityError extends Error {
  constructor() {
    super("knowledge_integrity_failure");
    this.name = "KnowledgeIntegrityError";
  }
}

const supportKey = (support: SupportRef) => support.type === "turn" ? `turn:${support.turnId}` : `source:${support.sourceId}`;
const stableJson = (value: unknown) => JSON.stringify(value);

function canonicalObservation(observation: SupportedObservation): SupportedObservation {
  const support = [...new Map(observation.support.map((item) => [supportKey(item), item])).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, item]) => item);
  return { ...observation, support };
}

function findingStatus(observations: SupportedObservation[]): SupportedFinding["status"] {
  if (observations.length === 0) return "insufficient";
  const stances = new Set(observations.map((observation) => observation.stance));
  return stances.has("contradicts") ? "contested" : "supported";
}

function joinFindings(units: readonly KnowledgeUnit[]): SupportedFinding[] {
  const findings = new Map<string, { proposition: string; observations: Map<string, SupportedObservation> }>();
  for (const unit of units) for (const finding of unit.findings) {
    const current = findings.get(finding.propositionKey) ?? { proposition: finding.proposition, observations: new Map() };
    if (current.proposition !== finding.proposition) throw new KnowledgeIntegrityError();
    for (const rawObservation of finding.observations) {
      const observation = canonicalObservation(rawObservation);
      const previous = current.observations.get(observation.id);
      if (previous && stableJson(previous) !== stableJson(observation)) throw new KnowledgeIntegrityError();
      current.observations.set(observation.id, observation);
    }
    findings.set(finding.propositionKey, current);
  }
  return [...findings.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([propositionKey, value]) => {
    const observations = [...value.observations.values()].sort((left, right) => left.id.localeCompare(right.id));
    return { propositionKey: propositionKey as SupportedFinding["propositionKey"], proposition: value.proposition, observations, status: findingStatus(observations) };
  });
}

function joinEvidence(units: readonly KnowledgeUnit[]): EvidencePack[] {
  const snapshots = new Map<string, { packKey: string; pack: Omit<EvidencePack, "sources">; source: EvidencePack["sources"][number] }>();
  for (const unit of units) for (const pack of unit.evidence) for (const source of pack.sources) {
    const snapshotKey = `${pack.problemId}\n${pack.query}\n${source.sourceId}\n${source.page.extractedAt}`;
    const packKey = `${pack.createdAt}\n${String(pack.requestOrder).padStart(10, "0")}\n${pack.problemId}\n${pack.query}`;
    const candidate = { packKey, pack: { problemId: pack.problemId, requestOrder: pack.requestOrder, query: pack.query, createdAt: pack.createdAt }, source };
    const previous = snapshots.get(snapshotKey);
    if (previous && stableJson(previous.source) !== stableJson(source)) throw new KnowledgeIntegrityError();
    if (!previous || packKey < previous.packKey) snapshots.set(snapshotKey, candidate);
  }
  const groups = new Map<string, { pack: Omit<EvidencePack, "sources">; sources: EvidencePack["sources"] }>();
  for (const snapshot of snapshots.values()) {
    const group = groups.get(snapshot.packKey) ?? { pack: snapshot.pack, sources: [] };
    group.sources.push(snapshot.source);
    groups.set(snapshot.packKey, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, group]) => ({
    ...group.pack,
    sources: group.sources.sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.page.extractedAt.localeCompare(right.page.extractedAt)),
  }));
}

export function joinKnowledge(problemId: ResearchProblemId, units: readonly KnowledgeUnit[]): KnowledgeUnit {
  const unresolvedGapIds = [...new Set(units.flatMap((unit) => unit.unresolvedGapIds))].sort() as ResearchGapId[];
  return {
    problemId,
    findings: joinFindings(units),
    evidence: joinEvidence(units),
    unresolvedGapIds,
  };
}
