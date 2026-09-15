import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { SearchResult } from "../domain/types";
import styles from "./App.module.css";
import { headingAccentSlot, sourceAccentSlot } from "./color-scheme";

const paletteSize = 8;

type MarkdownAnswerProps = {
  markdown: string;
  sources: SearchResult[];
  className?: string;
};

function normalizeAnswerHeadings(markdown: string): string {
  // Treat provider-emitted bold labels such as **Sourdough Pita Chips:** as
  // real Markdown headings so transcript sections receive the heading palette.
  return markdown.replace(/^\*\*([^*\n]+)\*\*:[ \t]*/gm, "### $1\n\n");
}

function citationMarkdown(markdown: string, sources: SearchResult[]): string {
  const sourceNumbers = new Map(sources.map((source, index) => [String(source.sourceId), index + 1]));
  return markdown.replace(/\[\[cite:([^\]]+)\]\]/g, (marker, sourceId: string) => {
    const number = sourceNumbers.get(sourceId);
    return number ? `[${number}](#source-${sourceId})` : marker;
  });
}

function relationalStyle(slot: number): React.CSSProperties {
  return { "--relational-accent": `var(--accent-${slot + 1})` } as React.CSSProperties;
}

export function MarkdownAnswer({ markdown, sources, className }: MarkdownAnswerProps) {
  let headingIndex = 0;
  const sourceById = new Map(sources.map((source) => [String(source.sourceId), source]));
  const answer = citationMarkdown(normalizeAnswerHeadings(markdown), sources);
  const heading = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") => ({ children, ...props }: React.ComponentPropsWithoutRef<typeof Tag>) => {
    const slot = headingAccentSlot(headingIndex, paletteSize);
    headingIndex += 1;
    return <Tag {...props} className={styles.answerHeading} style={relationalStyle(slot)}>{children}</Tag>;
  };

  return (
    <div className={`${styles.answerMarkdown} ${className ?? ""}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: heading("h1"),
          h2: heading("h2"),
          h3: heading("h3"),
          h4: heading("h4"),
          h5: heading("h5"),
          h6: heading("h6"),
          a: ({ href, children, ...props }) => {
            const sourceId = href?.startsWith("#source-") ? href.slice("#source-".length) : undefined;
            const source = sourceId ? sourceById.get(sourceId) : undefined;
            const style = source ? relationalStyle(sourceAccentSlot(source.sourceId, paletteSize)) : undefined;
            return <a {...props} href={href} title={source?.title} className={source ? styles.sourceAccent : undefined} style={style} onClick={source ? () => window.setTimeout(() => document.getElementById(`source-${source.sourceId}`)?.focus(), 0) : undefined}>{children}</a>;
          },
        }}
      >
        {answer}
      </ReactMarkdown>
    </div>
  );
}
