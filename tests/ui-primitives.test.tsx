import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Action } from "../src/ui/primitives/Action";
import { FuzzyListbox } from "../src/ui/primitives/FuzzyListbox";
import { MarkdownContent } from "../src/ui/primitives/MarkdownContent";
import { StatusText } from "../src/ui/primitives/StatusText";
import { TextField } from "../src/ui/primitives/TextField";
import { VisuallyHidden } from "../src/ui/primitives/VisuallyHidden";
import { rankFuzzyCandidates } from "../src/ui/policies/fuzzy";
import { rankPromptSuggestions, rankThreads } from "../src/ui/policies/ranking";
import type { ThreadSummary } from "../src/domain/types";

describe("browser semantic primitives", () => {
  it("keeps native action and text-field semantics", () => {
    render(<>
      <Action href="/threads">Threads</Action>
      <TextField label="Question" description="Ask anything" />
      <StatusText>Ready</StatusText>
      <VisuallyHidden>Instructions</VisuallyHidden>
    </>);
    expect(screen.getByRole("link", { name: "Threads" })).toHaveAttribute("href", "/threads");
    expect(screen.getByRole("textbox", { name: "Question Ask anything" })).toHaveAttribute("aria-describedby");
    expect(screen.getByRole("status")).toHaveTextContent("Ready");
    expect(screen.getByText("Instructions")).toHaveClass("ui-visually-hidden");
  });

  it("provides listbox keyboard selection without owning ranking", () => {
    const onSelect = vi.fn();
    render(<FuzzyListbox
      id="fuzzy-listbox"
      ariaLabel="Suggestions"
      items={[{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }]}
      activeId="a"
      getItemId={(item) => item.id}
      renderItem={(item) => item.text}
      onSelect={onSelect}
    />);
    const list = screen.getByRole("listbox");
    expect(list).toHaveAttribute("aria-activedescendant", "fuzzy-listbox-option-a");
    list.focus();
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith({ id: "a", text: "Alpha" });
  });

  it("sanitizes markdown while preserving liberal formatting", () => {
    render(<MarkdownContent markdown={"Hello **world**\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<a href=\"javascript:alert(1)\">bad</a>"} />);
    expect(screen.getByText("world")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("javascript:alert(1)");
  });
});

describe("fuzzy policies", () => {
  it("returns project-owned matches and positions", () => {
    const result = rankFuzzyCandidates([{ id: "one", searchText: "Alpha" }, { id: "two", searchText: "Beta" }], "alp");
    expect(result[0]?.id).toBe("one");
    expect(result[0]?.positions).toEqual([0, 1, 2]);
    expect(result[0]).not.toHaveProperty("item");
  });

  it("ranks threads by fuzzy title/preview and deterministic empty order", () => {
    const threads = [
      { id: "b" as ThreadSummary["id"], title: "Beta", createdAt: "2026-01-01T00:00:00.000Z" as ThreadSummary["createdAt"], updatedAt: "2026-01-02T00:00:00.000Z" as ThreadSummary["updatedAt"], turnCount: 1, legacyArchiveCount: 0 },
      { id: "a" as ThreadSummary["id"], title: "Alpha", createdAt: "2026-01-01T00:00:00.000Z" as ThreadSummary["createdAt"], updatedAt: "2026-01-03T00:00:00.000Z" as ThreadSummary["updatedAt"], turnCount: 1, legacyArchiveCount: 0, lastRequestPreview: "question" },
    ];
    expect(rankThreads(threads, "").map((entry) => entry.thread.id)).toEqual(["a", "b"]);
    expect(rankThreads(threads, "ques")[0]?.thread.id).toBe("a");
    expect(rankThreads(threads, "ques")[0]?.previewPositions.length).toBeGreaterThan(0);
  });

  it("keeps prompt suggestions in declared order for an empty query", () => {
    const suggestions = [
      { id: "new" as const, command: "/new" as const, description: "start", aliases: ["fresh"] },
      { id: "threads" as const, command: "/threads" as const, description: "browse", aliases: ["history"] },
    ];
    expect(rankPromptSuggestions(suggestions, "").map((entry) => entry.suggestion.id)).toEqual(["new", "threads"]);
    expect(rankPromptSuggestions(suggestions, "history")[0]?.suggestion.id).toBe("threads");
  });
});
