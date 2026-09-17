import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IndexedDbThreadStore } from "../../infrastructure/browser/indexeddb-thread-store";
import type { ThreadId, ThreadSummary } from "../../domain/types";
import { ThreadsBox } from "../boxes/ThreadsBox";
import { StickyHeader } from "../boxes/StickyHeader";
import type { BoxIntent } from "../boxes/box-types";
import styles from "../App.module.css";

let store: IndexedDbThreadStore | undefined;
const getStore = () => store ??= new IndexedDbThreadStore();
export function ThreadsRoute() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getStore().list();
    if (result.ok) { setThreads(result.value.map((entry) => entry.summary)); setError(undefined); }
    else setError("Threads could not be loaded.");
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const onIntent = (intent: BoxIntent) => {
    if (intent.type === "thread_open_requested") navigate(`/topics/${encodeURIComponent(String(intent.threadId))}`);
    else if (intent.type === "thread_delete_requested") void getStore().remove({ threadId: intent.threadId }).then(() => refresh());
    else if (intent.type === "new_thread_requested") navigate("/new", { replace: true });
    else if (intent.type === "retry_requested") void refresh();
  };
  return <main className={styles.shell}>
    <StickyHeader onIntent={onIntent} />
    <ThreadsBox state={{ threads, loading, error }} onIntent={onIntent} />
  </main>;
}

export type { ThreadId };
