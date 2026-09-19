export interface SystemPromptCatalog {
  assessor: string;
  synthesizer: string;
}

export interface SystemPromptSource {
  load(): Promise<SystemPromptCatalog>;
}
