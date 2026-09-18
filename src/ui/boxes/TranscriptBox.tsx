import type { CanonicalSource, LegacyArchiveEntry, Thread } from "../../domain/types";
import styles from "../App.module.css";
import { MarkdownContent } from "../primitives/MarkdownContent";
import type { BoxIntent } from "./box-types";
import { transcriptItems } from "./box-policies";
function renderArchive(entry: LegacyArchiveEntry): string {
  const aliases = new Map(entry.destinations.filter((destination) => destination.legacyCitationId).map((destination) => [destination.legacyCitationId as string, destination.sourceId]));
  return (entry.answerMarkdown ?? "").replace(/\[{1,2}cite:([^\]]+)\]{1,2}/g, (marker, id: string) => aliases.has(id) ? `[[cite:${aliases.get(id)}]]` : marker);
}
export function TranscriptBox({ thread, sources, onIntent }: { thread: Thread; sources: CanonicalSource[]; onIntent: (intent: BoxIntent) => void }) {
  const sourceById = new Map(sources.map((source, index) => [String(source.sourceId), { source, number: index + 1 }]));
  return <article className={styles.scrollback} aria-label="Topic scrollback">{transcriptItems(thread).map((item) => <section key={item.id} aria-label={item.kind === "legacy" ? "Legacy, not evidence-verified" : "Turn"}><blockquote className={styles.userTurn}>{item.request}</blockquote>{item.kind === "legacy" && <p role="note">legacy, not evidence-verified</p>}{item.markdown && <MarkdownContent markdown={item.kind === "legacy" && item.legacy ? renderArchive(item.legacy) : item.markdown} threadSeed={String(thread.id)} resolveCitation={(sourceId) => { const entry = sourceById.get(sourceId); return entry ? { label: entry.source.title, href: entry.source.url, sourceId, number: entry.number } : undefined; }} />}{item.status && !item.markdown && <p role="status">{item.status}</p>}{item.kind === "legacy" && item.legacy?.destinations.map((destination) => { const entry = sourceById.get(String(destination.sourceId)); const source = entry?.source; return source ? <button key={`${item.id}-${destination.sourceId}`} type="button" onClick={() => onIntent({ type: "source_open_requested", sourceId: String(destination.sourceId) })}>{source.title}</button> : null; })}</section>)}</article>;
}
