import { describe, expect, it, vi } from "vitest";
import { analyticsBeforeSend, telemetryRoute } from "../src/infrastructure/browser/telemetry-policy";

describe("Vercel telemetry privacy boundary", () => {
  it("only admits coarse allowlisted paths", () => {
    expect(["/", "/new", "/threads", "/settings", "/threads/private-id", "/threads/new", "/unlock", "/mystery"].map(telemetryRoute))
      .toEqual(["/", "/new", "/threads", "/settings", "/threads/:threadId", null, null, null]);
  });

  it("drops unsafe analytics events and sends only anonymized same-origin pageviews", () => {
    expect(analyticsBeforeSend({ type: "pageview", url: `${location.origin}/threads/private-id?q=secret#fragment` }))
      .toEqual({ type: "pageview", url: `${location.origin}/threads/:threadId` });
    expect(analyticsBeforeSend({ type: "pageview", url: `${location.origin}/threads/new?q=private` })).toBeNull();
    expect(analyticsBeforeSend({ type: "pageview", url: `${location.origin}/unlock?returnTo=/threads/private` })).toBeNull();
    expect(analyticsBeforeSend({ type: "pageview", url: "https://other.test/settings" })).toBeNull();
    expect(analyticsBeforeSend({ type: "event", url: `${location.origin}/` })).toBeNull();
  });

  it("does not throw on invalid URLs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(analyticsBeforeSend({ type: "pageview", url: "http://[" })).toBeNull();
    spy.mockRestore();
  });
});
