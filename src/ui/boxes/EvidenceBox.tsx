import type { CanonicalSource } from "../../domain/model-v3";
import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";
export function EvidenceBox({ sources, selectedSourceId, onIntent }: { sources: CanonicalSource[]; selectedSourceId?: string; onIntent: (intent: BoxIntent) => void }) {
  return <aside className={styles.evidence} aria-label="Evidence"><h2 className={styles.srOnly}>Evidence</h2><ul className={styles.evidenceList}>{sources.map((source, index) => <li id={`source-${source.sourceId}`} key={source.sourceId} className={selectedSourceId === source.sourceId ? styles.evidenceItemActive : styles.evidenceItem} tabIndex={-1}><a href={source.url} target="_blank" rel="noreferrer" onFocus={() => onIntent({ type: "source_open_requested", sourceId: String(source.sourceId) })}>{index + 1}. {source.title}</a><small>{source.displayUrl}</small>{source.snippet && <p>{source.snippet}</p>}</li>)}</ul></aside>;
}
