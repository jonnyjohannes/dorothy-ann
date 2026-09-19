import type { ThreadStore } from "../../ports/storage-v3";
import { IndexedDbThreadStore } from "./indexeddb-thread-store";
import { BrowserRemoteThreadStore } from "./remote-thread-store";

interface StatusResponse { storage?: boolean }

let storePromise: Promise<ThreadStore> | undefined;

/** Select shared server storage when configured; keep fixture/local mode browser-local. */
export function getBrowserThreadStore(): Promise<ThreadStore> {
  return storePromise ??= fetch("/api/status", { headers: { accept: "application/json" } })
    .then(async (response) => {
      if (response.ok) {
        const status = await response.json() as StatusResponse;
        if (status.storage === true) return new BrowserRemoteThreadStore();
      }
      return new IndexedDbThreadStore();
    })
    .catch(() => new IndexedDbThreadStore());
}
