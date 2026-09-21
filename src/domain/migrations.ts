import type { LegacyThreadInput, LegacyTurnInput } from "./legacy-input-schemas.js";
import type { CanonicalSource, LegacyArchiveDestinationRef, LegacyArchiveEntry, LegacyArchiveEntryId, SearchTurn, SourceId, Thread, ThreadId, ThreadSourceRecord } from "./types.js";
import { canonicalSourceV3Schema, messageIdSchema, threadIdSchema, threadV3Schema, turnIdSchema } from "./schemas.js";
import { normalizeCanonicalUrl } from "./identity-material.js";

export type LegacyMigrationIssueCode =
  | "invalid_thread"
  | "invalid_source"
  | "legacy_incomplete_dropped"
  | "legacy_entry_dropped"
  | "legacy_destination_dropped";
export interface LegacyMigrationIssue { code: LegacyMigrationIssueCode; originalIndex?: number }
export interface LegacyMigrationIdentities {
  sourceId(canonicalUrl: string): Promise<SourceId>;
  legacyArchiveEntryId(input: { threadId: ThreadId; originalIndex: number }): Promise<LegacyArchiveEntryId>;
}
export interface LegacyMigrationResult {
  thread: Thread | null;
  archivedLegacyEntries: number;
  droppedLegacyEntries: number;
  issues: LegacyMigrationIssue[];
}

const codePoints = (value: string) => [...value].length;
const canonicalTimestamp = (value: string) => new Date(value).toISOString();
const validScalarString = (value: string) => !/[\uD800-\uDFFF]/u.test(value);
const validRecordedRef = (value: string) => value === value.trim() && codePoints(value) >= 1 && codePoints(value) <= 200 && ![...value].some((character) => {
  const code = character.codePointAt(0) ?? 0;
  return code <= 0x1f || code === 0x7f;
});

interface MigratedSource {
  source: CanonicalSource;
  originalId: string;
  originalRank: number;
  originalIndex: number;
}
interface PendingItem {
  originalIndex: number;
  createdAt: string;
  sourceCandidates: MigratedSource[];
  build(destinations: LegacyArchiveDestinationRef[]): SearchTurn | LegacyArchiveEntry;
}

async function migrateSources(turn: LegacyTurnInput, identities: LegacyMigrationIdentities, issues: LegacyMigrationIssue[], originalIndex: number): Promise<MigratedSource[]> {
  const values = [...(turn.lookupResults ?? []), ...(turn.researchRun?.sources ?? [])];
  const migrated: MigratedSource[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    try {
      const canonicalUrl = normalizeCanonicalUrl(value.canonicalUrl);
      const sourceId = await identities.sourceId(canonicalUrl);
      const parsed = canonicalSourceV3Schema.safeParse({
        sourceId,
        title: value.title,
        url: value.url,
        canonicalUrl,
        displayUrl: value.displayUrl,
        snippet: value.snippet,
        publishedAt: value.publishedAt ? new Date(value.publishedAt).toISOString() : undefined,
      });
      if (!parsed.success) throw new Error("invalid_source");
      migrated.push({ source: parsed.data, originalId: value.sourceId, originalRank: value.rank, originalIndex: index });
    } catch {
      issues.push({ code: "invalid_source", originalIndex });
    }
  }
  return migrated;
}

function selectDestinations(sources: MigratedSource[], issues: LegacyMigrationIssue[], originalIndex: number): { refs: LegacyArchiveDestinationRef[]; records: CanonicalSource[] } {
  const sorted = [...sources].sort((left, right) => left.originalRank - right.originalRank || left.originalIndex - right.originalIndex);
  const refs: LegacyArchiveDestinationRef[] = [];
  const records: CanonicalSource[] = [];
  const sourceIds = new Set<string>();
  const ranks = new Set<number>();
  for (const candidate of sorted) {
    if (refs.length >= 10 || candidate.originalRank < 1 || candidate.originalRank > 10 || ranks.has(candidate.originalRank)) {
      issues.push({ code: "legacy_destination_dropped", originalIndex });
      continue;
    }
    if (sourceIds.has(candidate.source.sourceId)) {
      issues.push({ code: "legacy_destination_dropped", originalIndex });
      continue;
    }
    sourceIds.add(candidate.source.sourceId);
    ranks.add(candidate.originalRank);
    const legacyCitationId = codePoints(candidate.originalId) <= 256 ? candidate.originalId : undefined;
    if (!legacyCitationId) issues.push({ code: "legacy_destination_dropped", originalIndex });
    refs.push({ sourceId: candidate.source.sourceId, rank: candidate.originalRank, legacyCitationId });
    records.push(candidate.source);
  }
  const aliases = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const ref of refs) {
    if (!ref.legacyCitationId) continue;
    const previous = aliases.get(ref.legacyCitationId);
    if (previous && previous !== ref.sourceId) ambiguous.add(ref.legacyCitationId);
    else aliases.set(ref.legacyCitationId, ref.sourceId);
  }
  for (const ref of refs) if (ref.legacyCitationId && ambiguous.has(ref.legacyCitationId)) {
    delete ref.legacyCitationId;
    issues.push({ code: "legacy_destination_dropped", originalIndex });
  }
  return { refs, records };
}

function archiveMarkdown(turn: LegacyTurnInput): string | undefined {
  if (!turn.assistantMessage) return undefined;
  const value = turn.assistantMessage.content.parts.map((part) => part.type === "text" ? part.markdown : `[[cite:${part.sourceId}]]`).join("");
  return value && codePoints(value) <= 64_000 && validScalarString(value) ? value : undefined;
}

export async function migrateLegacyThread(input: LegacyThreadInput, identities: LegacyMigrationIdentities): Promise<LegacyMigrationResult> {
  const issues: LegacyMigrationIssue[] = [];
  const parsedThreadId = threadIdSchema.safeParse(input.id);
  if (!parsedThreadId.success || codePoints(input.title) < 1 || codePoints(input.title) > 120 || input.turns.length > 1_000_001) {
    return { thread: null, archivedLegacyEntries: 0, droppedLegacyEntries: input.turns.length, issues: [{ code: "invalid_thread" }] };
  }
  const threadId = parsedThreadId.data;
  const pending: PendingItem[] = [];
  let droppedLegacyEntries = 0;

  for (let originalIndex = 0; originalIndex < input.turns.length; originalIndex += 1) {
    const turn = input.turns[originalIndex];
    if (turn.status === "pending" || turn.status === "running") {
      droppedLegacyEntries += 1;
      issues.push({ code: "legacy_incomplete_dropped", originalIndex });
      continue;
    }
    const sourceCandidates = await migrateSources(turn, identities, issues, originalIndex);
    const lookupCandidate = turn.status === "completed" && turn.lookupResults !== undefined && !turn.assistantMessage && !turn.researchRun
      && turnIdSchema.safeParse(turn.id).success && messageIdSchema.safeParse(turn.userMessage.id).success && validRecordedRef(input.searchRef);
    if (lookupCandidate && (turn.lookupResults?.length === 0 || sourceCandidates.length > 0)) {
      pending.push({
        originalIndex,
        createdAt: canonicalTimestamp(turn.createdAt),
        sourceCandidates,
        build: (destinations) => ({
          id: turn.id as SearchTurn["id"],
          kind: "search",
          status: "completed",
          createdAt: canonicalTimestamp(turn.createdAt) as SearchTurn["createdAt"],
          finishedAt: canonicalTimestamp(turn.updatedAt) as SearchTurn["finishedAt"],
          userMessage: { ...turn.userMessage, id: turn.userMessage.id as SearchTurn["userMessage"]["id"], createdAt: canonicalTimestamp(turn.userMessage.createdAt) as SearchTurn["userMessage"]["createdAt"] },
          execution: { kind: "recorded", searchRef: input.searchRef },
          result: destinations.length > 0 ? { completion: "results", resultKind: "link", destinations: destinations.map(({ sourceId, rank }) => ({ sourceId, rank })) as [LegacyArchiveDestinationRef, ...LegacyArchiveDestinationRef[]] } : { completion: "empty", resultKind: "link", destinations: [] },
        }),
      });
      continue;
    }

    const request = turn.userMessage.content;
    const answerMarkdown = archiveMarkdown(turn);
    const statusMessage = turn.status === "failed" ? "Legacy attempt failed." : turn.status === "interrupted" ? "Legacy attempt was interrupted." : (!answerMarkdown && turn.lookupResults && turn.lookupResults.length > 0 ? "Legacy search results could not be migrated." : undefined);
    if (!validScalarString(request) || codePoints(request) < 1 || codePoints(request) > 2_000 || (!answerMarkdown && !statusMessage)) {
      droppedLegacyEntries += 1;
      issues.push({ code: "legacy_entry_dropped", originalIndex });
      continue;
    }
    const archiveId = await identities.legacyArchiveEntryId({ threadId, originalIndex });
    const legacyStatus = turn.status as LegacyArchiveEntry["legacyStatus"];
    pending.push({
      originalIndex,
      createdAt: canonicalTimestamp(turn.createdAt),
      sourceCandidates,
      build: (destinations) => ({ id: archiveId, originalIndex, legacyKind: turn.mode, legacyStatus, createdAt: canonicalTimestamp(turn.createdAt) as LegacyArchiveEntry["createdAt"], finishedAt: canonicalTimestamp(turn.updatedAt) as LegacyArchiveEntry["finishedAt"], request, answerMarkdown, statusMessage, destinations }),
    });
  }

  const archiveCount = pending.filter((item) => !turnIdSchema.safeParse(input.turns[item.originalIndex]?.id).success || item.build([]).id.toString().startsWith("legacy_")).length;
  if (archiveCount > 256) return { thread: null, archivedLegacyEntries: 0, droppedLegacyEntries: input.turns.length, issues: [...issues, { code: "invalid_thread" }] };

  pending.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.originalIndex - right.originalIndex);
  const sourceById = new Map<string, ThreadSourceRecord>();
  const turns: SearchTurn[] = [];
  const legacyArchive: LegacyArchiveEntry[] = [];
  for (const item of pending) {
    const { refs, records } = selectDestinations(item.sourceCandidates, issues, item.originalIndex);
    for (const record of records) if (!sourceById.has(record.sourceId)) sourceById.set(record.sourceId, { ...record, kind: "link", ordinal: sourceById.size + 1 });
    const built = item.build(refs);
    if (built.id.toString().startsWith("legacy_")) legacyArchive.push(built as LegacyArchiveEntry);
    else turns.push(built as SearchTurn);
  }
  turns.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  legacyArchive.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  if (turns.length === 0 && legacyArchive.length === 0) return { thread: null, archivedLegacyEntries: 0, droppedLegacyEntries, issues: [...issues, { code: "invalid_thread" }] };
  const candidate = {
    schemaVersion: 3 as const,
    id: threadId,
    title: input.title,
    createdAt: canonicalTimestamp(input.createdAt),
    updatedAt: canonicalTimestamp(input.updatedAt),
    sources: [...sourceById.values()],
    turns,
    legacyArchive,
  };
  const parsed = threadV3Schema.safeParse(candidate);
  if (!parsed.success) return { thread: null, archivedLegacyEntries: 0, droppedLegacyEntries: input.turns.length, issues: [...issues, { code: "invalid_thread" }] };
  return { thread: parsed.data, archivedLegacyEntries: legacyArchive.length, droppedLegacyEntries, issues };
}
