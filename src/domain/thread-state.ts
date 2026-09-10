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

export function renderThreadScrollback(thread: Thread): { markdown: string; filename: string; sourceUpdatedAt: IsoTimestamp } {
  const lines: string[] = [];
  thread.turns.forEach((turn, index) => {
    if (index > 0) lines.push("", "---", "");
    lines.push(`> ${turn.userMessage.content}`);
    if (turn.researchRun?.sources.length) {
      lines.push("");
      for (const source of turn.researchRun.sources) lines.push(`- [${source.title}](${source.url}) — ${source.snippet ?? source.displayUrl}`);
    }
    if (turn.assistantMessage) lines.push("", turn.assistantMessage.content.parts.map((part) => part.type === "text" ? part.markdown : `[[cite:${part.sourceId}]]`).join(""));
    if (turn.failure) lines.push("", `> ${turn.status}: ${turn.failure.message}`);
    if (index === thread.turns.length - 1 && !turn.assistantMessage && !turn.failure) lines.push("", `> ${turn.status}`);
  });
  return { markdown: `${lines.join("\n")}\n`, filename: `${thread.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dorothy-ann-topic"}.md`, sourceUpdatedAt: thread.updatedAt };
}
