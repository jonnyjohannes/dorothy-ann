import { z } from "zod";

const envSchema = z.object({
  DOROTHY_FIXTURE_MODE: z.string().default("true").transform((value) => value !== "false"),
  ANTHROPIC_API_KEY: z.string().optional(), ANTHROPIC_MODEL: z.string().optional(), BRAVE_SEARCH_API_KEY: z.string().optional(),
  APP_PASSPHRASE_SCRYPT_HASH: z.string().optional(), SESSION_SIGNING_KEYS: z.string().optional(), LIMITER_KEY_SECRET: z.string().optional(), UPSTASH_REDIS_REST_URL: z.string().optional(), UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  RESEARCH_TARGET_VIABLE_PAGES: z.coerce.number().int().positive().default(3), MAX_SEARCH_RESULTS: z.coerce.number().int().positive().default(10),
  MAX_CONTEXT_CHARS: z.coerce.number().int().positive().default(120000), MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(4096), MAX_REQUEST_BYTES: z.coerce.number().int().positive().default(32_000), MAX_FETCH_BYTES: z.coerce.number().int().positive().default(2_000_000), MAX_REDIRECTS: z.coerce.number().int().nonnegative().default(5), MAX_EXTRACTED_CHARS_PER_PAGE: z.coerce.number().int().positive().default(20_000), EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
});
export type AppConfig = z.infer<typeof envSchema>;
export function loadConfig(environment: Record<string, string | undefined> = process.env): AppConfig { const parsed = envSchema.safeParse(environment); if (!parsed.success) throw new Error(`invalid configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`); return parsed.data; }
