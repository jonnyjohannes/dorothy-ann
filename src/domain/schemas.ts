import { z } from "zod";

const id = z.string().min(1);
const timestamp = z.string().datetime({ offset: true });
export const searchResultSchema = z.object({ sourceId: id, rank: z.number().int().positive(), title: z.string(), url: z.string().url(), canonicalUrl: z.string().url(), displayUrl: z.string(), snippet: z.string().optional(), publishedAt: timestamp.optional() });
export const extractedPageSchema = z.object({ sourceId: id, canonicalUrl: z.string().url(), title: z.string().optional(), text: z.string().max(20_000), extractedAt: timestamp, characterCount: z.number().int().nonnegative() });
const usageSchema = z.object({ inputTokens: z.number().nonnegative().optional(), outputTokens: z.number().nonnegative().optional(), searches: z.number().nonnegative().optional(), extractedPages: z.number().nonnegative().optional(), estimatedCostUsd: z.number().nonnegative().optional() });
const failureSchema = z.object({ stage: z.enum(["search", "extraction", "synthesis", "chat", "report"]), code: z.string(), message: z.string(), retryable: z.boolean(), occurredAt: timestamp });
const outcomeSchema = z.union([
  z.object({ sourceId: id, status: z.literal("viable"), page: extractedPageSchema }),
  z.object({ sourceId: id, status: z.literal("skipped"), reason: z.enum(["duplicate", "unsafe_url", "blocked", "unsupported_content", "empty_content", "limit_reached"]) }),
  z.object({ sourceId: id, status: z.literal("failed"), code: z.enum(["fetch_failed", "timeout", "extract_failed"]), retryable: z.boolean() }),
]);
const assistantPartSchema = z.union([z.object({ type: z.literal("text"), markdown: z.string() }), z.object({ type: z.literal("citation"), sourceId: id })]);
const assistantSchema = z.object({ id, role: z.literal("assistant"), content: z.object({ parts: z.array(assistantPartSchema) }), createdAt: timestamp, usage: usageSchema.optional() });
const userSchema = z.object({ id, role: z.literal("user"), content: z.string(), createdAt: timestamp });
const researchQuerySchema = z.object({ query: z.string().trim().min(1).max(500), purpose: z.string().trim().min(1).max(240), priority: z.union([z.literal(1), z.literal(2), z.literal(3)]) });
export const researchDecisionSchema = z.union([z.object({ status: z.literal("ready"), queries: z.tuple([]) }), z.object({ status: z.literal("needs_more_research"), guidance: z.string().trim().min(1).max(500), queries: z.array(researchQuerySchema).min(1).max(3) })]);
const researchRunSchema = z.object({ id, origin: z.enum(["search", "promoted_lookup"]), status: z.enum(["searching", "extracting", "ready", "partial", "insufficient_evidence", "synthesizing", "completed", "failed", "interrupted"]), queries: z.array(z.string()), generatedQueries: z.array(researchQuerySchema).max(3).optional(), planner: researchDecisionSchema.optional(), guidance: z.string().max(500).optional(), lookupId: id.optional(), targetViablePages: z.number().int().positive(), sources: z.array(searchResultSchema), extractions: z.array(outcomeSchema), evidenceSourceIds: z.array(id), startedAt: timestamp, updatedAt: timestamp, completedAt: timestamp.optional(), failure: failureSchema.optional() });
const turnSchema = z.object({ id, mode: z.enum(["chat", "research"]), status: z.enum(["pending", "running", "completed", "failed", "interrupted"]), createdAt: timestamp, updatedAt: timestamp, userMessage: userSchema, assistantMessage: assistantSchema.optional(), lookupResults: z.array(searchResultSchema).optional(), researchRun: researchRunSchema.optional(), failure: failureSchema.optional() });
export const threadSchema = z.object({ schemaVersion: z.union([z.literal(1), z.literal(2)]), id, title: z.string(), createdAt: timestamp, updatedAt: timestamp, modelRef: z.string(), searchRef: z.string(), turns: z.array(turnSchema) });
export const threadEnvelopeV2Schema = z.object({ schemaVersion: z.literal(2), thread: threadSchema, lastMeaningfulActivityAt: timestamp, expiresAt: timestamp });
export const threadBackupSchema = z.object({ backupVersion: z.union([z.literal(1), z.literal(2)]), exportedAt: timestamp, threads: z.array(z.object({ schemaVersion: z.union([z.literal(1), z.literal(2)]), thread: z.unknown(), lastMeaningfulActivityAt: timestamp.optional(), expiresAt: timestamp.optional() })) });
export const lookupRequestSchema = z.object({ query: z.string().trim().min(1).max(2_000) });
export const passphraseRequestSchema = z.object({ passphrase: z.string().min(1).max(512) });
export function parseLookupRequest(value: unknown) { return lookupRequestSchema.parse(value); }
export function parsePassphraseRequest(value: unknown) { return passphraseRequestSchema.parse(value); }
