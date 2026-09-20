import type { BoxIntent } from "../boxes/box-types";
import type { SearchResultKind, ThreadId } from "../../domain/types";
import { classifyPromptInput } from "./prompt-classifier";

export type WorkspaceRoute =
  | { kind: "home" }
  | { kind: "new_thread" }
  | { kind: "thread"; threadId: ThreadId }
  | { kind: "threads" }
  | { kind: "settings" }
  | { kind: "unlock" };

export type WorkspaceCommand =
  | { type: "navigate"; to: string; replace?: boolean }
  | { type: "submit"; value: string; kind: "search"; resultKind: SearchResultKind }
  | { type: "submit"; value: string; kind: "research" }
  | { type: "invalid"; message: string }
  | { type: "retry" };

export function turnLocation(value: string): string {
  return `/threads/new?q=${encodeURIComponent(value)}`;
}

/** Coordinates route and cross-box intents without owning persistence or execution. */
export class WorkspaceController {
  route(pathname: string): WorkspaceRoute {
    if (pathname === "/settings") return { kind: "settings" };
    if (pathname === "/threads") return { kind: "threads" };
    if (pathname === "/threads/new") return { kind: "new_thread" };
    if (pathname === "/unlock") return { kind: "unlock" };
    const match = pathname.match(/^\/threads\/([^/]+)$/);
    if (match) return { kind: "thread", threadId: decodeURIComponent(match[1]) as ThreadId };
    return { kind: "home" };
  }

  command(intent: BoxIntent): WorkspaceCommand | undefined {
    switch (intent.type) {
      case "new_thread_requested":
        return { type: "navigate", to: "/", replace: true };
      case "command_requested": {
        if (intent.command === "/new") return { type: "navigate", to: "/", replace: true };
        if (intent.command === "/settings") return { type: "navigate", to: "/settings" };
        if (intent.command === "/threads") return { type: "navigate", to: "/threads" };
        const submission = classifyPromptInput(intent.command);
        return submission.kind === "invalid"
          ? { type: "invalid", message: submission.message }
          : submission.kind === "research"
            ? { type: "submit", value: submission.value, kind: "research" }
            : { type: "submit", value: submission.query, kind: "search", resultKind: submission.resultKind };
      }
      case "thread_open_requested":
        return { type: "navigate", to: `/threads/${encodeURIComponent(String(intent.threadId))}` };
      case "prompt_submitted": {
        const submission = classifyPromptInput(intent.value);
        return submission.kind === "invalid"
          ? { type: "invalid", message: submission.message }
          : submission.kind === "research"
            ? { type: "submit", value: submission.value, kind: "research" }
            : { type: "submit", value: submission.query, kind: "search", resultKind: submission.resultKind };
      }
      case "retry_requested":
        return { type: "retry" };
      default:
        return undefined;
    }
  }
}

export const workspaceController = new WorkspaceController();
