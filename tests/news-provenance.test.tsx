import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Thread } from "../src/domain/types";
import { EvidenceBox } from "../src/ui/boxes/EvidenceBox";
import { newsSourceIds } from "../src/ui/policies/news-provenance";

const id = `src_${"A".repeat(43)}` as Thread["sources"][number]["sourceId"];
const source = { kind: "link" as const, sourceId: id, ordinal: 1, title: "Article", url: "https://example.com/article", canonicalUrl: "https://example.com/article", displayUrl: "example.com/article" };
const thread = (turns: Thread["turns"]): Thread => ({ schemaVersion: 3, id: "00000000-0000-4000-8000-000000000001" as never, title: "News", createdAt: "2026-01-01T00:00:00.000Z" as never, updatedAt: "2026-01-01T00:00:00.000Z" as never, sources: [source], turns, legacyArchive: [] });
const searchTurn = (resultKind: "link" | "news") => ({ kind: "search", status: "completed", result: { completion: "results", resultKind, destinations: [{ sourceId: id, rank: 1 }] } }) as Thread["turns"][number];
const researchTurn = (evidence: Array<{ sourceId: typeof id; rank: number }>) => ({ kind: "research", status: "completed", result: { resolution: { tasks: [{ surface: "news", evidence }] } } }) as Thread["turns"][number];

describe("news discovery cue", () => {
  it("badges one link card on completed raw news discovery in either arrival order and after reload", () => {
    const onIntent = vi.fn();
    const loaded = JSON.parse(JSON.stringify(thread([searchTurn("link"), searchTurn("news")]))) as Thread;
    for (const turns of [loaded.turns, [...loaded.turns].reverse()]) {
      const view = render(<EvidenceBox sources={loaded.sources} discoveredViaNews={newsSourceIds(thread(turns))} onIntent={onIntent} />);
      expect(screen.getAllByText("News")).toHaveLength(1);
      expect(screen.getByRole("link", { name: "Link result: Article" })).toHaveAttribute("href", source.url);
      expect(screen.getByRole("complementary", { name: "Evidence" }).querySelectorAll("li")).toHaveLength(1);
      const card = screen.getByRole("link", { name: "Link result: Article" });
      fireEvent.focus(card);
      expect(onIntent).toHaveBeenCalledWith({ type: "source_open_requested", sourceId: id });
      view.unmount();
    }
  });

  it("uses only viable news task refs, including already extracted reuse; failed candidates stay unbadged", () => {
    expect(newsSourceIds(thread([searchTurn("link"), researchTurn([])])).size).toBe(0);
    const discovered = newsSourceIds(thread([searchTurn("link"), researchTurn([{ sourceId: id, rank: 1 }])]));
    expect(discovered.has(id)).toBe(true);
    const view = render(<EvidenceBox sources={[source]} discoveredViaNews={discovered} onIntent={vi.fn()} />);
    const metadata = screen.getByText("News").closest("small");
    expect(metadata).toHaveTextContent("News · example.com/article");
    expect(metadata?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    view.unmount();
    render(<EvidenceBox sources={[source]} discoveredViaNews={newsSourceIds(thread([searchTurn("link"), researchTurn([])]))} onIntent={vi.fn()} />);
    expect(screen.queryByText("News")).not.toBeInTheDocument();
  });
});
