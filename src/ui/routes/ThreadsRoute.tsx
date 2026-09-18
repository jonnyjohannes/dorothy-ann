import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBrowserThreadStore } from "../../infrastructure/browser/thread-store";
import type { ThreadId, ThreadSummary } from "../../domain/types";
import { ThreadsBox } from "../boxes/ThreadsBox";
import { StickyHeader } from "../boxes/StickyHeader";
import type { BoxIntent } from "../boxes/box-types";
import { turnLocation, workspaceController } from "../controllers/workspace-controller";
import styles from "../App.module.css";

export function ThreadsRoute() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [commandMessage, setCommandMessage] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await (await getBrowserThreadStore()).list();
    if (result.ok) { setThreads(result.value.map((entry) => entry.summary)); setError(undefined); }
    else setError("Threads could not be loaded.");
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const onIntent = (intent: BoxIntent) => {
    if (intent.type === "thread_open_requested") navigate(`/threads/${encodeURIComponent(String(intent.threadId))}`);
    else if (intent.type === "thread_delete_requested") void getBrowserThreadStore().then((store) => store.remove({ threadId: intent.threadId })).then(() => refresh());
    else if (intent.type === "retry_requested") void refresh();
    else if (intent.type === "route_escape_requested") navigate("/", { replace: true });
    else {
      const command = workspaceController.command(intent);
      if (!command) return;
      if (command.type === "navigate") navigate(command.to, { replace: command.replace });
      else if (command.type === "submit") navigate(turnLocation(command.value, command.kind));
      else if (command.type === "invalid") setCommandMessage(command.message);
    }
  };
  return <main className={styles.shell}>
    <StickyHeader onIntent={onIntent} />
    <section className={styles.routeLayout}>
      <h1 className={styles.pageTitle}><code>/threads</code></h1>
      <ThreadsBox state={{ threads, loading, error }} onIntent={onIntent} />
    </section>
    {commandMessage && <p className={styles.commandMessage} role="status">{commandMessage}</p>}
  </main>;
}

export type { ThreadId };
