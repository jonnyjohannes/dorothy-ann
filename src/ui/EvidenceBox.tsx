import type { SearchResult } from "../domain/types";
import styles from "./App.module.css";
import { sourceAccentSlot } from "./color-scheme";

export function EvidenceBox({ sources, selectedSourceId, onSelect }: { sources: SearchResult[]; selectedSourceId: string | null; onSelect: (sourceId: string) => void }) {
  return (
    <aside className={styles.evidence} aria-label="Evidence">
      <h2 className={styles.srOnly}>Evidence</h2>
      <ul className={styles.evidenceList}>
        {sources.map((source) => (
          <li
            id={`source-${source.sourceId}`}
            tabIndex={-1}
            className={`${styles.evidenceItem} ${selectedSourceId === source.sourceId ? styles.evidenceItemActive : ""}`}
            style={{ "--relational-accent": `var(--accent-${sourceAccentSlot(source.sourceId, 8) + 1})` } as React.CSSProperties}
            aria-current={selectedSourceId === source.sourceId ? "true" : undefined}
            onFocus={() => onSelect(source.sourceId)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              window.open(source.url, "_blank", "noopener,noreferrer");
            }}
            key={source.sourceId}
          >
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className={styles.sourceAccent}
            >
              {source.title}
            </a>
            <small>{source.displayUrl}</small>
            {source.snippet && <p>{source.snippet.replace(/<[^>]+>/g, "")}</p>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
