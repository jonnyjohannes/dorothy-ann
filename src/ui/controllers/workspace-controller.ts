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
  | { type: "submit"; value: string }
  | { type: "retry" };

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
        return undefined;
      case "thread_open_requested":
        return { type: "navigate", to: `/topics/${encodeURIComponent(String(intent.threadId))}` };
      case "prompt_submitted":
        return { type: "submit", value: intent.value };
      case "retry_requested":
        return { type: "retry" };
      default:
        return undefined;
    }
  }
}

export const workspaceController = new WorkspaceController();
