import type { CSSProperties, ReactNode } from "react";
import type { SourceRecord } from "../../domain/types";
import { sourceAccentSlotForIndex } from "../color-scheme";
import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";

function snippetContent(value: string): ReactNode {
  if (typeof DOMParser === "undefined") return value;
  const root = new DOMParser().parseFromString(`<div>${value}</div>`, "text/html").body.firstElementChild;
  if (!root) return value;
  const render = (node: ChildNode, key: string): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return null;
    const children = Array.from(element.childNodes).map((child, index) => render(child, `${key}-${index}`));
    if (tag === "br") return <br key={key} />;
    if (tag === "strong" || tag === "b") return <strong key={key}>{children}</strong>;
    if (tag === "em" || tag === "i") return <em key={key}>{children}</em>;
    if (tag === "mark") return <mark key={key}>{children}</mark>;
    return children;
  };
  return Array.from(root.childNodes).map((node, index) => render(node, String(index)));
}

export function EvidenceBox({ sources, selectedSourceId, onIntent }: { sources: SourceRecord[]; selectedSourceId?: string; onIntent: (intent: BoxIntent) => void }) {
  return <aside className={styles.evidence} aria-label="Evidence"><h2 className={styles.srOnly}>Evidence</h2><ul className={styles.evidenceList}>{sources.map((source, index) => {
    const kind = "kind" in source ? source.kind : "link";
    const media = kind === "image" || kind === "video";
    const sourcePageUrl = "sourcePageUrl" in source ? source.sourcePageUrl : undefined;
    const thumbnailUrl = "thumbnailUrl" in source ? source.thumbnailUrl : undefined;
    const mediaAttachment = media && thumbnailUrl;
    const primary = media && sourcePageUrl ? sourcePageUrl : source.url;
    const label = kind === "image" ? "Image result" : kind === "video" ? "Video result" : "Link result";
    return <li id={`source-${source.sourceId}`} key={source.sourceId} className={selectedSourceId === source.sourceId ? styles.evidenceItemActive : styles.evidenceItem} style={{ "--relational-accent": `var(--accent-${sourceAccentSlotForIndex(index, 8) + 1})` } as CSSProperties} aria-current={selectedSourceId === source.sourceId ? "true" : undefined} tabIndex={-1} onFocus={() => onIntent({ type: "source_open_requested", sourceId: String(source.sourceId) })}>
      <a className={styles.sourceAccent} style={{ "--relational-accent": `var(--accent-${sourceAccentSlotForIndex(index, 8) + 1})` } as CSSProperties} href={primary} target="_blank" rel="noreferrer" aria-label={`${label}: ${source.title}`} onFocus={() => onIntent({ type: "source_open_requested", sourceId: String(source.sourceId) })}><span aria-hidden="true">{index + 1}. </span><span>{source.title}</span></a>
      <small>{source.displayUrl}</small>
      {mediaAttachment
        ? <div className={styles.mediaAttachment}><img className={styles.mediaThumbnail} src={thumbnailUrl} alt="" loading="lazy" /><small><a href={source.url} target="_blank" rel="noreferrer">Open {kind}</a></small></div>
        : source.snippet && <p>{snippetContent(source.snippet)}</p>}
      {media && sourcePageUrl && !mediaAttachment && <small><a href={source.url} target="_blank" rel="noreferrer">Open {kind}</a></small>}
    </li>;
  })}</ul></aside>;
}
