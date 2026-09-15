import { describe, expect, it } from "vitest";
import { headingAccentSlot, readColorScheme, sourceAccentSlot } from "../src/ui/color-scheme";

describe("color scheme policy", () => {
  it("falls back to mono for missing or invalid values", () => {
    expect(readColorScheme(null)).toBe("mono");
    expect(readColorScheme("not-a-scheme")).toBe("mono");
    expect(readColorScheme("rose-pine")).toBe("rose-pine");
  });

  it("keeps source slots stable and bounded", () => {
    const slot = sourceAccentSlot("source-a", 8);
    expect(slot).toBe(sourceAccentSlot("source-a", 8));
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(8);
    expect(sourceAccentSlot("source-a", 0)).toBe(0);
  });

  it("rotates heading slots by document order", () => {
    expect([0, 1, 2, 3, 4].map((index) => headingAccentSlot(index, 3))).toEqual([0, 1, 2, 0, 1]);
  });
});
