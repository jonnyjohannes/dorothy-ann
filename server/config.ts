import { z } from "zod";

const envSchema = z.object({
  DOROTHY_FIXTURE_MODE: z.string().default("true").transform((value) => value !== "false"),
  ANTHROPIC_API_KEY: z.string().optional(), ANTHROPIC_MODEL: z.string().optional(), BRAVE_SEARCH_API_KEY: z.string().optional(),
  APP_PASSPHRASE_SCRYPT_HASH: z.string().optional(), SESSION_SIGNING_KEYS: z.string().optional(), LIMITER_KEY_SECRET: z.string().optional(),
  RESEARCH_TARGET_VIABLE_PAGES: z.coerce.number().int().positive().default(3), MAX_SEARCH_RESULTS: z.coerce.number().int().positive().default(10),
  MAX_CONTEXT_CHARS: z.coerce.number().int().positive().default(120000), MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(4096),
});
export type AppConfig = z.infer<typeof envSchema>;
export function loadConfig(environment: Record<string, string | undefined> = process.env): AppConfig { const parsed = envSchema.safeParse(environment); if (!parsed.success) throw new Error(`invalid configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`); return parsed.data; }
