import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandBox } from "../src/ui/boxes/BrandBox";
import { PromptBox } from "../src/ui/boxes/PromptBox";
import { ThreadsBox } from "../src/ui/boxes/ThreadsBox";
import { UnlockBox } from "../src/ui/boxes/UnlockBox";
import { TranscriptBox } from "../src/ui/boxes/TranscriptBox";
import { rankThreads, transcriptItems } from "../src/ui/boxes/box-policies";
import type { Thread, ThreadSummary } from "../src/domain/model-v3";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const source = { sourceId: "src_1" as never, title: "Source", url: "https://example.com", canonicalUrl: "https://example.com", displayUrl: "example.com" };
const thread: Thread = { schemaVersion: 3, id: "thread_1" as never, title: "Topic", createdAt: "2026-01-01T00:00:00.000Z" as never, updatedAt: "2026-01-01T00:00:00.000Z" as never, sources: [ { ...source, ordinal: 1 } ], turns: [], legacyArchive: [{ id: "legacy_1" as never, originalIndex: 0, legacyKind: "chat", legacyStatus: "completed", createdAt: "2026-01-01T00:00:00.000Z" as never, finishedAt: "2026-01-01T00:00:00.000Z" as never, request: "Old question", answerMarkdown: "old answer [[cite:missing]]", destinations: [] }], };
const summaries: ThreadSummary[] = [{ id: "thread_1" as never, title: "Topic", createdAt: "2026-01-01T00:00:00.000Z" as never, updatedAt: "2026-01-02T00:00:00.000Z" as never, turnCount: 1, legacyArchiveCount: 0 }];

describe("v3 product boxes", () => {
  it("brands only emit new-thread intent", () => { const onIntent = vi.fn(); render(<BrandBox onIntent={onIntent} />); fireEvent.click(screen.getByRole("button", { name: "New topic" })); expect(onIntent).toHaveBeenCalledWith({ type: "new_thread_requested" }); });
  it("keeps command suggestions and double escape local to prompt", () => { const onIntent = vi.fn(); const onChange = vi.fn(); render(<PromptBox value="/" onChange={onChange} onIntent={onIntent} />); expect(screen.getByRole("listbox")).toBeInTheDocument(); fireEvent.keyDown(screen.getByLabelText("Search query"), { key: "Escape" }); expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); });
  it("requires inline deletion confirmation", () => { const onIntent = vi.fn(); render(<ThreadsBox state={{ threads: summaries }} onIntent={onIntent} />); fireEvent.click(screen.getByRole("button", { name: "Delete Topic" })); expect(screen.getByRole("group", { name: "Confirm deletion of Topic" })).toBeInTheDocument(); expect(onIntent).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Delete" })); expect(onIntent).toHaveBeenCalledWith({ type: "thread_delete_requested", threadId: "thread_1" }); });
  it("labels archive history and leaves unknown citations inert", () => { const onIntent = vi.fn(); render(<TranscriptBox thread={thread} sources={[source]} onIntent={onIntent} />); expect(screen.getByText("legacy, not evidence-verified")).toBeInTheDocument(); expect(screen.getByLabelText("Topic scrollback")).toHaveTextContent("[[cite:missing]]"); expect(screen.queryByRole("link", { name: "missing" })).not.toBeInTheDocument(); expect(onIntent).not.toHaveBeenCalled(); });
  it("clears passphrases before emitting submit intent", () => { const onIntent = vi.fn(); render(<UnlockBox onIntent={onIntent} />); const input = screen.getByLabelText("Passphrase"); fireEvent.change(input, { target: { value: "secret" } }); fireEvent.submit(input); expect(onIntent).toHaveBeenCalledWith({ type: "passphrase_submitted", passphrase: "secret" }); expect(input).toHaveValue(""); });
  it("orders transcript archive items deterministically and ranks threads", () => { expect(transcriptItems(thread)[0].kind).toBe("legacy"); expect(rankThreads(summaries, "top")).toHaveLength(1); });
});
