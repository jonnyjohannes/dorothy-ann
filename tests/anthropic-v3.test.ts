import { describe, expect, it } from "vitest";
import type { MessageResponse, MessageStream } from "../src/infrastructure/providers/anthropic.js";
import { AnthropicProvider, AnthropicProviderError, normalizeAnthropicError } from "../src/infrastructure/providers/anthropic.js";
import type { ResearchAssessmentInput, ResearchSynthesisInput } from "../src/ports/llm.js";

const source = "src_test" as never;
const baseAssessment = {
  systemPrompt: "ASSESSOR EXACT",
  problem: { id: "problem_test", question: "What?", purpose: "answer", successCriterion: "supported", context: { threadId: "thread_test", turns: [], knownSources: [], availableEvidence: [] }, depth: 0 },
  knowledge: { problemId: "problem_test", findings: [], evidence: [], unresolvedGapIds: [] },
  ledger: { gaps: [], assessmentsUsed: 0, searchesUsed: 0, sourcesConsumed: 0 },
  budget: { searchesRemaining: 3, sourcesRemaining: 9, assessmentsRemaining: 8, depthRemaining: 2 },
  allowedSupportRefs: [{ type: "source", sourceId: source }],
  maxOutputTokens: 800,
} as unknown as ResearchAssessmentInput;

const baseSynthesis = {
  systemPrompt: "SYNTHESIZER EXACT",
  question: "What?",
  context: { threadId: "thread_test", turns: [], knownSources: [], availableEvidence: [] },
  resolution: { status: "best_effort", stopReason: "no_new_knowledge", knowledge: { problemId: "problem_test", findings: [], evidence: [], unresolvedGapIds: [] }, ledger: { gaps: [], assessmentsUsed: 1, searchesUsed: 0, sourcesConsumed: 0 }, tasks: [] },
  allowedSourceIds: [source],
  maxOutputTokens: 4096,
} as unknown as ResearchSynthesisInput;

function client(responses: Array<MessageResponse | MessageStream>) {
  const systems: string[] = [];
  const requests: Array<Record<string, unknown>> = [];
  const options: unknown[] = [];
  return {
    systems,
    requests,
    options,
    messages: { create: async (input: Record<string, unknown>, requestOptions?: unknown) => {
      systems.push(input.system as string);
      requests.push(input);
      options.push(requestOptions);
      return responses.shift() as MessageResponse | MessageStream;
    } },
  };
}

async function collect(stream: AsyncIterable<unknown>) {
  const parts: unknown[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}

describe("AnthropicProvider v3", () => {
  it("keeps the assessor system prompt exact and retries malformed JSON as user input", async () => {
    const fake = client([
      { content: [{ type: "text", text: "not json" }] },
      { content: [{ type: "text", text: JSON.stringify({ directive: { kind: "resolved", observations: [{ proposition: "p", statement: "s", stance: "supports", support: [{ type: "source", sourceId: source }] }] } }) }] },
    ]);
    const provider = new AnthropicProvider({ assessmentModel: "high", synthesisModel: "balanced", client: fake });
    const result = await provider.assessResearch(baseAssessment);
    expect(result.directive.kind).toBe("resolved");
    expect(fake.systems).toEqual(["ASSESSOR EXACT", "ASSESSOR EXACT"]);
    expect(((fake.requests[1].messages as Array<{ content: string }>)[0].content)).toContain("previous response failed validation");
    expect(fake.requests.every((request) => request.max_tokens === 800)).toBe(true);
  });

  it("projects one compact assessment context without repeated gap contexts or storage identities", async () => {
    const evidenceText = "UNTRUSTED_EVIDENCE_VALUE ".repeat(20);
    const rich = structuredClone(baseAssessment) as ResearchAssessmentInput;
    const pack = {
      problemId: rich.problem.id,
      requestOrder: 7,
      query: "private query",
      sources: [{ sourceId: source, page: { text: evidenceText, extractedAt: "2026-01-01T00:00:00.000Z", characterCount: evidenceText.length } }],
      createdAt: "2026-01-01T00:00:00.000Z",
    } as never;
    rich.problem.context.availableEvidence = [pack];
    rich.problem.context.knownSources = [{ sourceId: source, title: "Evidence title", url: "https://example.test/path", canonicalUrl: "https://example.test/path", displayUrl: "example.test", snippet: "unsupported snippet" }] as never;
    rich.problem.context.turns = [{ turnId: "turn_test", kind: "research", request: "earlier", outcome: "sufficient", answer: { parts: [{ type: "text", markdown: "earlier answer" }] }, answerTruncated: false }] as never;
    rich.ledger.gaps = [0, 1, 2].map((createdOrder) => ({ id: `gap_${createdOrder}`, problem: rich.problem, status: "open", support: [], fingerprint: `SECRET_FINGERPRINT_${createdOrder}`, createdOrder })) as never;
    rich.knowledge.findings = [{ propositionKey: "SECRET_HASH", proposition: "Finding", status: "supported", observations: [{ id: "SECRET_OBSERVATION", propositionKey: "SECRET_HASH", statement: "Statement", stance: "supports", support: [{ type: "source", sourceId: source }] }] }] as never;
    const fake = client([{ content: [{ type: "text", text: JSON.stringify({ directive: { kind: "search", query: "next", purpose: "verify", successCriterion: "supported", priority: 1 } }) }] }]);
    const provider = new AnthropicProvider({ assessmentModel: "high", synthesisModel: "balanced", client: fake });

    await provider.assessResearch(rich);
    const content = (fake.requests[0].messages as Array<{ content: string }>)[0].content;
    const envelope = JSON.parse(content) as {
      context: {
        turns: Array<{ answer: { parts: Array<{ markdown: string }> } }>;
        availableEvidence: Array<{ sources: Array<{ text: string }> }>;
        sources: unknown[];
      };
      problem: { context?: unknown };
      ledger: { gaps: Array<{ problem: { context?: unknown } }> };
      outputSchema?: unknown;
    };
    expect(envelope.context.turns[0].answer.parts[0].markdown).toBe("earlier answer");
    expect(envelope.context.availableEvidence[0].sources[0].text).toBe(evidenceText);
    expect(envelope.context.sources[0]).toEqual({ sourceId: source, title: "Evidence title", canonicalUrl: "https://example.test/path" });
    expect(envelope.problem.context).toBeUndefined();
    expect(envelope.ledger.gaps.every((gap) => gap.problem.context === undefined)).toBe(true);
    expect(content).not.toContain("SECRET_FINGERPRINT");
    expect(content).not.toContain("SECRET_HASH");
    expect(content).not.toContain("SECRET_OBSERVATION");
    expect(content).not.toContain("unsupported snippet");
    expect(envelope.outputSchema).toBeUndefined();
    expect((content.match(/UNTRUSTED_EVIDENCE_VALUE/g) ?? [])).toHaveLength(20);
    expect(fake.systems).toEqual(["ASSESSOR EXACT"]);
  });

  it("accepts the assessor's named directive wrapper", async () => {
    const fake = client([{ content: [{ type: "text", text: JSON.stringify({ directive: "search", search: { query: "independent reporting", purpose: "find evidence", successCriterion: "supported answer", priority: 1 } }) }] }]);
    const provider = new AnthropicProvider({ assessmentModel: "high", synthesisModel: "balanced", client: fake });
    const result = await provider.assessResearch(baseAssessment);
    expect(result.directive).toMatchObject({ kind: "search", query: "independent reporting", priority: 1 });
  });

  it("falls back without structured output only for a classified 400 response", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const provider = new AnthropicProvider({
      assessmentModel: "high",
      synthesisModel: "balanced",
      client: { messages: { create: async (input: Record<string, unknown>) => {
        requests.push(input);
        if (requests.length === 1) throw { status: 400, message: "private provider payload" };
        return { content: [{ type: "text", text: JSON.stringify({ directive: { kind: "search", query: "q", purpose: "p", successCriterion: "s", priority: 1 } }) }] };
      } } },
    });
    await expect(provider.assessResearch(baseAssessment)).resolves.toMatchObject({ directive: { kind: "search" } });
    expect(requests).toHaveLength(2);
    expect(requests[0].output_config).toBeDefined();
    expect(requests[1].output_config).toBeUndefined();
  });

  it.each([401, 403, 404, 422])("does not replay permanent HTTP %s failures", async (status) => {
    let calls = 0;
    const provider = new AnthropicProvider({ assessmentModel: "high", synthesisModel: "balanced", client: { messages: { create: async () => { calls += 1; throw { status, message: "private" }; } } } });
    await expect(provider.assessResearch(baseAssessment)).rejects.toMatchObject({ code: "provider_failed" });
    expect(calls).toBe(1);
  });

  it("forwards the assessment abort signal and recognizes SDK-style abort errors", async () => {
    const controller = new AbortController();
    const fake = client([{ content: [{ type: "text", text: JSON.stringify({ directive: { kind: "search", query: "q", purpose: "p", successCriterion: "s", priority: 1 } }) }] }]);
    const provider = new AnthropicProvider({ assessmentModel: "high", synthesisModel: "balanced", client: fake });
    await provider.assessResearch({ ...baseAssessment, signal: controller.signal });
    expect(fake.options).toEqual([{ signal: controller.signal }]);
    expect(normalizeAnthropicError({ name: "APIUserAbortError" })).toMatchObject({ code: "provider_interrupted" });
  });

  it("uses the corrective retry for structurally invalid or unauthorized support", async () => {
    const invalid = JSON.stringify({ directive: { kind: "resolved", observations: [{ proposition: "p", statement: "s", stance: "supports", support: [{ type: "source", sourceId: "not-allowed" }] }] } });
    const fake = client([{ content: [{ type: "text", text: invalid }] }, { content: [{ type: "text", text: invalid }] }]);
    const provider = new AnthropicProvider({ assessmentModel: "high", synthesisModel: "balanced", client: fake });
    await expect(provider.assessResearch(baseAssessment)).rejects.toMatchObject({ code: "assessment_invalid_response", retryable: true });
    expect(fake.requests).toHaveLength(2);
  });

  it("streams citations only when they are reachable through allowed source IDs", async () => {
    const fake = client([{ [Symbol.asyncIterator]: async function* () {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "Answer [[cite:src_test]] and [[cite:other]]." } };
    } } as MessageStream]);
    const provider = new AnthropicProvider({ assessmentModel: "high", synthesisModel: "balanced", client: fake });
    await expect(collect(provider.synthesizeResearch(baseSynthesis))).resolves.toEqual([
      { type: "text", markdown: "Answer " },
      { type: "citation", sourceId: source },
      { type: "text", markdown: " and " },
      { type: "text", markdown: "[[cite:other]]" },
      { type: "text", markdown: "." },
    ]);
    expect(fake.systems).toEqual(["SYNTHESIZER EXACT"]);
  });

  it("sanitizes provider failures", async () => {
    const failing = { messages: { create: async () => { throw { status: 500, message: "secret provider payload" }; } } };
    const provider = new AnthropicProvider({ assessmentModel: "high", synthesisModel: "balanced", client: failing });
    await expect(provider.assessResearch(baseAssessment)).rejects.toMatchObject({ code: "provider_unavailable", message: "provider_unavailable" });
    try { await provider.assessResearch(baseAssessment); } catch (error) { expect(error).toBeInstanceOf(AnthropicProviderError); expect(String(error)).not.toContain("secret"); }
  });
});
