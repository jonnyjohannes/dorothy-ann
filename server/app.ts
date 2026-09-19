import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Hono, type Context } from "hono";
import { InMemoryLoginLimiter, SessionAuth } from "./auth.js";
import { UpstashLoginLimiter } from "./limiter-upstash.js";
import type { LoginAttemptLimiter } from "../src/ports/auth.js";
import type { AppConfig } from "./runtime/config.js";
import type { SystemPromptCatalog } from "../src/ports/system-prompts.js";
import type { LLMProvider, ResearchAssessmentInput, ResearchAssessmentProposal, ResearchSynthesisInput } from "../src/ports/llm.js";
import type { SearchProvider } from "../src/ports/providers.js";
import type { AssistantContentPart, CanonicalSource, GapLedger, KnowledgeUnit, ResearchProblem, ResearchResolution, Turn, UserMessage } from "../src/domain/types.js";
import { IdentityPolicy } from "../src/application/identity-policy.js";
import { WebCryptoIdentityHasher } from "../src/infrastructure/identity/web-crypto-hasher.js";
import { BraveSearchProvider } from "../src/infrastructure/providers/brave.js";
import { SafeContentExtractor } from "../src/infrastructure/extraction/safe-content-extractor.js";
import type { ContentExtractor } from "../src/ports/extraction.js";
import { AnthropicProvider } from "../src/infrastructure/providers/anthropic.js";
import { EvidenceAcquirer } from "../src/application/evidence-acquirer.js";
import { ResearchAssessor } from "../src/application/research-assessor.js";
import { ResearchResolver } from "../src/application/research-resolver.js";
import { AnswerSynthesizer } from "../src/application/answer-synthesizer.js";
import { executeResearchTurn, type ResearchResolutionResult } from "../src/application/execute-research-turn.js";
import { executeSearchTurn } from "../src/application/execute-search-turn.js";
import { createPortableApp } from "../src/server/app.js";
import type { TurnExecutor, TurnExecutionRequest, TurnExecutionTerminal } from "../src/server/turn-stream-boundary.js";
import { createThreadStorageRoutes } from "../src/server/thread-storage-routes.js";
import type { ThreadStore } from "../src/ports/storage-v3.js";
import { jsonResearchTimingSink, ResearchTimingCollector, type ResearchTimingSink } from "./runtime/research-timing.js";

class UnavailableSearchProvider implements SearchProvider {
  async search(): Promise<import("../src/domain/types.js").SearchResult[]> { throw new Error("provider_unavailable"); }
}

class UnavailableLlmProvider implements LLMProvider {
  async assessResearch(): Promise<ResearchAssessmentProposal> { throw new Error("provider_unavailable"); }
  async *synthesizeResearch(): AsyncIterable<never> { yield* [] as never[]; throw new Error("provider_unavailable"); }
}

class FixtureSearchProvider implements SearchProvider {
  constructor(private readonly identities: IdentityPolicy) {}
  async search(query: string): Promise<import("../src/domain/types.js").SearchResult[]> {
    const canonicalUrl = "https://example.com/fixture";
    return [{ sourceId: await this.identities.sourceId(canonicalUrl), rank: 1, title: `Fixture result for ${query}`, url: canonicalUrl, canonicalUrl, displayUrl: "example.com/fixture", snippet: "A safe fixture result for local development." }];
  }
}

class FixtureLlmProvider implements LLMProvider {
  async assessResearch(input: ResearchAssessmentInput): Promise<ResearchAssessmentProposal> {
    const source = input.knowledge.evidence[0]?.sources[0] ?? input.problem.context.availableEvidence[0]?.sources[0];
    if (!source) return { directive: { kind: "search", query: input.problem.question, purpose: input.problem.purpose, successCriterion: input.problem.successCriterion, priority: 1 } };
    return { directive: { kind: "resolved", observations: [{ proposition: input.problem.question, statement: "Fixture evidence is available for this request.", stance: "supports", support: [{ type: "source", sourceId: source.sourceId }] }] } };
  }
  async *synthesizeResearch(input: ResearchSynthesisInput): AsyncIterable<AssistantContentPart> {
    const source = input.allowedSourceIds[0];
    yield { type: "text", markdown: "This is a bounded fixture answer grounded in the available evidence." };
    if (source) yield { type: "citation", sourceId: source };
  }
}

function emptyKnowledge(problemId: ResearchProblem["id"]): KnowledgeUnit { return { problemId, findings: [], evidence: [], unresolvedGapIds: [] }; }
function requestMessage(request: TurnExecutionRequest): UserMessage {
  const content = request.kind === "search" ? request.query : request.question;
  return { id: request.turnId as unknown as UserMessage["id"], role: "user", content, createdAt: new Date().toISOString() as UserMessage["createdAt"] };
}
function terminalFor(result: { turn: Turn; sources: CanonicalSource[] }): TurnExecutionTerminal {
  const { id, kind, createdAt, finishedAt, userMessage, ...outcome } = result.turn;
  void id; void createdAt; void finishedAt; void userMessage;
  return { kind, outcome: outcome as never, sourceRecords: result.sources } as TurnExecutionTerminal;
}

function createExecutor(
  config: AppConfig,
  prompts: SystemPromptCatalog,
  identities: IdentityPolicy,
  search: SearchProvider,
  llm: LLMProvider,
  extractor: ContentExtractor | undefined,
  researchTimingSink?: ResearchTimingSink,
): TurnExecutor {
  const assessor = new ResearchAssessor(identities);
  return {
    async execute(request, onSignal, signal) {
      if (request.kind === "search") {
        await onSignal({ type: "phase", phase: "searching" });
        const result = await executeSearchTurn({ turnId: request.turnId, userMessage: requestMessage(request), createdAt: new Date().toISOString() as never, provider: search, maxResults: request.maxResults, signal, searchRef: "brave" });
        if (result.sources.length) await onSignal({ type: "source_delta", sources: result.sources, occurrences: result.sources.map((source) => ({ sourceId: source.sourceId, role: "search_destination" as const, rank: result.turn.status === "completed" && result.turn.result.completion === "results" ? result.turn.result.destinations.find((destination) => destination.sourceId === source.sourceId)?.rank : undefined })) });
        return terminalFor(result);
      }

      const timing = researchTimingSink ? new ResearchTimingCollector(researchTimingSink) : undefined;
      let timingResolution: ResearchResolution | undefined;
      let timingLedger: GapLedger | undefined;
      let timingTerminalStatus: "completed" | "failed" | "interrupted" | "executor_error" = "executor_error";
      try {
        let lastPhase: string | undefined;
        const emitResearchPhase = async (phase: "searching" | "extracting" | "assessing" | "decomposing" | "recursing" | "resolving" | "synthesizing") => {
          if (phase === lastPhase) return;
          lastPhase = phase;
          await onSignal({ type: "phase", phase });
        };
        await emitResearchPhase("resolving");

        const timedSearch = timing?.decorateSearch(search) ?? search;
        const timedExtractor = extractor && timing ? timing.decorateExtractor(extractor) : extractor;
        const timedLlm = timing?.decorateLlm(llm) ?? llm;
        const acquirer = new EvidenceAcquirer({ search: timedSearch, extractor: timedExtractor, fixture: config.DOROTHY_FIXTURE_MODE });
        const resolver = new ResearchResolver({
          identities,
          assessor,
          acquirer,
          acquisitionLimits: { maxCandidatesPerSearch: config.MAX_SEARCH_RESULTS, maxSourcesPerRequest: 3, maxConcurrentSearches: config.MAX_CONCURRENT_SEARCHES, maxConcurrentExtractions: config.MAX_CONCURRENT_EXTRACTIONS, extractionMaxCharacters: config.MAX_EXTRACTED_CHARS_PER_PAGE, extractionTimeoutMs: config.EXTRACTION_TIMEOUT_MS },
          assess: (assessment) => timedLlm.assessResearch({ systemPrompt: prompts.assessor, problem: assessment.problem, knowledge: assessment.knowledge, ledger: assessment.ledger, budget: assessment.budget, allowedSupportRefs: assessment.allowedSupportRefs, maxOutputTokens: config.MAX_ASSESSMENT_OUTPUT_TOKENS, signal: assessment.signal }),
        });
        const synthesizer = new AnswerSynthesizer(timedLlm, prompts.synthesizer, config.MAX_OUTPUT_TOKENS);
        const phaseSynthesizer: Pick<AnswerSynthesizer, "synthesize"> = {
          synthesize: async (input) => {
            await emitResearchPhase("synthesizing");
            return synthesizer.synthesize(input);
          },
        };

        const context = request.context;
        const problemId = await identities.problemId({ turnId: request.turnId, question: request.question, purpose: "answer the user question", successCriterion: "provide a supported answer" });
        const problem: ResearchProblem = { id: problemId, question: request.question, purpose: "answer the user question", successCriterion: "provide a supported answer", context, depth: 0 };
        const resolveRoot = () => resolver.resolve({ turnId: request.turnId, problem, knowledge: emptyKnowledge(problemId), ledger: { gaps: [], assessmentsUsed: 0, searchesUsed: 0, sourcesConsumed: 0 }, budget: { searchesRemaining: 3, sourcesRemaining: 9, assessmentsRemaining: 8, depthRemaining: 2 }, signal, onPhase: emitResearchPhase });
        const root = timing ? await timing.measureResolution(resolveRoot) : await resolveRoot();
        timingLedger = root.kind === "resolution" ? root.resolution.ledger : root.checkpoint.ledger;
        if (root.kind === "resolution") timingResolution = root.resolution;
        const resolution = root.kind === "resolution" ? root.resolution : { checkpoint: root.checkpoint };
        if (root.kind === "resolution") {
          // Canonical source metadata is carried by the terminal/source delta contract;
          // keep the live resolution state focused on the validated research shape.
          const { sources: _sources, ...streamResolution } = root.resolution;
          void _sources;
          await onSignal({ type: "research_state", state: { kind: "resolution", resolution: streamResolution } });
        } else {
          await onSignal({ type: "research_state", state: { kind: "checkpoint", checkpoint: root.checkpoint } });
        }
        const result = await executeResearchTurn({ turnId: request.turnId, userMessage: requestMessage(request), createdAt: new Date().toISOString() as never, context, answerPosition: request.answerPosition, resolver: { resolve: async () => resolution as ResearchResolutionResult }, synthesizer: phaseSynthesizer, assessmentModelRef: "assessment", synthesisModelRef: "synthesis", searchRef: "brave", signal });
        timingTerminalStatus = result.turn.status;
        if (result.turn.status === "completed") {
          let firstAnswer = true;
          for (const part of result.turn.result.answer.parts) if (part.type === "text") {
            if (firstAnswer) {
              timing?.markFirstAnswerSignal();
              firstAnswer = false;
            }
            await onSignal({ type: "answer_delta", delta: part.markdown });
          }
        }
        return terminalFor(result);
      } finally {
        timing?.emit({
          terminalStatus: timingTerminalStatus,
          answerPosition: request.answerPosition,
          context: {
            turns: request.context.turns.length,
            known_sources: request.context.knownSources.length,
            evidence_packs: request.context.availableEvidence.length,
            evidence_sources: request.context.availableEvidence.reduce((total, pack) => total + pack.sources.length, 0),
          },
          resolution: timingResolution,
          ledger: timingLedger,
        });
      }
    },
  };
}

export interface AppDependencies {
  config: AppConfig;
  systemPrompts: SystemPromptCatalog;
  threadStoreV3?: ThreadStore;
  researchTimingSink?: ResearchTimingSink;
}

export function createApp({ config, systemPrompts, threadStoreV3: injectedStore, researchTimingSink }: AppDependencies) {
  const identities = new IdentityPolicy(new WebCryptoIdentityHasher());
  const searchReady = config.DOROTHY_FIXTURE_MODE || Boolean(config.BRAVE_SEARCH_API_KEY);
  const llmReady = config.DOROTHY_FIXTURE_MODE || Boolean(config.ANTHROPIC_API_KEY && config.ANTHROPIC_ASSESSMENT_MODEL && config.ANTHROPIC_SYNTHESIS_MODEL);
  const search: SearchProvider = config.DOROTHY_FIXTURE_MODE
    ? new FixtureSearchProvider(identities)
    : config.BRAVE_SEARCH_API_KEY
      ? new BraveSearchProvider(config.BRAVE_SEARCH_API_KEY, fetch, identities)
      : new UnavailableSearchProvider();
  const extractor = config.DOROTHY_FIXTURE_MODE ? undefined : new SafeContentExtractor({ maxFetchBytes: config.MAX_FETCH_BYTES, maxRedirects: config.MAX_REDIRECTS, userAgent: "dorothy-ann/1.1", minCharacters: 120 });
  const llm: LLMProvider = config.DOROTHY_FIXTURE_MODE
    ? new FixtureLlmProvider()
    : config.ANTHROPIC_API_KEY && config.ANTHROPIC_ASSESSMENT_MODEL && config.ANTHROPIC_SYNTHESIS_MODEL
      ? new AnthropicProvider({ apiKey: config.ANTHROPIC_API_KEY, assessmentModel: config.ANTHROPIC_ASSESSMENT_MODEL, synthesisModel: config.ANTHROPIC_SYNTHESIS_MODEL })
      : new UnavailableLlmProvider();
  const timingSink = researchTimingSink ?? (config.RESEARCH_TIMING_LOGS ? jsonResearchTimingSink : undefined);
  const executor = createExecutor(config, systemPrompts, identities, search, llm, extractor, timingSink);
  const auth = config.APP_PASSPHRASE_SCRYPT_HASH && config.SESSION_SIGNING_KEYS ? new SessionAuth(config.APP_PASSPHRASE_SCRYPT_HASH, config.SESSION_SIGNING_KEYS) : undefined;
  const limiter: LoginAttemptLimiter = config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN ? new UpstashLoginLimiter(config.UPSTASH_REDIS_REST_URL, config.UPSTASH_REDIS_REST_TOKEN) : new InMemoryLoginLimiter();
  const authenticate = async (context: Context) => {
    if (config.DOROTHY_FIXTURE_MODE) return true;
    return Boolean(auth?.verifySession(getCookie(context, "__Host-dorothy-ann-session") ?? ""));
  };
  const authRoutes = new Hono();
  authRoutes.get("/session", (context) => context.json({ authenticated: Boolean(auth?.verifySession(getCookie(context, "__Host-dorothy-ann-session") ?? "")) }));
  authRoutes.post("/logout", (context) => { if (auth) deleteCookie(context, "__Host-dorothy-ann-session", { path: "/" }); return context.body(null, 204); });
  authRoutes.post("/passphrase", async (context) => {
    const body = await context.req.json().catch(() => null) as { passphrase?: unknown } | null;
    if (!body || typeof body.passphrase !== "string" || !body.passphrase) return context.json({ error: { code: "invalid_request", message: "passphrase is required" } }, 400);
    const key = context.req.header("x-forwarded-for") ?? "local";
    const attempt = await limiter.consume(key);
    if (!attempt.allowed) return context.json({ error: { code: "rate_limited", message: "try again later" } }, 429);
    if (!auth) return config.DOROTHY_FIXTURE_MODE ? context.json({ authenticated: true }) : context.json({ error: { code: "service_unavailable", message: "authentication is not configured" } }, 503);
    if (!(await auth.verifyPassphrase(body.passphrase))) return context.json({ error: { code: "unauthorized", message: "invalid passphrase" } }, 401);
    await limiter.reset(key); const session = auth.createSession(); setCookie(context, "__Host-dorothy-ann-session", session.value, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 7 * 86400 }); return context.json({ authenticated: true });
  });
  const statusRoutes = new Hono();
  statusRoutes.get("/", (context) => context.json({ fixtureMode: config.DOROTHY_FIXTURE_MODE, provider: searchReady && llmReady, search: searchReady, llm: llmReady, storage: Boolean(injectedStore) }));
  const app = createPortableApp({ executor, maxRequestBytes: config.MAX_TURN_REQUEST_BYTES, maxResults: config.MAX_SEARCH_RESULTS, researchLimits: { maxCandidatesPerSearch: 5, maxSourcesPerRequest: 3, maxConcurrentSearches: config.MAX_CONCURRENT_SEARCHES, maxConcurrentExtractions: config.MAX_CONCURRENT_EXTRACTIONS, extractionMaxCharacters: config.MAX_EXTRACTED_CHARS_PER_PAGE, extractionTimeoutMs: config.EXTRACTION_TIMEOUT_MS }, authenticate, routes: { auth: authRoutes, status: statusRoutes, storage: injectedStore ? createThreadStorageRoutes(injectedStore) : undefined } });
  app.get("/api/health", (context) => context.json({ ok: true, fixtureMode: config.DOROTHY_FIXTURE_MODE }));
  return app;
}
