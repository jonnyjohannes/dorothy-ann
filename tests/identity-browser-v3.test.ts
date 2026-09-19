import { describe, expect, it } from "vitest";
import { encodeIdentityFields } from "../src/domain/identity-material";
import { WebCryptoIdentityHasher } from "../src/infrastructure/identity/web-crypto-hasher";

describe("browser Web Crypto identity fixture", () => {
  it("matches the canonical SHA-256/base64url vector", async () => {
    const digest = await new WebCryptoIdentityHasher().sha256Base64Url(encodeIdentityFields(["https://example.com/a"]));
    expect(digest).toBe("Hp6xYGR5Xb5dTICw-EtwKJ2I8CickaK9xeUI0pMnvW8");
  });
});
