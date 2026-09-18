import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { CSSProperties, ComponentPropsWithoutRef } from "react";
import { headingAccentSlot, inlineAccentSlot, sourceAccentSlot } from "../color-scheme";

export interface MarkdownCitation {
  label: string;
  href: string;
  sourceId?: string;
  number?: number;
}

export interface MarkdownContentProps {
  markdown: string;
  className?: string;
  threadSeed?: string;
  resolveCitation?: (sourceId: string) => MarkdownCitation | undefined;
}

const PALETTE_SIZE = 8;
const customAccent = (slot: number): CSSProperties => ({ "--relational-accent": `var(--accent-${slot + 1})` } as CSSProperties);

function citationMarkdown(markdown: string, resolveCitation?: MarkdownContentProps["resolveCitation"]): string {
  if (!resolveCitation) return markdown;
  return markdown.replace(/\[{1,2}cite:([^\]]+)\]{1,2}/g, (marker, sourceId: string) => {
    const citation = resolveCitation(sourceId);
    if (!citation) return marker;
    const label = String.raw`\[${citation.number ?? citation.label}\]`;
    return `[${label}](#source-${sourceId})`;
  });
}

export function MarkdownContent({ markdown, className, threadSeed = "", resolveCitation }: MarkdownContentProps) {
  let headingIndex = 0;
  let inlineIndex = 0;
  const answer = citationMarkdown(markdown, resolveCitation);
  const inline = (Tag: "strong" | "em" | "code") => ({ children, ...props }: ComponentPropsWithoutRef<typeof Tag>) => {
    const slot = inlineAccentSlot(inlineIndex++, PALETTE_SIZE, threadSeed);
    return <Tag {...props} className="ui-markdown__inline" style={customAccent(slot)}>{children}</Tag>;
  };
  const heading = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") => ({ children, ...props }: ComponentPropsWithoutRef<typeof Tag>) => {
    const slot = headingAccentSlot(headingIndex++, PALETTE_SIZE, threadSeed);
    return <Tag {...props} className="ui-markdown__heading" style={customAccent(slot)}>{children}</Tag>;
  };

  return <div className={["ui-markdown", className].filter(Boolean).join(" ")}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        h1: heading("h1"), h2: heading("h2"), h3: heading("h3"),
        h4: heading("h4"), h5: heading("h5"), h6: heading("h6"),
        strong: inline("strong"), em: inline("em"), code: inline("code"),
        blockquote: ({ children, ...props }) => <blockquote {...props} className="ui-markdown__blockquote">{children}</blockquote>,
        a: ({ href, children, ...props }) => {
          const sourceId = href?.startsWith("#source-") ? href.slice("#source-".length) : undefined;
          return <a {...props} href={href} className={sourceId ? "ui-markdown__citation" : undefined} style={sourceId ? customAccent(sourceAccentSlot(sourceId, PALETTE_SIZE, threadSeed)) : undefined}>{children}</a>;
        },
      }}
    >{answer}</ReactMarkdown>
  </div>;
}
