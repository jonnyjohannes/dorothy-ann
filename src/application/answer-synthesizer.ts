import type {
  AssistantContent,
  AssistantContentPart,
  BestEffortResearchResolution,
  SourceId,
  SufficientResearchResolution,
  ThreadContext,
} from "../domain/types.js";
import type { LLMProvider, ResearchSynthesisInput } from "../ports/llm.js";

export const DEFAULT_SYNTHESIS_MAX_OUTPUT_TOKENS = 4_096;

export interface AnswerSynthesizerInput {
  question: string;
  context: ThreadContext;
  resolution: SufficientResearchResolution | BestEffortResearchResolution;
  signal?: AbortSignal;
}

export class AnswerSynthesisError extends Error {
  constructor(
    public readonly code: "unavailable" | "invalid_output" | "rate_limited" | "refused",
    message: string = code,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AnswerSynthesisError";
  }
}

function textCodePoints(value: string): number {
  return [...value].length;
}

/**
 * The provider is allowed to stream an opening heading despite the system
 * prompt. Only the first non-empty line is changed: internal Markdown remains
 * byte-for-byte unchanged and no second synthesis is attempted.
 */
export function normalizeLeadingHeading(parts: readonly AssistantContentPart[]): AssistantContentPart[] {
  const normalized = parts.map((part) => ({ ...part }));
  let seenContent = false;
  for (const part of normalized) {
    if (part.type !== "text") {
      if (!seenContent) continue;
      continue;
    }
    if (seenContent || !part.markdown.trim()) continue;
    seenContent = true;
    const lines = part.markdown.split(/(\r?\n)/);
    for (let index = 0; index < lines.length; index += 2) {
      const line = lines[index];
      if (!line.trim()) continue;
      const match = line.match(/^(\s*)#{1,6}(?:[ \t]+|$)(.*)$/);
      if (match) lines[index] = `${match[1]}${match[2]}`;
      break;
    }
    part.markdown = lines.join("");
  }
  return normalized;
}

function reachableSourceIds(
  resolution: SufficientResearchResolution | BestEffortResearchResolution,
): Set<SourceId> {
  const ids = new Set<SourceId>();
  for (const pack of resolution.knowledge.evidence) {
    for (const source of pack.sources) ids.add(source.sourceId);
  }
  return ids;
}

function hasVisibleContent(part: AssistantContentPart): boolean {
  return part.type === "citation" || part.markdown.trim().length > 0;
}

export function enforceReachableCitations(
  parts: readonly AssistantContentPart[],
  resolution: SufficientResearchResolution | BestEffortResearchResolution,
  allowedSourceIds: readonly SourceId[],
): AssistantContentPart[] {
  const reachable = reachableSourceIds(resolution);
  const allowed = new Set(allowedSourceIds);
  return parts.filter((part) => part.type === "text" || (allowed.has(part.sourceId) && reachable.has(part.sourceId)));
}

function validateAnswer(
  parts: readonly AssistantContentPart[],
): AssistantContent {
  if (parts.length === 0 || !parts.some(hasVisibleContent)) {
    throw new AnswerSynthesisError("invalid_output", "synthesis_empty");
  }
  const total = parts.reduce((count, part) => count + (part.type === "text" ? textCodePoints(part.markdown) : 0), 0);
  if (total === 0 && !parts.some((part) => part.type === "citation")) {
    throw new AnswerSynthesisError("invalid_output", "synthesis_empty");
  }
  return { parts: [...parts] };
}

function mapSynthesisError(error: unknown): AnswerSynthesisError {
  if (error instanceof AnswerSynthesisError) return error;
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : error instanceof Error ? error.message : "";
  if (code === "rate_limited" || code === "provider_rate_limited") return new AnswerSynthesisError("rate_limited");
  if (code === "refused" || code === "provider_refused") return new AnswerSynthesisError("refused");
  return new AnswerSynthesisError("unavailable");
}

export class AnswerSynthesizer {
  constructor(
    private readonly provider: LLMProvider,
    private readonly systemPrompt: string,
    private readonly maxOutputTokens = DEFAULT_SYNTHESIS_MAX_OUTPUT_TOKENS,
  ) {}

  async synthesize(input: AnswerSynthesizerInput): Promise<AssistantContent> {
    if (input.signal?.aborted) throw new AnswerSynthesisError("unavailable", "provider_interrupted");
    const allowedSourceIds = [...reachableSourceIds(input.resolution)];
    const providerInput: ResearchSynthesisInput = {
      systemPrompt: this.systemPrompt,
      question: input.question,
      context: input.context,
      resolution: input.resolution,
      allowedSourceIds,
      maxOutputTokens: this.maxOutputTokens,
    };
    const parts: AssistantContentPart[] = [];
    try {
      for await (const part of this.provider.synthesizeResearch(providerInput)) {
        if (input.signal?.aborted) throw new AnswerSynthesisError("unavailable", "provider_interrupted");
        if (!part || (part.type !== "text" && part.type !== "citation")) continue;
        if (part.type === "text" && typeof part.markdown !== "string") continue;
        parts.push(part);
      }
      const reachable = enforceReachableCitations(parts, input.resolution, allowedSourceIds);
      return validateAnswer(normalizeLeadingHeading(reachable));
    } catch (error) {
      throw mapSynthesisError(error);
    }
  }
}

export async function synthesizeAnswer(
  provider: LLMProvider,
  systemPrompt: string,
  input: AnswerSynthesizerInput,
): Promise<AssistantContent> {
  return new AnswerSynthesizer(provider, systemPrompt).synthesize(input);
}
