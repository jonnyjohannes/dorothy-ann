import type { Thread } from "../../domain/types";

export function researchAnswerPosition(turns: Thread["turns"]): "initial" | "follow_up" {
  return turns.some((turn) => turn.kind === "research" && turn.status === "completed") ? "follow_up" : "initial";
}
