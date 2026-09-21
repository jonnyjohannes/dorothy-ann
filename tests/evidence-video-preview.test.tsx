import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceRecord } from "../src/domain/types";
import { EvidenceBox } from "../src/ui/boxes/EvidenceBox";

const supportedVideo: Extract<SourceRecord, { kind: "video" }> = {
  kind: "video",
  sourceId: "src_video_preview" as never,
  title: "Supported preview",
  url: "https://www.youtube.com/watch?v=LXb3EKWsInQ",
  canonicalUrl: "https://www.youtube.com/watch?v=LXb3EKWsInQ",
  displayUrl: "youtube.com",
  videoUrl: "https://www.youtube.com/watch?v=LXb3EKWsInQ",
  sourcePageUrl: "https://publisher.example/videos/preview",
  thumbnailUrl: "https://cdn.example/preview.jpg",
};

afterEach(() => {
  cleanup();
});

describe("EvidenceBox viewport provider boundary", () => {
  it("keeps the linked Brave thumbnail when viewport observation is unavailable", () => {
    render(<EvidenceBox sources={[supportedVideo]} onIntent={vi.fn()} />);

    const fallback = screen.getByRole("link", { name: "Video result preview: Supported preview" });
    expect(fallback.querySelector("img")).toHaveAttribute("src", "https://cdn.example/preview.jpg");
    expect(document.querySelector("video, iframe")).toBeNull();
    expect(screen.getByRole("link", { name: "Video result: Supported preview" })).toHaveAttribute("href", "https://publisher.example/videos/preview");
  });
});
