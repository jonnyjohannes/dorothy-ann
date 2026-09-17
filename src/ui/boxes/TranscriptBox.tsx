import type { CanonicalSource, LegacyArchiveEntry, Thread } from "../../domain/model-v3";
import styles from "../App.module.css";
import { MarkdownAnswer } from "../MarkdownAnswer";
import type { BoxIntent } from "./box-types";
import { transcriptItems } from "./box-policies";
function sourceResult(source: CanonicalSource) { return { ...source, rank: 1 }; }
function renderArchive(entry: LegacyArchiveEntry): string {
  const aliases = new Map(entry.destinations.filter((destination) => destination.legacyCitationId).map((destination) => [destination.legacyCitationId as string, destination.sourceId]));
  return (entry.answerMarkdown ?? "").replace(/\[\[cite:([^\]]+)\]\]/g, (marker, id: string) => aliases.has(id) ? `[[cite:${aliases.get(id)}]]` : marker);
}
export function TranscriptBox({ thread, sources, onIntent }: { thread: Thread; sources: CanonicalSource[]; onIntent: (intent: BoxIntent) => void }) {
  const sourceById = new Map(sources.map((source) => [String(source.sourceId), source]));
  return <article className={styles.scrollback} aria-label="Topic scrollback">{transcriptItems(thread).map((item) => <section key={item.id} aria-label={item.kind === "legacy" ? "Legacy, not evidence-verified" : "Turn"}><p className={styles.muted}>{item.request}</p>{item.kind === "legacy" && <p role="note">legacy, not evidence-verified</p>}{item.markdown && <MarkdownAnswer markdown={item.kind === "legacy" && item.legacy ? renderArchive(item.legacy) : item.markdown} sources={sources.map(sourceResult)} threadSeed={String(thread.id)} />}{item.status && !item.markdown && <p role="status">{item.status}</p>}{item.kind === "legacy" && item.legacy?.destinations.map((destination) => { const source = sourceById.get(String(destination.sourceId)); return source ? <button key={`${item.id}-${destination.sourceId}`} type="button" onClick={() => onIntent({ type: "source_open_requested", sourceId: String(destination.sourceId) })}>{source.title}</button> : null; })}</section>)}</article>;
}
