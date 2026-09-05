import type { AssistantContentPart, ContextEvidence, UsageMetadata } from "../domain/types.js";
export interface CompletedContextTurn { userMessage: { content: string }; assistantMessage: { content: { parts: AssistantContentPart[] } }; evidence?: { sources: ContextEvidence[] } }
export interface NormalizedChatInput { purpose: "chat" | "research_synthesis" | "topic_report"; systemInstruction: string; turns: CompletedContextTurn[]; currentUserContent: string; evidence?: { query: string; sources: ContextEvidence[]; createdAt: string }; maxOutputTokens: number }
export type ChatProviderEvent = { type: "content"; part: AssistantContentPart } | { type: "completed"; usage?: UsageMetadata };
export interface ChatProvider { stream(input: NormalizedChatInput): AsyncIterable<ChatProviderEvent> }
