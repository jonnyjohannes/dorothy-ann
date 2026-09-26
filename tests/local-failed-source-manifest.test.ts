// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalFailedSourceManifest } from "../scripts/local-failed-source-manifest.js";

describe("private selected-failure manifest", () => {
  it("uses restricted OS-temp permissions and sanitizes URLs before storing failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "dorothy-manifest-test-"));
    try {
      const manifest = await createLocalFailedSourceManifest(root);
      expect((await stat(dirname(manifest.path))).mode & 0o777).toBe(0o700);
      expect((await stat(manifest.path)).mode & 0o777).toBe(0o600);
      manifest.record({ url: "https://source.example.org/story?token=PRIVATE_TOKEN&id=12#PRIVATE_FRAGMENT", rank: 1, status: "skipped", reason: "empty_content" });
      manifest.record({ url: "https://source.example.org/blocked", rank: 2, status: "failed", reason: "fetch_failed" });
      manifest.record({ url: "https://user:PRIVATE_PASSWORD@source.example.org/unsafe", rank: 3, status: "skipped", reason: "unsafe_url" });
      manifest.record({ url: "https://source.example.org/invalid", rank: 0, status: "skipped", reason: "empty_content" });
      manifest.record({ url: "https://source.example.org/invalid", rank: 1, status: "failed", reason: "PRIVATE_REASON" });
      await manifest.flush();
      const text = await readFile(manifest.path, "utf8");
      const entries = text.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(entries).toEqual([
        { index: 1, url: "https://source.example.org/story", rank: 1, status: "skipped", reason: "empty_content", query_removed: true },
        { index: 2, url: "https://source.example.org/blocked", rank: 2, status: "failed", reason: "fetch_failed", query_removed: false },
      ]);
      expect(text).not.toMatch(/PRIVATE|token=|#|password/i);
      await manifest.dispose();
      await expect(stat(manifest.path)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("caps a process at twelve entries and preserves assigned indices", async () => {
    const root = await mkdtemp(join(tmpdir(), "dorothy-manifest-test-"));
    try {
      const manifest = await createLocalFailedSourceManifest(root);
      for (let index = 0; index < 20; index++) manifest.record({
        url: `https://source.example.org/page-${index}`, rank: 1, status: "skipped", reason: "empty_content",
      });
      await manifest.flush();
      const entries = (await readFile(manifest.path, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { index: number });
      expect(entries.map((entry) => entry.index)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
      await manifest.dispose();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
