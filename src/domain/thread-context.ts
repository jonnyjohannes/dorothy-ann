import type {
  AssistantContent,
  EvidencePack,
  ResearchResolution,
  ResearchTurn,
  SourceId,
  Thread,
  ThreadContext,
  ThreadContextTurn,
  Turn,
} from "./model-v3.js";

export interface ThreadContextLimits {
  maxThreadContextTurns: number;
  maxThreadContextChars: number;
  maxEvidenceCharsPerSource: number;
  maxEvidenceCharsTotal: number;
  maxTurnRequestBytes: number;
}

export class TurnRequestTooLargeError extends Error {
  constructor() {
    super("turn_request_too_large");
    this.name = "TurnRequestTooLargeError";
  }
}

const length = (value: string) => [...value].length;
const prefix = (value: string, maximum: number) => [...value].slice(0, maximum).join("");
const citationToken = (sourceId: SourceId) => `[[cite:${sourceId}]]`;

function contextualAnswer(answer: AssistantContent, budget: number): { answer: AssistantContent; used: number; truncated: boolean } {
  const parts: AssistantContent["parts"] = [];
  let used = 0;
  let truncated = false;
  for (let index = 0; index < answer.parts.length; index += 1) {
    const part = answer.parts[index];
    const cost = part.type === "text" ? length(part.markdown) : length(citationToken(part.sourceId));
    const remaining = budget - used;
    if (cost <= remaining) {
      parts.push(part);
      used += cost;
      continue;
    }
    if (part.type === "text" && remaining > 0) {
      parts.push({ type: "text", markdown: prefix(part.markdown, remaining) });
      used += remaining;
    }
    truncated = true;
    break;
  }
  if (parts.length < answer.parts.length) truncated = true;
  return { answer: { parts }, used, truncated };
}

function resolutionFor(turn: ResearchTurn): ResearchResolution | undefined {
  if (turn.status === "completed") return turn.result.resolution;
  return turn.researchState.kind === "resolution" ? turn.researchState.resolution : undefined;
}
function packsFor(turn: ResearchTurn): EvidencePack[] {
  if (turn.status === "completed") return turn.result.resolution.knowledge.evidence;
  if (turn.researchState.kind === "resolution") return turn.researchState.resolution.knowledge.evidence;
  if (turn.researchState.kind === "checkpoint") return turn.researchState.checkpoint.knowledge.evidence;
  return [];
}
function sourceSupports(turn: ResearchTurn): SourceId[] {
  const resolution = resolutionFor(turn);
  const knowledge = resolution?.knowledge ?? (turn.status !== "completed" && turn.researchState.kind === "checkpoint" ? turn.researchState.checkpoint.knowledge : undefined);
  if (!knowledge) return [];
  const values: SourceId[] = [];
  for (const finding of knowledge.findings) for (const observation of finding.observations) {
    for (const support of observation.support) if (support.type === "source") values.push(support.sourceId);
  }
  return values;
}

function baseContextTurn(turn: Turn): Omit<ThreadContextTurn, "answer" | "answerTruncated"> | undefined {
  const request = turn.userMessage.content;
  if (turn.kind === "search") {
    if (turn.status === "completed") return { turnId: turn.id, kind: "search", request, outcome: "search" };
    return { turnId: turn.id, kind: "search", request, outcome: turn.status };
  }
  if (turn.status === "completed") return undefined;
  if (turn.status === "failed" && turn.failure.kind === "insufficient_evidence") return { turnId: turn.id, kind: "research", request, outcome: "insufficient" };
  return { turnId: turn.id, kind: "research", request, outcome: turn.status };
}

function buildTurns(selected: Turn[], characterBudget: number): ThreadContextTurn[] {
  const answerByTurn = new Map<string, { answer: AssistantContent; truncated: boolean }>();
  let remaining = characterBudget - selected.reduce((total, turn) => total + length(turn.userMessage.content), 0);
  for (const turn of [...selected].reverse()) {
    if (turn.kind !== "research" || turn.status !== "completed") continue;
    const projected = contextualAnswer(turn.result.answer, Math.max(0, remaining));
    answerByTurn.set(turn.id, { answer: projected.answer, truncated: projected.truncated });
    remaining -= projected.used;
  }
  return selected.map((turn): ThreadContextTurn => {
    if (turn.kind === "research" && turn.status === "completed") {
      const projected = answerByTurn.get(turn.id) ?? { answer: { parts: [] }, truncated: true };
      return { turnId: turn.id, kind: "research", request: turn.userMessage.content, outcome: turn.result.completion, answer: projected.answer, answerTruncated: projected.truncated };
    }
    return baseContextTurn(turn) as ThreadContextTurn;
  });
}

function buildEvidence(selected: Turn[], limits: ThreadContextLimits): EvidencePack[] {
  const candidates = [...selected].reverse().flatMap((turn) => turn.kind === "research"
    ? packsFor(turn).map((pack) => ({ turn, pack })).sort((left, right) => left.pack.requestOrder - right.pack.requestOrder || left.pack.problemId.localeCompare(right.pack.problemId))
    : []);
  const seen = new Map<string, string>();
  const admitted: Array<{ turnCreatedAt: string; pack: EvidencePack }> = [];
  let remaining = limits.maxEvidenceCharsTotal;
  outer: for (const candidate of candidates) {
    const sources: EvidencePack["sources"] = [];
    for (const source of candidate.pack.sources) {
      const key = `${candidate.pack.problemId}\n${candidate.pack.query}\n${source.sourceId}\n${source.page.extractedAt}`;
      const value = JSON.stringify(source);
      const previous = seen.get(key);
      if (previous !== undefined) {
        if (previous !== value) throw new Error("evidence_integrity_failure");
        continue;
      }
      seen.set(key, value);
      const boundedText = prefix(source.page.text, limits.maxEvidenceCharsPerSource);
      const fullCost = length(boundedText);
      if (fullCost <= remaining) {
        sources.push({ ...source, page: { ...source.page, text: boundedText, characterCount: fullCost } });
        remaining -= fullCost;
        continue;
      }
      if (remaining >= 256) {
        const text = prefix(boundedText, remaining);
        sources.push({ ...source, page: { ...source.page, text, characterCount: length(text) } });
        remaining = 0;
      }
      if (sources.length > 0) admitted.push({ turnCreatedAt: candidate.turn.createdAt, pack: { ...candidate.pack, sources } });
      break outer;
    }
    if (sources.length > 0) admitted.push({ turnCreatedAt: candidate.turn.createdAt, pack: { ...candidate.pack, sources } });
  }
  return admitted.sort((left, right) => left.turnCreatedAt.localeCompare(right.turnCreatedAt) || left.pack.requestOrder - right.pack.requestOrder || left.pack.problemId.localeCompare(right.pack.problemId)).map(({ pack }) => pack);
}

export function buildThreadContext(thread: Thread, limits: ThreadContextLimits): ThreadContext {
  let selected = thread.turns.slice(-limits.maxThreadContextTurns);
  let requestCharacters = selected.reduce((total, turn) => total + length(turn.userMessage.content), 0);
  while (selected.length > 0 && requestCharacters > limits.maxThreadContextChars) {
    requestCharacters -= length(selected[0].userMessage.content);
    selected = selected.slice(1);
  }
  const turns = buildTurns(selected, limits.maxThreadContextChars);
  const availableEvidence = buildEvidence(selected, limits);
  const admittedEvidenceIds = new Set(availableEvidence.flatMap((pack) => pack.sources.map((source) => source.sourceId)));
  const prioritySourceIds: SourceId[] = [];
  for (const turn of [...selected].reverse()) if (turn.kind === "research") {
    const orderedPacks = [...packsFor(turn)].sort((left, right) => left.requestOrder - right.requestOrder || left.problemId.localeCompare(right.problemId));
    for (const pack of orderedPacks) for (const source of pack.sources) if (admittedEvidenceIds.has(source.sourceId)) prioritySourceIds.push(source.sourceId);
  }
  for (const turn of [...selected].reverse()) if (turn.kind === "research") prioritySourceIds.push(...sourceSupports(turn));
  for (const turn of [...selected].reverse()) if (turn.kind === "search" && turn.status === "completed") {
    prioritySourceIds.push(...[...turn.result.destinations].sort((left, right) => left.rank - right.rank).map((destination) => destination.sourceId));
  }
  const selectedSourceIds = new Set(prioritySourceIds.filter((sourceId, index) => prioritySourceIds.indexOf(sourceId) === index).slice(0, limits.maxThreadContextTurns * 3));
  const knownSources = thread.sources.filter((source) => selectedSourceIds.has(source.sourceId)).map((source) => ({
    sourceId: source.sourceId,
    title: source.title,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    displayUrl: source.displayUrl,
    snippet: source.snippet,
    publishedAt: source.publishedAt,
  }));
  return { threadId: thread.id, turns, knownSources, availableEvidence };
}

export function assertTurnRequestBytes(value: unknown, maximum: number): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximum) throw new TurnRequestTooLargeError();
}
