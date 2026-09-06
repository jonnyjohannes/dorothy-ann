import type { AssistantContent, AssistantContentPart, SourceId } from "./types.js";

export class CitationSentinelParser {
  private buffer = "";
  private readonly allowed: Set<string>;
  constructor(allowed: Iterable<SourceId>) { this.allowed = new Set(allowed); }
  feed(chunk: string): AssistantContentPart[] { this.buffer += chunk; return this.drain(false); }
  finish(): AssistantContentPart[] { return this.drain(true); }
  private drain(final: boolean): AssistantContentPart[] { const parts: AssistantContentPart[] = []; while (this.buffer) { const start = this.buffer.indexOf("[[cite:"); if (start < 0) { if (!final) { const keep = this.buffer.lastIndexOf("["); if (keep > -1 && this.buffer.length - keep < 8) { if (keep) parts.push({ type: "text", markdown: this.buffer.slice(0, keep) }); this.buffer = this.buffer.slice(keep); return parts; } } parts.push({ type: "text", markdown: this.buffer }); this.buffer = ""; return parts; } if (start) parts.push({ type: "text", markdown: this.buffer.slice(0, start) }); const end = this.buffer.indexOf("]]", start + 7); if (end < 0) { if (!final) { this.buffer = this.buffer.slice(start); return parts; } parts.push({ type: "text", markdown: this.buffer }); this.buffer = ""; return parts; } const raw = this.buffer.slice(start + 7, end); const marker = this.buffer.slice(start, end + 2); if (/^[A-Za-z0-9_-]+$/.test(raw) && this.allowed.has(raw)) parts.push({ type: "citation", sourceId: raw as SourceId }); else parts.push({ type: "text", markdown: marker }); this.buffer = this.buffer.slice(end + 2); } return parts; }
}
export function citationNumbers(content: AssistantContent): Map<SourceId, number> { const numbers = new Map<SourceId, number>(); for (const part of content.parts) if (part.type === "citation" && !numbers.has(part.sourceId)) numbers.set(part.sourceId, numbers.size + 1); return numbers; }
export function projectCitationsToMarkdown(content: AssistantContent): string { const numbers = citationNumbers(content); return content.parts.map((part) => part.type === "text" ? part.markdown : `[${numbers.get(part.sourceId) ?? "?"}]`).join(""); }
