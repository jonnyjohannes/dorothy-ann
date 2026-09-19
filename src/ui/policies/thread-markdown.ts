import type { CanonicalSource, Thread, Turn } from "../../domain/types";

function sourceId(value: { sourceId: string }): string { return String(value.sourceId); }
function markdownLabel(value: string): string { return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]"); }

function rawCitationIds(markdown: string): string[] {
  return [...markdown.matchAll(/\[{1,2}cite:([A-Za-z0-9_-]+)\]{1,2}/g)].map((match) => match[1]);
}
function referencedSourceIds(turn: Turn): string[] {
  if (turn.kind === "research" && turn.status === "completed") return turn.result.answer.parts.flatMap((part) => part.type === "citation" ? [sourceId(part)] : rawCitationIds(part.markdown));
  if (turn.kind === "search" && turn.status === "completed") return turn.result.destinations.map((destination) => sourceId(destination));
  return [];
}

function citationLink(id: string, numbers: Map<string, number>, sources: Map<string, CanonicalSource>): string | undefined {
  const source = sources.get(id);
  const number = numbers.get(id);
  return number && source ? `[${number}](${source.url})` : undefined;
}
function replaceRawCitations(markdown: string, numbers: Map<string, number>, sources: Map<string, CanonicalSource>): string {
  return markdown.replace(/\[{1,2}cite:([A-Za-z0-9_-]+)\]{1,2}/g, (marker, id: string) => citationLink(id, numbers, sources) ?? marker);
}

function answerMarkdown(turn: Extract<Turn, { kind: "research" }> & { status: "completed" }, numbers: Map<string, number>, sources: Map<string, CanonicalSource>): string {
  return turn.result.answer.parts.map((part) => {
    if (part.type === "text") return replaceRawCitations(part.markdown, numbers, sources);
    return citationLink(sourceId(part), numbers, sources) ?? `[${numbers.get(sourceId(part)) ?? "?"}]`;
  }).join("");
}

export function threadMarkdown(thread: Thread): string {
  const sources = new Map(thread.sources.map((source) => [sourceId(source), source]));
  const referenced = new Set(thread.turns.flatMap(referencedSourceIds));
  const orderedSources = thread.sources.filter((source) => referenced.has(sourceId(source))).sort((left, right) => left.ordinal - right.ordinal);
  const numbers = new Map(orderedSources.map((source, index) => [sourceId(source), index + 1]));
  const turns = thread.turns.map((turn) => {
    const answer = turn.kind === "research" && turn.status === "completed"
      ? answerMarkdown(turn, numbers, sources)
      : turn.status === "failed"
        ? turn.failure.message
        : turn.status === "interrupted"
          ? turn.interruption.message
          : turn.kind === "search" && turn.status === "completed"
            ? turn.result.destinations.map((destination) => {
              const source = sources.get(sourceId(destination));
              const number = numbers.get(sourceId(destination));
              return number && source ? `[${number}](${source.url})` : `[${number ?? "?"}]`;
            }).join(" ")
            : "";
    return `## ${turn.userMessage.content}\n\n${answer}`;
  });
  const sourceSection = orderedSources.length === 0 ? "" : `\n\n## Sources\n\n${orderedSources.map((source, index) => `${index + 1}. [${markdownLabel(source.title)}](${source.url})`).join("\n")}`;
  return `${turns.join("\n\n---\n\n")}${sourceSection}`;
}
