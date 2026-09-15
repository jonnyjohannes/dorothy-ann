import type { Thread } from "../domain/types";
import { renderThreadScrollback } from "../domain/thread-state";
import styles from "./App.module.css";
import { MarkdownAnswer } from "./MarkdownAnswer";

export function TurnTranscriptBox({ thread, onEvidenceSelect }: { thread: Thread; onEvidenceSelect: (sourceId: string) => void }) {
  return (
    <article
      className={styles.scrollback}
      aria-label="Topic scrollback"
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest("a");
        const href = link?.getAttribute("href");
        if (!href?.startsWith("#source-")) return;
        event.preventDefault();
        onEvidenceSelect(href.slice("#source-".length));
      }}
    >
      <MarkdownAnswer
        markdown={renderThreadScrollback(thread, { includeSources: false, citationTarget: "evidence" }).markdown}
        sources={Array.from(new Map(thread.turns.flatMap((turn) => turn.researchRun?.sources ?? turn.lookupResults ?? []).map((source) => [source.sourceId, source])).values())}
      />
    </article>
  );
}
