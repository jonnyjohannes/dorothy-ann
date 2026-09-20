import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { GlobalShortcuts } from "../src/ui/App";
import { WorkspaceController } from "../src/ui/controllers/workspace-controller";
import { ResearchStatus } from "../src/ui/routes/ThreadRoute";
import { researchAnswerPosition } from "../src/ui/policies/answer-position";
import { HomeRoute } from "../src/ui/routes/HomeRoute";
import { threadSelectorReturnTo, threadSelectorState } from "../src/ui/navigation-state";

afterEach(() => cleanup());
function LocationProbe() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }

describe("workspace controller", () => {
  const controller = new WorkspaceController();
  it("discriminates the canonical routes", () => {
    expect(controller.route("/")).toEqual({ kind: "home" });
    expect(controller.route("/threads")).toEqual({ kind: "threads" });
    expect(controller.route("/threads/new")).toEqual({ kind: "new_thread" });
    expect(controller.route("/settings")).toEqual({ kind: "settings" });
    expect(controller.route("/unlock")).toEqual({ kind: "unlock" });
    expect(controller.route("/threads/thread-1")).toEqual({ kind: "thread", threadId: "thread-1" });
  });
  it("renders an accessible animated research status with a reduced-motion-safe bar structure", () => {
    render(<ResearchStatus answerDraft="" />);
    expect(screen.getByRole("status")).toHaveTextContent("researching");
    expect(screen.getByRole("status").querySelectorAll("i")).toHaveLength(3);
  });
  it.each([
    ["searching", "searching sources"],
    ["extracting", "extracting evidence"],
    ["assessing", "assessing research"],
    ["decomposing", "research direction"],
    ["recursing", "recursing"],
    ["resolving", "resolving evidence"],
    ["synthesizing", "synthesizing"],
  ] as const)("surfaces the %s research phase in the loader", (phase, label) => {
    render(<ResearchStatus answerDraft="" events={[{ type: "phase", phase, executionId: "123e4567-e89b-12d3-a456-426614174001" as never, turnId: "123e4567-e89b-12d3-a456-426614174000" as never, sequence: 2 }]} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });
  it.each([
    ["searching", "recursing · searching"],
    ["extracting", "recursing · extracting evidence"],
    ["assessing", "recursing · assessing research"],
  ] as const)("retains recursion while reporting the %s operation", (phase, label) => {
    render(<ResearchStatus answerDraft="" events={[
      { type: "phase", phase: "recursing", executionId: "123e4567-e89b-12d3-a456-426614174001" as never, turnId: "123e4567-e89b-12d3-a456-426614174000" as never, sequence: 2 },
      { type: "phase", phase, executionId: "123e4567-e89b-12d3-a456-426614174001" as never, turnId: "123e4567-e89b-12d3-a456-426614174000" as never, sequence: 3 },
    ]} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });
  it("keeps the latest explicit phase authoritative over source events", () => {
    render(<ResearchStatus answerDraft="" events={[
      { type: "phase", phase: "assessing", executionId: "123e4567-e89b-12d3-a456-426614174001" as never, turnId: "123e4567-e89b-12d3-a456-426614174000" as never, sequence: 2 },
      { type: "source_delta", sources: [], occurrences: [], executionId: "123e4567-e89b-12d3-a456-426614174001" as never, turnId: "123e4567-e89b-12d3-a456-426614174000" as never, sequence: 3 },
    ]} />);
    expect(screen.getByRole("status")).toHaveTextContent("assessing research");
  });
  it("derives the initial preamble position only from completed research answers", () => {
    expect(researchAnswerPosition([])).toBe("initial");
    expect(researchAnswerPosition([{ kind: "search", status: "completed" }] as never)).toBe("initial");
    expect(researchAnswerPosition([{ kind: "research", status: "failed" }, { kind: "research", status: "interrupted" }] as never)).toBe("initial");
    expect(researchAnswerPosition([{ kind: "research", status: "completed" }] as never)).toBe("follow_up");
  });
  it("defaults ordinary input to research and classifies explicit result kinds", () => {
    expect(controller.command({ type: "command_requested", command: "/threads" })).toEqual({ type: "navigate", to: "/threads" });
    expect(controller.command({ type: "prompt_submitted", value: "what" })).toEqual({ type: "submit", value: "what", kind: "research" });
    expect(controller.command({ type: "prompt_submitted", value: "what?" })).toEqual({ type: "submit", value: "what?", kind: "research" });
    expect(controller.command({ type: "command_requested", command: "/link  apollo 11 landing  " })).toEqual({ type: "submit", value: "apollo 11 landing", kind: "search", resultKind: "link" });
    expect(controller.command({ type: "command_requested", command: "/image apollo" })).toEqual({ type: "submit", value: "apollo", kind: "search", resultKind: "image" });
    expect(controller.command({ type: "command_requested", command: "/video apollo" })).toEqual({ type: "submit", value: "apollo", kind: "search", resultKind: "video" });
    expect(controller.command({ type: "command_requested", command: "/link" })).toEqual({ type: "invalid", message: "Usage: /link <query>" });
    expect(controller.command({ type: "new_thread_requested" })).toEqual({ type: "navigate", to: "/", replace: true });
  });
  it("routes ordinary questions and explicit result searches through one prompt URL", () => {
    const view = render(<MemoryRouter><Routes><Route path="/" element={<HomeRoute />} /><Route path="*" element={<LocationProbe />} /></Routes></MemoryRouter>);
    const prompt = screen.getByLabelText("Search query");
    fireEvent.change(prompt, { target: { value: "when did apollo 11 land?" } });
    fireEvent.submit(prompt.closest("form")!);
    expect(screen.getByTestId("location")).toHaveTextContent("/threads/new?q=when%20did%20apollo%2011%20land%3F");
    view.unmount();

    render(<MemoryRouter><Routes><Route path="/" element={<HomeRoute />} /><Route path="*" element={<LocationProbe />} /></Routes></MemoryRouter>);
    const search = screen.getByLabelText("Search query");
    fireEvent.change(search, { target: { value: "/image apollo 11 landing" } });
    fireEvent.submit(search.closest("form")!);
    expect(screen.getByTestId("location")).toHaveTextContent("/threads/new?q=%2Fimage%20apollo%2011%20landing");
  });
  it.each(["/threads", "/settings"])("uses unmodified i to focus the prompt from %s", (path) => {
    render(<MemoryRouter initialEntries={[path]}><GlobalShortcuts /><input aria-label="Search query" /></MemoryRouter>);
    const prompt = screen.getByLabelText("Search query");
    fireEvent.keyDown(window, { key: "i" });
    expect(document.activeElement).toBe(prompt);
  });
  it.each([["s", "KeyS", "/threads"], ["c", "KeyC", "/settings"] as const])("opens %s route with Alt+%s even while the prompt is focused", (key, code, path) => {
    render(<MemoryRouter initialEntries={["/"]}><Routes><Route path="*" element={<><GlobalShortcuts /><input aria-label="Search query" /><LocationProbe /></>} /></Routes></MemoryRouter>);
    const prompt = screen.getByLabelText("Search query");
    prompt.focus();
    fireEvent.keyDown(prompt, { key, code, altKey: true });
    expect(screen.getByTestId("location")).toHaveTextContent(path);
  });
  it("returns from the thread selector to the thread that launched it", () => {
    render(<MemoryRouter initialEntries={["/threads/thread-1?view=latest"]}><Routes><Route path="*" element={<><GlobalShortcuts /><LocationProbe /></>} /></Routes></MemoryRouter>);
    fireEvent.keyDown(window, { key: "s", code: "KeyS", altKey: true });
    expect(screen.getByTestId("location")).toHaveTextContent("/threads");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("location")).toHaveTextContent("/threads/thread-1?view=latest");
  });
  it("bounds thread-selector return state to safe internal locations", () => {
    expect(threadSelectorState({ pathname: "/threads/thread-1", search: "?view=latest" })).toEqual({ returnTo: "/threads/thread-1?view=latest" });
    expect(threadSelectorReturnTo({ returnTo: "/threads/thread-1?view=latest" })).toBe("/threads/thread-1?view=latest");
    expect(threadSelectorReturnTo({ returnTo: "https://example.com" })).toBe("/");
    expect(threadSelectorReturnTo({ returnTo: "//example.com" })).toBe("/");
  });
  it("does not assign Alt+A to any search result kind", () => {
    render(<MemoryRouter initialEntries={["/"]}><Routes><Route path="*" element={<><GlobalShortcuts /><input aria-label="Search query" /><LocationProbe /></>} /></Routes></MemoryRouter>);
    const prompt = screen.getByLabelText("Search query");
    prompt.focus();
    fireEvent.keyDown(prompt, { key: "a", code: "KeyA", altKey: true });
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/u);
    expect(prompt).toHaveValue("");
  });
  it.each(["/threads", "/settings"])("leaves %s on Escape", (path) => {
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<><GlobalShortcuts /><LocationProbe /></>} /></Routes></MemoryRouter>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });
});
