import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { Thread } from "../domain/types";
import { renderThreadScrollback } from "../domain/thread-state";
import styles from "./App.module.css";

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
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {renderThreadScrollback(thread, { includeSources: false, citationTarget: "evidence" }).markdown}
      </ReactMarkdown>
    </article>
  );
}
