import type { IdentityHasher } from "../../ports/identity.js";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export class WebCryptoIdentityHasher implements IdentityHasher {
  constructor(private readonly subtle: SubtleCrypto = crypto.subtle) {}

  async sha256Base64Url(material: Uint8Array): Promise<string> {
    const digest = await this.subtle.digest("SHA-256", material as BufferSource);
    return base64Url(new Uint8Array(digest));
  }
}
