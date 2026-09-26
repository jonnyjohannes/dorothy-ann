/* Explicit local development diagnostic. Never import into the portable app or client. */
import { appendFile, chmod, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type FailedEntry = { url: string; rank: number; status: "skipped" | "failed"; reason: string };
const skipped = new Set(["duplicate", "unsafe_url", "blocked", "unsupported_content", "empty_content", "limit_reached"]);
const failed = new Set(["fetch_failed", "timeout", "extract_failed"]);

function sanitize(entry: FailedEntry) {
  if (!Number.isInteger(entry.rank) || entry.rank < 1 || entry.rank > 5) return null;
  if (!(entry.status === "skipped" ? skipped : entry.status === "failed" ? failed : new Set()).has(entry.reason)) return null;
  try {
    const url = new URL(entry.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const query_removed = Boolean(url.search);
    url.search = "";
    url.hash = "";
    return { url: url.toString(), rank: entry.rank, status: entry.status, reason: entry.reason, query_removed };
  } catch { return null; }
}

/** Only a private OS-temp manifest, never the server logger or durable turn. */
export async function createLocalFailedSourceManifest(baseDir = tmpdir()) {
  const directory = await mkdtemp(join(baseDir, "dorothy-failed-"));
  await chmod(directory, 0o700);
  const path = join(directory, "failures.jsonl");
  const handle = await open(path, "wx", 0o600);
  await handle.close();
  await chmod(path, 0o600);
  let count = 0;
  let pending = Promise.resolve();
  return {
    path,
    record(entry: FailedEntry) {
      if (count >= 12) return;
      const safe = sanitize(entry);
      if (!safe) return;
      const index = ++count;
      pending = pending.then(() => appendFile(path, JSON.stringify({ index, ...safe }) + "\n")).catch(() => {});
    },
    flush: () => pending,
    dispose: async () => { await pending; await rm(directory, { recursive: true, force: true }); },
  };
}
