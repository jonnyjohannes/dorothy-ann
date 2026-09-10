import { threadEnvelopeV2Schema, threadSchema } from "./schemas";
import type { IsoTimestamp, StoredThreadEnvelopeV2, Thread } from "./types";

export const THREAD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function isValidThread(value: unknown): value is Thread {
  return threadSchema.safeParse(value).success;
}

export function isValidEnvelope(value: unknown): value is StoredThreadEnvelopeV2 {
  return threadEnvelopeV2Schema.safeParse(value).success;
}

export function expiryFor(activityAt: IsoTimestamp | string): IsoTimestamp {
  return new Date(new Date(activityAt).getTime() + THREAD_RETENTION_MS).toISOString() as IsoTimestamp;
}

export function isExpired(envelope: StoredThreadEnvelopeV2, at = new Date()): boolean {
  return new Date(envelope.expiresAt).getTime() <= at.getTime();
}

export function migrateThread(value: unknown): Thread | null {
  if (!isValidThread(value)) return null;
  return { ...value, schemaVersion: 2 };
}

export function renderThreadScrollback(thread: Thread, options: { includeSources?: boolean; citationTarget?: "evidence" | "source" } = {}): { markdown: string; filename: string; sourceUpdatedAt: IsoTimestamp } {
  const lines: string[] = [];
  const includeSources = options.includeSources ?? true;
  const citationTarget = options.citationTarget ?? "source";
  thread.turns.forEach((turn, index) => {
    if (index > 0) lines.push("", "---", "");
    lines.push(`> ${turn.userMessage.content}`);
    const sources = turn.researchRun?.sources ?? turn.lookupResults ?? [];
    const sourceById = new Map<string, { number: number; url: string }>(sources.map((source, sourceIndex) => [source.sourceId, { number: sourceIndex + 1, url: source.url }]));
    if (includeSources && sources.length) {
      lines.push("");
      for (const source of sources) lines.push(`- [${source.title}](${source.url}) — ${source.snippet ?? source.displayUrl}`);
    }
    if (turn.assistantMessage) {
      lines.push("", turn.assistantMessage.content.parts.map((part) => {
        if (part.type === "text") {
          return part.markdown.replace(/\[\[cite:([A-Za-z0-9_-]+)\]\]/g, (marker, sourceId: string) => {
            const source = sourceById.get(sourceId);
            if (!source) return marker;
            return citationTarget === "evidence" ? `[${source.number}](#source-${sourceId})` : `[${source.number}](${source.url})`;
          });
        }
        const source = sourceById.get(part.sourceId);
        if (!source) return "[?]";
        return citationTarget === "evidence" ? `[${source.number}](#source-${part.sourceId})` : `[${source.number}](${source.url})`;
      }).join(""));
    }
    if (turn.failure) lines.push("", `> ${turn.status}: ${turn.failure.message}`);
    if (index === thread.turns.length - 1 && !turn.assistantMessage && !turn.failure && turn.status !== "completed") lines.push("", `> ${turn.status}`);
  });
  return { markdown: `${lines.join("\n")}\n`, filename: `${thread.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dorothy-ann-topic"}.md`, sourceUpdatedAt: thread.updatedAt };
}
