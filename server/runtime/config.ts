import { z } from "zod";

const optionalString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().optional(),
);
const optionalRef = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).max(200).optional(),
);
const optionalPositiveInt = (maximum: number) => z.preprocess(
  (value) => value === undefined || value === "" ? undefined : value,
  z.coerce.number().int().min(1).max(maximum).optional(),
);
const optionalIntRange = (minimum: number, maximum: number) => z.preprocess(
  (value) => value === undefined || value === "" ? undefined : value,
  z.coerce.number().int().min(minimum).max(maximum).optional(),
);
const optionalNonNegativeInt = (maximum: number) => z.preprocess(
  (value) => value === undefined || value === "" ? undefined : value,
  z.coerce.number().int().min(0).max(maximum).optional(),
);

const environmentSchema = z.object({
  DOROTHY_FIXTURE_MODE: z.string().default("true").transform((value) => value !== "false"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
  RESEARCH_TIMING_LOGS: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_ASSESSMENT_MODEL: optionalRef,
  ANTHROPIC_SYNTHESIS_MODEL: optionalRef,
  ANTHROPIC_MODEL: optionalRef,
  ANTHROPIC_WORKSPACE_ID: optionalString,
  BRAVE_SEARCH_API_KEY: optionalString,
  APP_PASSPHRASE_SCRYPT_HASH: optionalString,
  SESSION_SIGNING_KEYS: optionalString,
  LIMITER_KEY_SECRET: optionalString,
  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,

  MAX_SEARCH_RESULTS: optionalPositiveInt(10),
  MAX_CONCURRENT_SEARCHES: optionalPositiveInt(3),
  MAX_CONCURRENT_EXTRACTIONS: optionalPositiveInt(3),
  EXTRACTION_TIMEOUT_MS: optionalPositiveInt(8_000),
  MAX_EXTRACTED_CHARS_PER_PAGE: optionalPositiveInt(20_000),
  MAX_EVIDENCE_CHARS_PER_SOURCE: optionalPositiveInt(4_000),
  MAX_EVIDENCE_CHARS_TOTAL: optionalPositiveInt(48_000),
  MAX_THREAD_CONTEXT_TURNS: optionalPositiveInt(8),
  MAX_THREAD_CONTEXT_CHARS: optionalPositiveInt(24_000),
  MAX_ASSESSMENT_OUTPUT_TOKENS: optionalPositiveInt(800),
  MAX_ASSESSMENT_RETRY_OUTPUT_TOKENS: optionalIntRange(800, 1_600),
  MAX_OUTPUT_TOKENS: optionalPositiveInt(4_096),
  MAX_TURN_REQUEST_BYTES: z.preprocess(
    (value) => value === undefined || value === "" ? undefined : value,
    z.coerce.number().int().min(8_000).max(128_000).optional(),
  ),

  MAX_FETCH_BYTES: optionalPositiveInt(2_000_000),
  MAX_REDIRECTS: optionalNonNegativeInt(5),

  // Transitional inputs read only to preserve current routes until their cutover.
  RESEARCH_TARGET_VIABLE_PAGES: optionalPositiveInt(3),
  MAX_KNOWN_SOURCES: optionalPositiveInt(200),
  MAX_EXTRACTION_CANDIDATES: optionalPositiveInt(8),
  EXTRACTION_CONCURRENCY: optionalPositiveInt(Number.MAX_SAFE_INTEGER),
  MAX_EXTRACTED_CHARS_TOTAL: optionalPositiveInt(Number.MAX_SAFE_INTEGER),
  MAX_CONTEXT_CHARS: optionalPositiveInt(Number.MAX_SAFE_INTEGER),
  MAX_REQUEST_BYTES: z.preprocess(
    (value) => value === undefined || value === "" ? undefined : value,
    z.coerce.number().int().min(8_000).max(Number.MAX_SAFE_INTEGER).optional(),
  ),
});

type ParsedEnvironment = z.infer<typeof environmentSchema>;

export interface AppConfig {
  DOROTHY_FIXTURE_MODE: boolean;
  LOG_LEVEL: "debug" | "info" | "warn" | "error" | "silent";
  RESEARCH_TIMING_LOGS: boolean;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_ASSESSMENT_MODEL?: string;
  ANTHROPIC_SYNTHESIS_MODEL?: string;
  ANTHROPIC_WORKSPACE_ID?: string;
  BRAVE_SEARCH_API_KEY?: string;
  APP_PASSPHRASE_SCRYPT_HASH?: string;
  SESSION_SIGNING_KEYS?: string;
  LIMITER_KEY_SECRET?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;

  MAX_SEARCH_RESULTS: number;
  MAX_CONCURRENT_SEARCHES: number;
  MAX_CONCURRENT_EXTRACTIONS: number;
  EXTRACTION_TIMEOUT_MS: number;
  MAX_EXTRACTED_CHARS_PER_PAGE: number;
  MAX_EVIDENCE_CHARS_PER_SOURCE: number;
  MAX_EVIDENCE_CHARS_TOTAL: number;
  MAX_THREAD_CONTEXT_TURNS: number;
  MAX_THREAD_CONTEXT_CHARS: number;
  MAX_ASSESSMENT_OUTPUT_TOKENS: number;
  MAX_ASSESSMENT_RETRY_OUTPUT_TOKENS: number;
  MAX_OUTPUT_TOKENS: number;
  MAX_TURN_REQUEST_BYTES: number;

  // Existing adapters consume these until their owning ledger slices migrate.
  MAX_REQUEST_BYTES: number;
  MAX_FETCH_BYTES: number;
  MAX_REDIRECTS: number;
}

export interface LoadConfigOptions {
  onDeprecation?: (message: string) => void;
}

const warn = (name: string, reporter: (message: string) => void) => {
  reporter(`deprecated configuration: ${name}`);
};

function canonicalOrLegacy(
  environment: Record<string, string | undefined>,
  parsed: ParsedEnvironment,
  canonicalName: "MAX_CONCURRENT_EXTRACTIONS" | "MAX_EVIDENCE_CHARS_TOTAL" | "MAX_THREAD_CONTEXT_CHARS" | "MAX_TURN_REQUEST_BYTES",
  legacyName: "EXTRACTION_CONCURRENCY" | "MAX_EXTRACTED_CHARS_TOTAL" | "MAX_CONTEXT_CHARS" | "MAX_REQUEST_BYTES",
  defaultValue: number,
  maximum: number,
  reporter: (message: string) => void,
): number {
  const canonical = parsed[canonicalName];
  const legacy = parsed[legacyName];
  if (environment[legacyName] !== undefined && environment[legacyName] !== "") warn(legacyName, reporter);
  if (canonical !== undefined) return canonical;
  return legacy === undefined ? defaultValue : Math.min(legacy, maximum);
}

export function loadConfig(
  environment: Record<string, string | undefined> = process.env,
  options: LoadConfigOptions = {},
): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "environment"))];
    throw new Error(`invalid configuration: ${fields.join(", ")}`);
  }

  const parsed = result.data;
  const reporter = options.onDeprecation ?? ((message: string) => console.warn(message));
  const legacyModelPresent = environment.ANTHROPIC_MODEL !== undefined && environment.ANTHROPIC_MODEL !== "";
  const assessmentModel = parsed.ANTHROPIC_ASSESSMENT_MODEL ?? parsed.ANTHROPIC_MODEL;
  const synthesisModel = parsed.ANTHROPIC_SYNTHESIS_MODEL ?? parsed.ANTHROPIC_MODEL;
  if (legacyModelPresent) warn("ANTHROPIC_MODEL", reporter);

  const maxEvidenceCharsTotal = canonicalOrLegacy(
    environment,
    parsed,
    "MAX_EVIDENCE_CHARS_TOTAL",
    "MAX_EXTRACTED_CHARS_TOTAL",
    48_000,
    48_000,
    reporter,
  );
  const maxEvidenceCharsPerSource = parsed.MAX_EVIDENCE_CHARS_PER_SOURCE ?? 4_000;
  if (maxEvidenceCharsPerSource > maxEvidenceCharsTotal) {
    throw new Error("invalid configuration: MAX_EVIDENCE_CHARS_PER_SOURCE");
  }

  return {
    DOROTHY_FIXTURE_MODE: parsed.DOROTHY_FIXTURE_MODE,
    LOG_LEVEL: parsed.LOG_LEVEL,
    RESEARCH_TIMING_LOGS: parsed.RESEARCH_TIMING_LOGS,
    ANTHROPIC_API_KEY: parsed.ANTHROPIC_API_KEY,
    ANTHROPIC_ASSESSMENT_MODEL: assessmentModel,
    ANTHROPIC_SYNTHESIS_MODEL: synthesisModel,
    ANTHROPIC_WORKSPACE_ID: parsed.ANTHROPIC_WORKSPACE_ID,
    BRAVE_SEARCH_API_KEY: parsed.BRAVE_SEARCH_API_KEY,
    APP_PASSPHRASE_SCRYPT_HASH: parsed.APP_PASSPHRASE_SCRYPT_HASH,
    SESSION_SIGNING_KEYS: parsed.SESSION_SIGNING_KEYS,
    LIMITER_KEY_SECRET: parsed.LIMITER_KEY_SECRET,
    UPSTASH_REDIS_REST_URL: parsed.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: parsed.UPSTASH_REDIS_REST_TOKEN,
    MAX_SEARCH_RESULTS: parsed.MAX_SEARCH_RESULTS ?? 10,
    MAX_CONCURRENT_SEARCHES: parsed.MAX_CONCURRENT_SEARCHES ?? 3,
    MAX_CONCURRENT_EXTRACTIONS: canonicalOrLegacy(environment, parsed, "MAX_CONCURRENT_EXTRACTIONS", "EXTRACTION_CONCURRENCY", 3, 3, reporter),
    EXTRACTION_TIMEOUT_MS: parsed.EXTRACTION_TIMEOUT_MS ?? 8_000,
    MAX_EXTRACTED_CHARS_PER_PAGE: parsed.MAX_EXTRACTED_CHARS_PER_PAGE ?? 20_000,
    MAX_EVIDENCE_CHARS_PER_SOURCE: maxEvidenceCharsPerSource,
    MAX_EVIDENCE_CHARS_TOTAL: maxEvidenceCharsTotal,
    MAX_THREAD_CONTEXT_TURNS: parsed.MAX_THREAD_CONTEXT_TURNS ?? 8,
    MAX_THREAD_CONTEXT_CHARS: canonicalOrLegacy(environment, parsed, "MAX_THREAD_CONTEXT_CHARS", "MAX_CONTEXT_CHARS", 24_000, 24_000, reporter),
    MAX_ASSESSMENT_OUTPUT_TOKENS: parsed.MAX_ASSESSMENT_OUTPUT_TOKENS ?? 800,
    MAX_ASSESSMENT_RETRY_OUTPUT_TOKENS: parsed.MAX_ASSESSMENT_RETRY_OUTPUT_TOKENS ?? 1_600,
    MAX_OUTPUT_TOKENS: parsed.MAX_OUTPUT_TOKENS ?? 4_096,
    MAX_TURN_REQUEST_BYTES: canonicalOrLegacy(environment, parsed, "MAX_TURN_REQUEST_BYTES", "MAX_REQUEST_BYTES", 128_000, 128_000, reporter),
    MAX_REQUEST_BYTES: Math.min(parsed.MAX_REQUEST_BYTES ?? 32_000, 128_000),
    MAX_FETCH_BYTES: parsed.MAX_FETCH_BYTES ?? 2_000_000,
    MAX_REDIRECTS: parsed.MAX_REDIRECTS ?? 5,
  };
}
