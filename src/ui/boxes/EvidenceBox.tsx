import type { CSSProperties } from "react";
import type { CanonicalSource } from "../../domain/types";
import { sourceAccentSlotForIndex } from "../color-scheme";
import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";
export function EvidenceBox({ sources, selectedSourceId, onIntent }: { sources: CanonicalSource[]; selectedSourceId?: string; onIntent: (intent: BoxIntent) => void }) {
  return <aside className={styles.evidence} aria-label="Evidence"><h2 className={styles.srOnly}>Evidence</h2><ul className={styles.evidenceList}>{sources.map((source, index) => <li id={`source-${source.sourceId}`} key={source.sourceId} className={selectedSourceId === source.sourceId ? styles.evidenceItemActive : styles.evidenceItem} tabIndex={-1}><a className={styles.sourceAccent} style={{ "--relational-accent": `var(--accent-${sourceAccentSlotForIndex(index, 8) + 1})` } as CSSProperties} href={source.url} target="_blank" rel="noreferrer" onFocus={() => onIntent({ type: "source_open_requested", sourceId: String(source.sourceId) })}><span aria-hidden="true">{index + 1}. </span><span>{source.title}</span></a><small>{source.displayUrl}</small>{source.snippet && <p>{source.snippet}</p>}</li>)}</ul></aside>;
}
