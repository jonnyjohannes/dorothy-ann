const encoder = new TextEncoder();

export function normalizeIdentityText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function normalizeCanonicalUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid_canonical_url");
  if (url.username || url.password) throw new Error("invalid_canonical_url");
  url.hash = "";
  return url.href;
}

export function encodeIdentityFields(fields: readonly string[]): Uint8Array {
  const chunks = fields.map((field) => {
    const bytes = encoder.encode(field);
    return encoder.encode(`${bytes.byteLength}:${field}`);
  });
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const material = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    material.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return material;
}

export function serializeSupportIdentity(values: readonly string[]): string {
  return [...new Set(values)].sort().join("\n");
}
