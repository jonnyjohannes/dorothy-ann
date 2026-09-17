// @vitest-environment node

import { createHash, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IdentityCollisionError, IdentityPolicy } from "../src/application/identity-policy";
import { encodeIdentityFields, normalizeCanonicalUrl, normalizeIdentityText } from "../src/domain/identity-material";
import { legacyThreadInputSchema } from "../src/domain/legacy-input-schemas";
import { migrateLegacyThread } from "../src/domain/migrations";
import { WebCryptoIdentityHasher } from "../src/infrastructure/identity/web-crypto-hasher";
import type { IdentityHasher } from "../src/ports/identity";

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const timestamp = (second: number) => `2026-01-01T00:00:${String(second).padStart(2, "0")}.000Z`;
const hasher = new WebCryptoIdentityHasher(webcrypto.subtle as unknown as SubtleCrypto);

describe("v3 identity material", () => {
  it("normalizes Unicode text and URLs without speculative query rewriting", () => {
    expect(normalizeIdentityText("  Ｈello\u00a0\n WORLD  ")).toBe("hello world");
    expect(normalizeCanonicalUrl("HTTPS://Example.COM:443/a?b=2&a=1#fragment")).toBe("https://example.com/a?b=2&a=1");
    expect(() => normalizeCanonicalUrl("https://user:secret@example.com/")).toThrow("invalid_canonical_url");
    expect(() => normalizeCanonicalUrl("file:///tmp/a")).toThrow("invalid_canonical_url");
  });

  it("uses UTF-8 byte-length prefixes", () => {
    expect(new TextDecoder().decode(encodeIdentityFields(["é", "a"]))).toBe("2:é1:a");
  });

  it("matches a fixed SHA-256/base64url vector", async () => {
    const material = encodeIdentityFields(["https://example.com/a"]);
    const nodeDigest = createHash("sha256").update(material).digest("base64url");
    expect(await hasher.sha256Base64Url(material)).toBe(nodeDigest);
    expect(nodeDigest).toBe("Hp6xYGR5Xb5dTICw-EtwKJ2I8CickaK9xeUI0pMnvW8");
  });

  it("makes support order/duplication irrelevant and ancestry material", async () => {
    const policy = new IdentityPolicy(hasher);
    const propositionKey = await policy.propositionKey("A proposition");
    const sourceId = await policy.sourceId("HTTPS://EXAMPLE.COM:443/a#first");
    expect(await policy.sourceId("https://example.com/a#second")).toBe(sourceId);
    const turnId = uuid(1) as never;
    const first = await policy.observationId({ propositionKey, statement: "Statement", stance: "supports", support: [{ type: "source", sourceId }, { type: "turn", turnId }, { type: "source", sourceId }] });
    const second = await policy.observationId({ propositionKey, statement: " statement ", stance: "supports", support: [{ type: "turn", turnId }, { type: "source", sourceId }] });
    expect(second).toBe(first);
    const root = await policy.problemId({ turnId, question: "Question", purpose: "Purpose", successCriterion: "Success" });
    const child = await policy.problemId({ turnId, parentId: root, question: "Question", purpose: "Purpose", successCriterion: "Success" });
    expect(child).not.toBe(root);
  });

  it("rejects same digest for different canonical material", async () => {
    const collidingHasher: IdentityHasher = { sha256Base64Url: async () => "a".repeat(43) };
    const policy = new IdentityPolicy(collidingHasher);
    await policy.sourceId("https://example.com/a");
    await expect(policy.sourceId("https://example.com/b")).rejects.toBeInstanceOf(IdentityCollisionError);
  });
});

describe("v1/v2 deterministic migration", () => {
  it("converts lookups, archives unsupported answers, rewrites sources, and drops active work", async () => {
    const legacy = legacyThreadInputSchema.parse({
      schemaVersion: 2,
      id: uuid(10),
      title: "Legacy topic",
      createdAt: timestamp(0),
      updatedAt: timestamp(5),
      modelRef: "legacy-model",
      searchRef: "brave",
      turns: [
        {
          id: uuid(1), mode: "chat", status: "completed", createdAt: timestamp(0), updatedAt: timestamp(1),
          userMessage: { id: uuid(2), role: "user", content: "lookup", createdAt: timestamp(0) },
          lookupResults: [{ sourceId: "source-1", rank: 1, title: "Example", url: "https://example.com/a#old", canonicalUrl: "HTTPS://EXAMPLE.COM:443/a#old", displayUrl: "example.com/a" }],
        },
        {
          id: "legacy-research", mode: "research", status: "completed", createdAt: timestamp(2), updatedAt: timestamp(3),
          userMessage: { id: "legacy-message", role: "user", content: "research?", createdAt: timestamp(2) },
          assistantMessage: { id: "legacy-answer", role: "assistant", createdAt: timestamp(3), content: { parts: [{ type: "text", markdown: "Old answer " }, { type: "citation", sourceId: "source-1" }] } },
          researchRun: { id: "run", origin: "search", status: "completed", queries: ["research?"], targetViablePages: 3, sources: [{ sourceId: "source-1", rank: 1, title: "Example later", url: "https://example.com/a", canonicalUrl: "https://example.com/a", displayUrl: "example.com/a" }], extractions: [], evidenceSourceIds: ["source-1"], startedAt: timestamp(2), updatedAt: timestamp(3), completedAt: timestamp(3) },
        },
        {
          id: "active", mode: "chat", status: "running", createdAt: timestamp(4), updatedAt: timestamp(5),
          userMessage: { id: "active-message", role: "user", content: "unfinished", createdAt: timestamp(4) },
        },
      ],
    });
    const result = await migrateLegacyThread(legacy, new IdentityPolicy(hasher));

    expect(result.thread).not.toBeNull();
    expect(result.thread?.turns).toHaveLength(1);
    expect(result.thread?.turns[0]).toMatchObject({ kind: "search", status: "completed", result: { completion: "results" } });
    expect(result.thread?.legacyArchive).toHaveLength(1);
    expect(result.thread?.legacyArchive[0]).toMatchObject({ answerMarkdown: "Old answer [[cite:source-1]]", destinations: [{ legacyCitationId: "source-1" }] });
    expect(result.thread?.sources).toHaveLength(1);
    expect(result.thread?.sources[0]).toMatchObject({ ordinal: 1, canonicalUrl: "https://example.com/a" });
    expect(result.droppedLegacyEntries).toBe(1);
    expect(result.issues).toContainEqual({ code: "legacy_incomplete_dropped", originalIndex: 2 });
  });

  it("is byte-stable for the same input", async () => {
    const input = legacyThreadInputSchema.parse({
      schemaVersion: 1, id: uuid(20), title: "Topic", createdAt: timestamp(0), updatedAt: timestamp(1), modelRef: "model", searchRef: "search",
      turns: [{ id: "old", mode: "chat", status: "failed", createdAt: timestamp(0), updatedAt: timestamp(1), userMessage: { id: "message", role: "user", content: "question", createdAt: timestamp(0) }, failure: { stage: "chat", code: "private", message: "private details", retryable: true, occurredAt: timestamp(1) } }],
    });
    const first = await migrateLegacyThread(input, new IdentityPolicy(hasher));
    const second = await migrateLegacyThread(input, new IdentityPolicy(hasher));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.thread?.legacyArchive[0].statusMessage).toBe("Legacy attempt failed.");
  });
});
