import type { SourceId, Thread } from "../../domain/types";

/** News is discovery provenance, not a source subtype or an evidence shortcut. */
export function newsSourceIds(thread: Thread | null): ReadonlySet<SourceId> {
  const ids = new Set<SourceId>();
  for (const turn of thread?.turns ?? []) {
    if (turn.kind === "search") {
      if (turn.status === "completed" && turn.result.completion === "results" && turn.result.resultKind === "news") {
        for (const destination of turn.result.destinations) ids.add(destination.sourceId);
      }
      continue;
    }
    const tasks = turn.status === "completed" ? turn.result.resolution.tasks
      : turn.researchState.kind === "resolution" ? turn.researchState.resolution.tasks
        : turn.researchState.kind === "checkpoint" ? turn.researchState.checkpoint.tasks : [];
    for (const task of tasks) {
      if (task.surface !== "news") continue;
      for (const evidence of task.evidence) ids.add(evidence.sourceId);
    }
  }
  return ids;
}
