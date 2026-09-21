import { describe, expect, it } from "vitest";
import { THREAD_RETENTION_MS, threadExpiryAt } from "../src/domain/retention.js";

describe("thread retention policy", () => {
  it("expires exactly seven days after durable activity", () => {
    const activity = "2026-01-01T00:00:00.000Z" as never;
    expect(THREAD_RETENTION_MS).toBe(7 * 86_400_000);
    expect(threadExpiryAt(activity)).toBe("2026-01-08T00:00:00.000Z");
  });
});
