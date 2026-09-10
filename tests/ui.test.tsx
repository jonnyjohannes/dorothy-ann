import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/ui/App";

afterEach(() => vi.restoreAllMocks());

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
});
