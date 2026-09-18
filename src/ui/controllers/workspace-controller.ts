import type { BoxIntent } from "../boxes/box-types";
import type { ThreadId } from "../../domain/types";

export type WorkspaceRoute =
  | { kind: "home" }
  | { kind: "thread"; threadId: ThreadId }
  | { kind: "threads" }
  | { kind: "settings" }
  | { kind: "unlock" };

export type WorkspaceCommand =
  | { type: "navigate"; to: string; replace?: boolean }
  | { type: "submit"; value: string; kind: "search" | "research" }
  | { type: "invalid"; message: string }
  | { type: "retry" };

function explicitTurn(command: string): WorkspaceCommand | undefined {
  const match = command.match(/^\/(search|research)(?:\s+([\s\S]*))?$/u);
  if (!match) return undefined;
  const kind = match[1] as "search" | "research";
  const value = match[2]?.trim() ?? "";
  return value
    ? { type: "submit", value, kind }
    : { type: "invalid", message: `Usage: /${kind} <${kind === "search" ? "query" : "question"}>` };
}

export function turnLocation(value: string, kind: "search" | "research"): string {
  return `/topics/new?kind=${kind}&q=${encodeURIComponent(value)}`;
}

/** Coordinates route and cross-box intents without owning persistence or execution. */
export class WorkspaceController {
  route(pathname: string): WorkspaceRoute {
    if (pathname === "/settings") return { kind: "settings" };
    if (pathname === "/threads") return { kind: "threads" };
    if (pathname === "/unlock") return { kind: "unlock" };
    const match = pathname.match(/^\/topics\/([^/]+)$/);
    if (match) return { kind: "thread", threadId: decodeURIComponent(match[1]) as ThreadId };
    return { kind: "home" };
  }

  command(intent: BoxIntent): WorkspaceCommand | undefined {
    switch (intent.type) {
      case "new_thread_requested":
        return { type: "navigate", to: "/", replace: true };
      case "command_requested":
        if (intent.command === "/new") return { type: "navigate", to: "/", replace: true };
        if (intent.command === "/settings") return { type: "navigate", to: "/settings" };
        if (intent.command === "/threads") return { type: "navigate", to: "/threads" };
        return explicitTurn(intent.command) ?? { type: "invalid", message: `Unknown command: ${intent.command}` };
      case "thread_open_requested":
        return { type: "navigate", to: `/topics/${encodeURIComponent(String(intent.threadId))}` };
      case "prompt_submitted":
        return { type: "submit", value: intent.value, kind: "research" };
      case "retry_requested":
        return { type: "retry" };
      default:
        return undefined;
    }
  }
}

export const workspaceController = new WorkspaceController();
