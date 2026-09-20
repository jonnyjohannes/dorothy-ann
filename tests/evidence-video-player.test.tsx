import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceRecord } from "../src/domain/types";
import { EvidenceBox } from "../src/ui/boxes/EvidenceBox";

const { canPlayMock } = vi.hoisted(() => ({ canPlayMock: vi.fn() }));

vi.mock("react-player", () => {
  interface MockPlayerProps {
    controls?: boolean;
    height?: number | string;
    onError?: () => void;
    playing?: boolean;
    playsInline?: boolean;
    src?: string;
    width?: number | string;
  }

  function MockPlayer(props: MockPlayerProps) {
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

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  readonly disconnect = vi.fn();
  readonly observe = vi.fn((target: Element) => {
    this.target = target;
  });
  readonly takeRecords = vi.fn(() => []);
  readonly unobserve = vi.fn();
  private target?: Element;

  constructor(private readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean) {
    if (!this.target) throw new Error("IntersectionObserver target was not observed.");
    this.callback([{ isIntersecting, target: this.target } as IntersectionObserverEntry], this);
  }
}

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
  MockIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EvidenceBox portable video player", () => {
  it("keeps a supported provider unmounted while its video card is offscreen", () => {
    canPlayMock.mockReturnValue(true);
    render(<EvidenceBox sources={[videoSource()]} onIntent={vi.fn()} />);

    expect(canPlayMock).toHaveBeenCalledWith("https://www.youtube.com/watch?v=demo");
    expect(screen.queryByTestId("mock-react-player")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Video result preview: Portable player demo" })).toHaveAttribute("href", "https://publisher.example/videos/demo");
    expect(MockIntersectionObserver.instances).toHaveLength(1);
  });

  it("mounts the provider paused after viewport entry with native controls", () => {
    canPlayMock.mockReturnValue(true);
    render(<EvidenceBox sources={[videoSource()]} onIntent={vi.fn()} />);

    act(() => MockIntersectionObserver.instances[0]?.trigger(true));

    const player = screen.getByTestId("mock-react-player");
    expect(player).toHaveAttribute("data-src", "https://www.youtube.com/watch?v=demo");
    expect(player).toHaveAttribute("data-playing", "false");
    expect(player).toHaveAttribute("data-controls", "true");
    expect(player).toHaveAttribute("data-plays-inline", "true");
    expect(player).toHaveAttribute("data-width", "100%");
    expect(player).toHaveAttribute("data-height", "100%");
    expect(screen.queryByRole("button", { name: /Play video/ })).not.toBeInTheDocument();
  });

  it("does not mount for a non-intersecting observation and disconnects on cleanup", () => {
    canPlayMock.mockReturnValue(true);
    const view = render(<EvidenceBox sources={[videoSource()]} onIntent={vi.fn()} />);
    const observer = MockIntersectionObserver.instances[0];

    act(() => observer?.trigger(false));
    expect(screen.queryByTestId("mock-react-player")).not.toBeInTheDocument();

    view.unmount();
    expect(observer?.disconnect).toHaveBeenCalledOnce();
  });

  it("keeps unsupported video thumbnails as external links without observing", () => {
    render(<EvidenceBox sources={[videoSource()]} onIntent={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Video result preview: Portable player demo" })).toHaveAttribute("href", "https://publisher.example/videos/demo");
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });

  it("restores the linked thumbnail after a runtime playback failure", () => {
    canPlayMock.mockReturnValue(true);
    render(<EvidenceBox sources={[videoSource()]} onIntent={vi.fn()} />);
    act(() => MockIntersectionObserver.instances[0]?.trigger(true));

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
    const imageAttachment = screen.getByRole("link", { name: "Image result preview: Detached image" });
    expect(imageAttachment).toHaveAttribute("href", "https://publisher.example/images/image");
    expect(canPlayMock).not.toHaveBeenCalled();
  });
});
