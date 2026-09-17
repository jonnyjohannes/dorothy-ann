export type PromptCommandId = "new" | "threads" | "settings";

export interface PromptSuggestion {
  id: PromptCommandId;
  command: "/new" | "/threads" | "/settings";
  description: string;
  aliases: string[];
}

export interface RankedPromptSuggestion {
  suggestion: PromptSuggestion;
  commandPositions: number[];
  descriptionPositions: number[];
}
