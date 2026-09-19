import type { CanonicalSource, ResearchCheckpoint, ResearchResolution, Turn } from "../../domain/types.js";
import type { TurnGatewayEvent, TurnGatewaySourceOccurrence } from "../../ports/turn-gateway.js";

export interface ActiveTurnProjection {
  turnId: string;
  kind: "search" | "research";
  phase?: string;
  answerDraft: string;
  sources: CanonicalSource[];
  occurrences: TurnGatewaySourceOccurrence[];
  researchState?: { kind: "checkpoint"; checkpoint: ResearchCheckpoint } | { kind: "resolution"; resolution: ResearchResolution };
}

export function projectActiveTurn(events: readonly TurnGatewayEvent[]): ActiveTurnProjection | null {
  const accepted = events.find((event) => event.type === "accepted");
  if (!accepted || accepted.type !== "accepted") return null;
  const sources = new Map<string, CanonicalSource>();
  const occurrences = new Map<string, TurnGatewaySourceOccurrence>();
  let phase: string | undefined;
  let answerDraft = "";
  let researchState: ActiveTurnProjection["researchState"];
  for (const event of events) {
    if (event.type === "phase") phase = event.phase;
    if (event.type === "answer_delta") answerDraft += event.delta;
    if (event.type === "source_delta") {
      for (const source of event.sources) sources.set(source.sourceId, source);
      for (const occurrence of event.occurrences) occurrences.set(`${occurrence.sourceId}:${occurrence.role}:${occurrence.rank ?? ""}`, occurrence);
    }
    if (event.type === "research_state") researchState = event.state;
  }
  return { turnId: accepted.turnId, kind: accepted.kind, phase, answerDraft, sources: [...sources.values()], occurrences: [...occurrences.values()], researchState };
}

export function projectEvidenceDelta(events: readonly TurnGatewayEvent[]): { sources: CanonicalSource[]; occurrences: TurnGatewaySourceOccurrence[] } {
  const projection = projectActiveTurn(events);
  return projection ? { sources: projection.sources, occurrences: projection.occurrences } : { sources: [], occurrences: [] };
}

export function replaceActiveWithTerminal(turns: readonly Turn[], active: ActiveTurnProjection | null, terminal: Turn | null): Turn[] {
  if (!active && !terminal) return [...turns];
  const withoutActive = turns.filter((turn) => !active || turn.id !== active.turnId);
  return terminal ? [...withoutActive, terminal].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)) : withoutActive;
}
