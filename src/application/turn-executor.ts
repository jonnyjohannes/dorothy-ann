import type { SearchTurn, ResearchTurn } from "../domain/types.js";
import { executeResearchTurn, type ResearchTurnExecutionInput, type ResearchTurnExecutionResult } from "./execute-research-turn.js";
import { executeSearchTurn, type SearchTurnExecutionInput, type SearchTurnExecutionResult } from "./execute-search-turn.js";

export type TurnExecutionInput =
  | ({ kind: "search" } & SearchTurnExecutionInput)
  | ({ kind: "research" } & ResearchTurnExecutionInput);

export type TurnExecutionResult = SearchTurnExecutionResult | ResearchTurnExecutionResult;

/** Dispatches one provider-neutral execution; it never owns durable Thread state. */
export async function executeTurn(input: TurnExecutionInput): Promise<TurnExecutionResult> {
  if (input.kind === "search") return executeSearchTurn(input);
  return executeResearchTurn(input);
}

export type { SearchTurn, ResearchTurn };
