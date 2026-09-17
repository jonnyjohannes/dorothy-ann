import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { GlobalShortcuts } from "../src/ui/App";
import { WorkspaceController } from "../src/ui/controllers/workspace-controller";

afterEach(() => cleanup());
function LocationProbe() { return <output data-testid="location">{useLocation().pathname}</output>; }

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
  it.each(["/threads", "/settings"])("uses unmodified : to focus the prompt from %s", (path) => {
    render(<MemoryRouter initialEntries={[path]}><GlobalShortcuts /><input aria-label="Search query" /></MemoryRouter>);
    const prompt = screen.getByLabelText("Search query");
    fireEvent.keyDown(window, { key: ":", shiftKey: true });
    expect(document.activeElement).toBe(prompt);
  });
  it.each(["/threads", "/settings"])("leaves %s on Escape", (path) => {
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<><GlobalShortcuts /><LocationProbe /></>} /></Routes></MemoryRouter>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });
});
