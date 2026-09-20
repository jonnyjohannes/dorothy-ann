import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceRecord } from "../src/domain/types";
import { EvidenceBox } from "../src/ui/boxes/EvidenceBox";

const { canPlayMock } = vi.hoisted(() => ({ canPlayMock: vi.fn() }));

vi.mock("react-player", async () => {
  const React = await import("react");

  interface MockPlayerProps {
    controls?: boolean;
    height?: number | string;
    light?: React.ReactNode;
    onClickPreview?: () => void;
    onError?: () => void;
    playIcon?: React.ReactNode;
    playing?: boolean;
    playsInline?: boolean;
    previewTabIndex?: number;
    src?: string;
    width?: number | string;
  }

  function MockPlayer(props: MockPlayerProps) {
    const [activated, setActivated] = React.useState(false);
    const activate = () => {
      setActivated(true);
      props.onClickPreview?.();
    };

    if (!activated) {
      return <div tabIndex={props.previewTabIndex} onClick={activate}>{props.light}{props.playIcon}</div>;
    }

    return <div
      data-testid="mock-react-player"
      data-src={props.src}
      data-playing={String(props.playing)}
      data-controls={String(props.controls)}
      data-plays-inline={String(props.playsInline)}
      data-width={props.width}
      data-height={props.height}
    >
      <button type="button" onClick={() => props.onError?.()}>Simulate playback error</button>
    </div>;
  }

  return { default: Object.assign(MockPlayer, { canPlay: canPlayMock }) };
});

type VideoSource = Extract<SourceRecord, { kind: "video" }>;
type ImageSource = Extract<SourceRecord, { kind: "image" }>;

function videoSource(overrides: Partial<VideoSource> = {}): VideoSource {
  return {
    kind: "video",
    sourceId: "src_video" as never,
    title: "Portable player demo",
    url: "https://video.example/watch/demo",
    canonicalUrl: "https://video.example/watch/demo",
    displayUrl: "video.example",
    videoUrl: "https://www.youtube.com/watch?v=demo",
    sourcePageUrl: "https://publisher.example/videos/demo",
    thumbnailUrl: "https://cdn.example/demo.jpg",
    snippet: "Video description",
    ...overrides,
  };
}

function imageSource(): ImageSource {
  return {
    kind: "image",
    sourceId: "src_image" as never,
    title: "Detached image",
    url: "https://cdn.example/image.jpg",
    canonicalUrl: "https://cdn.example/image.jpg",
    displayUrl: "publisher.example",
    imageUrl: "https://cdn.example/image.jpg",
    sourcePageUrl: "https://publisher.example/images/image",
    thumbnailUrl: "https://cdn.example/image-thumbnail.jpg",
    snippet: "Image description",
  };
}

beforeEach(() => {
  canPlayMock.mockReset();
  canPlayMock.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
});

describe("EvidenceBox portable video player", () => {
  it("uses a supported video thumbnail as a click-to-load light preview", () => {
    canPlayMock.mockReturnValue(true);
    render(<EvidenceBox sources={[videoSource()]} onIntent={vi.fn()} />);

    const preview = screen.getByRole("button", { name: "Play video: Portable player demo" });
    expect(canPlayMock).toHaveBeenCalledWith("https://www.youtube.com/watch?v=demo");
    expect(screen.queryByTestId("mock-react-player")).not.toBeInTheDocument();
    expect(preview.parentElement?.querySelector("img")).toHaveAttribute("src", "https://cdn.example/demo.jpg");

    fireEvent.click(preview);

    expect(screen.getByTestId("mock-react-player")).toHaveAttribute("data-src", "https://www.youtube.com/watch?v=demo");
    expect(screen.getByTestId("mock-react-player")).toHaveAttribute("data-playing", "true");
    expect(screen.getByTestId("mock-react-player")).toHaveAttribute("data-controls", "true");
    expect(screen.getByTestId("mock-react-player")).toHaveAttribute("data-plays-inline", "true");
  });

  it("keeps unsupported video thumbnails as external links", () => {
    render(<EvidenceBox sources={[videoSource()]} onIntent={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Play video/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Video result preview: Portable player demo" })).toHaveAttribute("href", "https://publisher.example/videos/demo");
  });

  it("restores the linked thumbnail after a runtime playback failure", () => {
    canPlayMock.mockReturnValue(true);
    render(<EvidenceBox sources={[videoSource()]} onIntent={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Play video: Portable player demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate playback error" }));

    expect(screen.queryByTestId("mock-react-player")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Video result preview: Portable player demo" })).toHaveAttribute("href", "https://publisher.example/videos/demo");
  });

  it("keeps the video title as an external source-page link", () => {
    canPlayMock.mockReturnValue(true);
    render(<EvidenceBox sources={[videoSource()]} onIntent={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Video result: Portable player demo" })).toMatchObject({
      href: "https://publisher.example/videos/demo",
      target: "_blank",
    });
  });

  it("provides a named, focusable keyboard activation target", () => {
    canPlayMock.mockReturnValue(true);
    render(<EvidenceBox sources={[videoSource()]} onIntent={vi.fn()} />);

    const preview = screen.getByRole("button", { name: "Play video: Portable player demo" });
    preview.focus();
    expect(preview).toHaveFocus();
    fireEvent.click(preview);
    expect(screen.getByTestId("mock-react-player")).toBeInTheDocument();
  });

  it("leaves image attachments and ordinary link snippets unchanged", () => {
    const link: SourceRecord = {
      sourceId: "src_link" as never,
      title: "Ordinary link",
      url: "https://example.com/article",
      canonicalUrl: "https://example.com/article",
      displayUrl: "example.com",
      snippet: "Ordinary snippet",
    };
    render(<EvidenceBox sources={[link, imageSource()]} onIntent={vi.fn()} />);

    expect(screen.getByText("Ordinary snippet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Image result preview: Detached image" })).toHaveAttribute("href", "https://publisher.example/images/image");
    expect(screen.queryByRole("button", { name: /Play video/ })).not.toBeInTheDocument();
    expect(canPlayMock).not.toHaveBeenCalled();
  });
});
