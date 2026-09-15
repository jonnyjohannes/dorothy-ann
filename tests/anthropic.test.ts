import { describe, expect, it } from "vitest";
import { AnthropicChatProvider, normalizeAnthropicError } from "../server/anthropic";
import type { NormalizedChatInput } from "../src/ports/chat";
const input: NormalizedChatInput = { purpose: "research_synthesis", systemInstruction: "be useful", turns: [], currentUserContent: "question", maxOutputTokens: 100, evidence: { query: "question", createdAt: "2026-01-01T00:00:00Z", sources: [{ source: { sourceId: "s1" as never, rank: 1, title: "Source", url: "https://example.com", canonicalUrl: "https://example.com", displayUrl: "example.com" }, page: { sourceId: "s1" as never, canonicalUrl: "https://example.com", text: "evidence", extractedAt: "2026-01-01T00:00:00Z" as never, characterCount: 8 } }] } };
describe("Anthropic chat adapter", () => {
  it("parses citations split across provider events", async () => { const client = { messages: { create: async () => (async function* () { yield { type: "content_block_delta", delta: { type: "text_delta", text: "Answer [[cite:" } }; yield { type: "content_block_delta", delta: { type: "text_delta", text: "s1]]" } }; yield { type: "message_delta", usage: { input_tokens: 4, output_tokens: 5 } }; })() } }; const events = []; for await (const event of new AnthropicChatProvider("secret", "fixture", client).stream(input)) events.push(event); expect(events).toContainEqual({ type: "content", part: { type: "citation", sourceId: "s1" } }); expect(events.at(-1)).toMatchObject({ type: "completed", usage: { inputTokens: 4 } }); });
  it("leaves unknown citations as text", async () => { const client = { messages: { create: async () => (async function* () { yield { type: "content_block_delta", delta: { type: "text_delta", text: "[[cite:unknown]]" } }; })() } }; const events = []; for await (const event of new AnthropicChatProvider("secret", "fixture", client).stream(input)) events.push(event); expect(events).toContainEqual({ type: "content", part: { type: "text", markdown: "[[cite:unknown]]" } }); });
  it("parses a bounded structured research plan", async () => {
    const client = { messages: { create: async () => (async function* () {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: '{"status":"needs_more_research","answer":null,"guidance":"verify the date","queries":[{"query":"current date","purpose":"check freshness","priority":1}]}' } };
    })() } };
    const plan = await new AnthropicChatProvider("secret", "fixture", client).planResearch!({ ...input, purpose: "research_planner" });
    expect(plan).toMatchObject({ status: "needs_more_research", queries: [{ query: "current date" }] });
  });
  it("normalizes predictable planner JSON variants", async () => {
    const client = { messages: { create: async () => (async function* () { yield { type: "content_block_delta", delta: { type: "text_delta", text: '{"decision":{"status":"needs-more-research","searches":[{"search":"find Xuanzang sources","priority":"2"}]}}' } }; })() } };
    const decision = await new AnthropicChatProvider("secret", "fixture", client).planResearch!({ ...input, purpose: "research_planner" });
    expect(decision).toMatchObject({ status: "needs_more_research", queries: [{ query: "find Xuanzang sources", priority: 2 }] });
  });
  it("normalizes provider failures without exposing payloads", () => { expect(normalizeAnthropicError({ status: 429 }).message).toBe("provider_rate_limited"); expect(normalizeAnthropicError({ status: 503, message: "secret payload" }).message).toBe("provider_unavailable"); });
});
