import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { GlobalShortcuts } from "../src/ui/App";
import { WorkspaceController } from "../src/ui/controllers/workspace-controller";
import { ResearchStatus } from "../src/ui/routes/ThreadRoute";
import { HomeRoute } from "../src/ui/routes/HomeRoute";

afterEach(() => cleanup());
function LocationProbe() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }

describe("workspace controller", () => {
  const controller = new WorkspaceController();
  it("discriminates the canonical routes", () => {
    expect(controller.route("/")).toEqual({ kind: "home" });
    expect(controller.route("/threads")).toEqual({ kind: "threads" });
    expect(controller.route("/settings")).toEqual({ kind: "settings" });
    expect(controller.route("/unlock")).toEqual({ kind: "unlock" });
    expect(controller.route("/topics/thread-1")).toEqual({ kind: "thread", threadId: "thread-1" });
  });
  it("renders an accessible animated research status with a reduced-motion-safe bar structure", () => {
    render(<ResearchStatus answerDraft="" />);
    expect(screen.getByRole("status")).toHaveTextContent("researching");
    expect(screen.getByRole("status").querySelectorAll("i")).toHaveLength(3);
  });
  it("surfaces the current research phase in the loader", () => {
    render(<ResearchStatus answerDraft="" events={[{ type: "phase", phase: "extracting", executionId: "123e4567-e89b-12d3-a456-426614174001" as never, turnId: "123e4567-e89b-12d3-a456-426614174000" as never, sequence: 2 }]} />);
    expect(screen.getByRole("status")).toHaveTextContent("extracting evidence");
  });
  it("defaults ordinary input to research and reserves search for an explicit utility", () => {
    expect(controller.command({ type: "command_requested", command: "/threads" })).toEqual({ type: "navigate", to: "/threads" });
    expect(controller.command({ type: "prompt_submitted", value: "what" })).toEqual({ type: "submit", value: "what", kind: "research" });
    expect(controller.command({ type: "prompt_submitted", value: "what?" })).toEqual({ type: "submit", value: "what?", kind: "research" });
    expect(controller.command({ type: "command_requested", command: "/search  apollo 11 landing  " })).toEqual({ type: "submit", value: "apollo 11 landing", kind: "search" });
    expect(controller.command({ type: "command_requested", command: "/search" })).toEqual({ type: "invalid", message: "Usage: /search <query>" });
    expect(controller.command({ type: "new_thread_requested" })).toEqual({ type: "navigate", to: "/", replace: true });
  });
  it("routes ordinary questions to research and /search to ranked-link retrieval", () => {
    const view = render(<MemoryRouter><Routes><Route path="/" element={<HomeRoute />} /><Route path="*" element={<LocationProbe />} /></Routes></MemoryRouter>);
    const prompt = screen.getByLabelText("Search query");
    fireEvent.change(prompt, { target: { value: "when did apollo 11 land?" } });
    fireEvent.submit(prompt.closest("form")!);
    expect(screen.getByTestId("location")).toHaveTextContent("/topics/new?kind=research&q=when%20did%20apollo%2011%20land%3F");
    view.unmount();

    render(<MemoryRouter><Routes><Route path="/" element={<HomeRoute />} /><Route path="*" element={<LocationProbe />} /></Routes></MemoryRouter>);
    const search = screen.getByLabelText("Search query");
    fireEvent.change(search, { target: { value: "/search apollo 11 landing" } });
    fireEvent.submit(search.closest("form")!);
    expect(screen.getByTestId("location")).toHaveTextContent("/topics/new?kind=search&q=apollo%2011%20landing");
  });
  it.each(["/threads", "/settings"])("uses unmodified i to focus the prompt from %s", (path) => {
    render(<MemoryRouter initialEntries={[path]}><GlobalShortcuts /><input aria-label="Search query" /></MemoryRouter>);
    const prompt = screen.getByLabelText("Search query");
    fireEvent.keyDown(window, { key: "i" });
    expect(document.activeElement).toBe(prompt);
  });
  it("opens threads with Alt+S even while the prompt is focused", () => {
    render(<MemoryRouter initialEntries={["/"]}><Routes><Route path="*" element={<><GlobalShortcuts /><input aria-label="Search query" /><LocationProbe /></>} /></Routes></MemoryRouter>);
    const prompt = screen.getByLabelText("Search query");
    prompt.focus();
    fireEvent.keyDown(prompt, { key: "s", code: "KeyS", altKey: true });
    expect(screen.getByTestId("location")).toHaveTextContent("/threads");
  });
  it.each(["/threads", "/settings"])("leaves %s on Escape", (path) => {
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<><GlobalShortcuts /><LocationProbe /></>} /></Routes></MemoryRouter>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });
});
