import { describe, expect, it } from "vitest";
import { defaultAccentSlot, headingAccentSlot, inlineAccentSlot, primaryAccentSlot, readColorScheme, readPrimaryAccent, sourceAccentSlot } from "../src/ui/color-scheme";

describe("color scheme policy", () => {
  it("falls back to mono for missing or invalid values", () => {
    expect(readColorScheme(null)).toBe("mono");
    expect(readColorScheme("not-a-scheme")).toBe("mono");
    expect(readColorScheme("rose-pine")).toBe("rose-pine");
  });

  it("keeps source slots stable, bounded, and thread-specific", () => {
    const slot = sourceAccentSlot("source-a", 8, "thread-a");
    expect(slot).toBe(sourceAccentSlot("source-a", 8, "thread-a"));
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(8);
    expect(sourceAccentSlot("source-a", 0, "thread-a")).toBe(0);
    expect(sourceAccentSlot("source-a", 8, "thread-a")).not.toBe(sourceAccentSlot("source-a", 8, "thread-b"));
  });

  it("selects scheme defaults and validates primary accents", () => {
    expect(defaultAccentSlot("catppuccin")).toBe(5);
    expect(primaryAccentSlot("rose-pine", "3")).toBe(3);
    expect(readPrimaryAccent("9")).toBe("default");
    expect(readPrimaryAccent("e068a5")).toBe("e068a5");
    expect(readPrimaryAccent("fbf719")).toBe("fbf719");
    expect(primaryAccentSlot("mono", "7")).toBe(0);
    expect(primaryAccentSlot("rose-pine", "e068a5")).toBe(0);
  });

  it("keeps headings stable within a thread and spreads inline accents", () => {
    const headings = [0, 1, 2, 3, 4].map((index) => headingAccentSlot(index, 8, "thread-a"));
    expect(new Set(headings).size).toBe(1);
    expect(headingAccentSlot(0, 8, "thread-a")).not.toBe(headingAccentSlot(0, 8, "thread-b"));
    const inline = [0, 1, 2, 3].map((index) => inlineAccentSlot(index, 8, "thread-a"));
    expect(new Set(inline).size).toBe(4);
    expect(inline).not.toEqual([0, 1, 2, 3]);
  });
});
