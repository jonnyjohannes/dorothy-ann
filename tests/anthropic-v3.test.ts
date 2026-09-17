import { describe, expect, it } from "vitest";
import type { MessageResponse, MessageStream } from "../src/infrastructure/providers/anthropic.js";
import { AnthropicProvider, AnthropicProviderError } from "../src/infrastructure/providers/anthropic.js";
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
  return {
    systems,
    messages: { create: async (input: { system: string }) => { systems.push(input.system); return responses.shift() as MessageResponse | MessageStream; } },
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
