import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IndexedDbThreadStore } from "../../infrastructure/browser/indexeddb-thread-store";
import type { ThreadId, ThreadSummary } from "../../domain/types";
import { ThreadsBox } from "../boxes/ThreadsBox";
import { PromptBox } from "../boxes/PromptBox";
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
  const [prompt, setPrompt] = useState("");
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
    else if (intent.type === "new_thread_requested") navigate("/", { replace: true });
    else if (intent.type === "retry_requested") void refresh();
    else if (intent.type === "route_escape_requested") navigate("/", { replace: true });
    else if (intent.type === "prompt_submitted") navigate(`/topics/new?q=${encodeURIComponent(intent.value)}`);
    else if (intent.type === "command_requested") {
      if (intent.command === "/new") navigate("/", { replace: true });
      else if (intent.command === "/settings") navigate("/settings");
      else if (intent.command === "/threads") setPrompt("");
    }
  };
  return <main className={styles.shell}>
    <StickyHeader onIntent={onIntent} />
    <section className={styles.routeLayout}>
      <h1 className={styles.pageTitle}><code>/threads</code></h1>
      <ThreadsBox state={{ threads, loading, error }} onIntent={onIntent} />
    </section>
    <PromptBox value={prompt} onChange={setPrompt} onIntent={onIntent} />
  </main>;
}

export type { ThreadId };
