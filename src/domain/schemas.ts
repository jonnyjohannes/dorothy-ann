import { z } from "zod";

const id = z.string().min(1);
const timestamp = z.string().datetime({ offset: true });
export const searchResultSchema = z.object({ sourceId: id, rank: z.number().int().positive(), title: z.string(), url: z.string().url(), canonicalUrl: z.string().url(), displayUrl: z.string(), snippet: z.string().optional(), publishedAt: timestamp.optional() });
export const extractedPageSchema = z.object({ sourceId: id, canonicalUrl: z.string().url(), title: z.string().optional(), text: z.string().max(20_000), extractedAt: timestamp, characterCount: z.number().int().nonnegative() });
export const threadBackupSchema = z.object({ backupVersion: z.literal(1), exportedAt: timestamp, threads: z.array(z.object({ schemaVersion: z.literal(1), thread: z.unknown() })) });
export const lookupRequestSchema = z.object({ query: z.string().trim().min(1).max(2_000) });
export const passphraseRequestSchema = z.object({ passphrase: z.string().min(1).max(512) });
export function parseLookupRequest(value: unknown) { return lookupRequestSchema.parse(value); }
export function parsePassphraseRequest(value: unknown) { return passphraseRequestSchema.parse(value); }
