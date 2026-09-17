import { describe, expect, it } from "vitest";
import { WorkspaceController } from "../src/ui/controllers/workspace-controller";

describe("workspace controller", () => {
  const controller = new WorkspaceController();
  it("discriminates the canonical routes", () => {
    expect(controller.route("/")).toEqual({ kind: "home" });
    expect(controller.route("/threads")).toEqual({ kind: "threads" });
    expect(controller.route("/settings")).toEqual({ kind: "settings" });
    expect(controller.route("/unlock")).toEqual({ kind: "unlock" });
    expect(controller.route("/topics/thread-1")).toEqual({ kind: "thread", threadId: "thread-1" });
  });
  it("delegates box intents into semantic commands", () => {
    expect(controller.command({ type: "command_requested", command: "/threads" })).toEqual({ type: "navigate", to: "/threads" });
    expect(controller.command({ type: "prompt_submitted", value: "what?" })).toEqual({ type: "submit", value: "what?" });
    expect(controller.command({ type: "new_thread_requested" })).toEqual({ type: "navigate", to: "/new", replace: true });
  });
});
