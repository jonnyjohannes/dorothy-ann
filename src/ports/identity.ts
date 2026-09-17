export interface IdentityHasher {
  sha256Base64Url(material: Uint8Array): Promise<string>;
}
