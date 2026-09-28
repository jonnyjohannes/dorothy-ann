import { viableEvidenceSourceCount } from "../domain/knowledge.js";
import type { ResearchResolution } from "../domain/types.js";

/** A root answer may use disagreeing sources, but must see two distinct extracted pages. */
export function enforceResearchSynthesisFloor(resolution: ResearchResolution): ResearchResolution {
  if (resolution.status === "insufficient" || viableEvidenceSourceCount(resolution.knowledge) >= 2) return resolution;
  return {
    ...resolution,
    status: "insufficient",
    stopReason: resolution.status === "sufficient" ? "no_new_knowledge" : resolution.stopReason,
  };
}
