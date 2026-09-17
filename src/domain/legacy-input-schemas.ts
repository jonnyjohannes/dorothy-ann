import { z } from "zod";

const boundedString = (maximum: number) => z.string().max(maximum);
const id = z.string().min(1).max(256);
const timestamp = z.string().datetime({ offset: true });
const source = z.strictObject({
  sourceId: id,
  rank: z.number().int().positive().max(1_000),
  title: boundedString(2_000),
  url: boundedString(8_192),
  canonicalUrl: boundedString(8_192),
  displayUrl: boundedString(2_048),
  snippet: boundedString(8_000).optional(),
  publishedAt: timestamp.optional(),
});
const extractedPage = z.strictObject({
  sourceId: id,
  canonicalUrl: boundedString(8_192),
  title: boundedString(2_000).optional(),
  text: boundedString(100_000),
  extractedAt: timestamp,
  characterCount: z.number().int().nonnegative(),
});
const extractionOutcome = z.union([
  z.strictObject({ sourceId: id, status: z.literal("viable"), page: extractedPage }),
  z.strictObject({ sourceId: id, status: z.literal("skipped"), reason: z.enum(["duplicate", "unsafe_url", "blocked", "unsupported_content", "empty_content", "limit_reached"]) }),
  z.strictObject({ sourceId: id, status: z.literal("failed"), code: z.enum(["fetch_failed", "timeout", "extract_failed"]), retryable: z.boolean() }),
]);
const failure = z.strictObject({
  stage: z.enum(["search", "extraction", "synthesis", "chat", "report"]),
  code: boundedString(256),
  message: boundedString(4_000),
  retryable: z.boolean(),
  occurredAt: timestamp,
});
const query = z.strictObject({
  query: boundedString(2_000),
  purpose: boundedString(1_000),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
const decision = z.union([
  z.strictObject({ status: z.literal("ready"), queries: z.tuple([]) }),
  z.strictObject({ status: z.literal("needs_more_research"), guidance: boundedString(2_000), queries: z.array(query).min(1).max(3) }),
]);
const researchRun = z.strictObject({
  id,
  origin: z.enum(["search", "promoted_lookup"]),
  status: z.enum(["searching", "extracting", "ready", "partial", "insufficient_evidence", "synthesizing", "completed", "failed", "interrupted"]),
  queries: z.array(boundedString(2_000)).max(10),
  generatedQueries: z.array(query).max(3).optional(),
  planner: decision.optional(),
  guidance: boundedString(2_000).optional(),
  lookupId: id.optional(),
  targetViablePages: z.number().int().positive().max(100),
  sources: z.array(source).max(100),
  extractions: z.array(extractionOutcome).max(100),
  evidenceSourceIds: z.array(id).max(100),
  startedAt: timestamp,
  updatedAt: timestamp,
  completedAt: timestamp.optional(),
  failure: failure.optional(),
});
const assistantPart = z.union([
  z.strictObject({ type: z.literal("text"), markdown: boundedString(128_000) }),
  z.strictObject({ type: z.literal("citation"), sourceId: id }),
]);
const assistantMessage = z.strictObject({
  id,
  role: z.literal("assistant"),
  content: z.strictObject({ parts: z.array(assistantPart).max(1_024) }),
  createdAt: timestamp,
  usage: z.strictObject({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    searches: z.number().int().nonnegative().optional(),
    extractedPages: z.number().int().nonnegative().optional(),
    estimatedCostUsd: z.number().finite().nonnegative().optional(),
  }).optional(),
});
const userMessage = z.strictObject({
  id,
  role: z.literal("user"),
  content: boundedString(128_000),
  createdAt: timestamp,
});
export const legacyTurnInputSchema = z.strictObject({
  id,
  mode: z.enum(["chat", "research"]),
  status: z.enum(["pending", "running", "completed", "failed", "interrupted"]),
  createdAt: timestamp,
  updatedAt: timestamp,
  userMessage,
  assistantMessage: assistantMessage.optional(),
  lookupResults: z.array(source).max(100).optional(),
  researchRun: researchRun.optional(),
  failure: failure.optional(),
});
export const legacyThreadInputSchema = z.strictObject({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  id,
  title: boundedString(2_000),
  createdAt: timestamp,
  updatedAt: timestamp,
  modelRef: boundedString(1_000),
  searchRef: boundedString(1_000),
  turns: z.array(legacyTurnInputSchema).max(1_024),
});
export const legacyStoredThreadInputSchema = z.union([
  z.strictObject({ schemaVersion: z.literal(1), thread: legacyThreadInputSchema }),
  z.strictObject({
    schemaVersion: z.literal(2),
    thread: legacyThreadInputSchema,
    lastMeaningfulActivityAt: timestamp,
    expiresAt: timestamp,
  }),
]);

export type LegacyThreadInput = z.infer<typeof legacyThreadInputSchema>;
export type LegacyTurnInput = z.infer<typeof legacyTurnInputSchema>;
