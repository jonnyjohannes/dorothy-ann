import { readFile } from "node:fs/promises";
import type { SystemPromptCatalog, SystemPromptSource } from "../../src/ports/system-prompts.js";

const MAX_PROMPT_BYTES = 32 * 1024;

type PromptRole = keyof SystemPromptCatalog;

export class SystemPromptUnavailableError extends Error {
  readonly code = "system_prompt_unavailable" as const;

  constructor(readonly role: PromptRole) {
    super(`system_prompt_unavailable:${role}`);
    this.name = "SystemPromptUnavailableError";
  }
}

export interface FileSystemPromptUrls {
  assessor: URL;
  synthesizer: URL;
}

const defaultUrls: FileSystemPromptUrls = {
  assessor: new URL("../../ASSESSOR.md", import.meta.url),
  synthesizer: new URL("../../SYNTHESIZER.md", import.meta.url),
};

async function readPrompt(role: PromptRole, url: URL): Promise<string> {
  try {
    const bytes = await readFile(url);
    if (bytes.byteLength > MAX_PROMPT_BYTES) throw new SystemPromptUnavailableError(role);
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (value.trim().length === 0) throw new SystemPromptUnavailableError(role);
    return value;
  } catch (error) {
    if (error instanceof SystemPromptUnavailableError) throw error;
    throw new SystemPromptUnavailableError(role);
  }
}

export class FileSystemPromptSource implements SystemPromptSource {
  private catalogPromise?: Promise<SystemPromptCatalog>;

  constructor(private readonly urls: FileSystemPromptUrls = defaultUrls) {}

  load(): Promise<SystemPromptCatalog> {
    this.catalogPromise ??= Promise.all([
      readPrompt("assessor", this.urls.assessor),
      readPrompt("synthesizer", this.urls.synthesizer),
    ]).then(([assessor, synthesizer]) => Object.freeze({ assessor, synthesizer }));
    return this.catalogPromise;
  }
}
