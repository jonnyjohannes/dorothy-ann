import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/ui/App";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("browser shell", () => {
  it("renders the fixture composer after the readiness check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ fixtureMode: true }), { status: 200 })));
    render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
    expect(await screen.findByLabelText("Search query")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("...? for research")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  });

  it("redirects live unauthenticated users to unlock", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ fixtureMode: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText("Passphrase")).toBeInTheDocument());
  });

  it("consumes an external q entry as one lookup", async () => {
    const results = [{ sourceId: "source-external", rank: 1, title: "External result", url: "https://example.com/result", canonicalUrl: "https://example.com/result", displayUrl: "example.com", snippet: "A result from the browser search entry." }];
    const fetcher = vi.fn().mockImplementation((input: string) => {
      if (input === "/api/providers/status") return Promise.resolve(new Response(JSON.stringify({ fixtureMode: true }), { status: 200 }));
      if (input === "/api/lookup") return Promise.resolve(new Response(JSON.stringify({ results }), { status: 200 }));
      return Promise.reject(new Error(`unexpected request: ${input}`));
    });
    vi.stubGlobal("fetch", fetcher);
    render(<MemoryRouter initialEntries={["/?q=life%20alive"]}><App /></MemoryRouter>);
    expect(await screen.findByText("External result")).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([input]) => input === "/api/lookup")).toHaveLength(1);
  });
});
