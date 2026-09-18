import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import styles from "../App.module.css";
import type { ThreadId } from "../../domain/types";
import type { BoxIntent, ThreadsViewState } from "./box-types";
import { rankThreads } from "./box-policies";
import { useRotatingCaretColor } from "../use-rotating-caret-color";
export function ThreadsBox({ state, onIntent }: { state: ThreadsViewState; onIntent: (intent: BoxIntent) => void }) {
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [confirming, setConfirming] = useState<ThreadId | null>(null);
  const caret = useRotatingCaretColor();
  const visible = useMemo(() => rankThreads(state.threads, query), [state.threads, query]);
  useEffect(() => setActive((value) => Math.min(value, Math.max(0, visible.length - 1))), [visible.length]);
  useEffect(() => { searchInput.current?.focus(); }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const selected = visible[active];
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, visible.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
    if (confirming) {
      if (event.key === "Enter" || event.key.toLowerCase() === "y") { event.preventDefault(); onIntent({ type: "thread_delete_requested", threadId: confirming }); setConfirming(null); }
      else if (event.key.toLowerCase() === "n") { event.preventDefault(); setConfirming(null); }
      return;
    }
    if (event.key === "Enter" && selected) { event.preventDefault(); onIntent({ type: "thread_open_requested", threadId: selected.id }); }
    if ((event.key === "Delete" || event.key === "Backspace") && !query && selected) { event.preventDefault(); setConfirming(selected.id); }
  };
  const onContainerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (confirming) setConfirming(null);
    else onIntent({ type: "route_escape_requested" });
  };
  return <section aria-label="Saved threads" className={styles.threadPicker} onKeyDown={onContainerKeyDown}><input ref={searchInput} autoFocus className={styles.threadSearch} aria-label="Find threads" value={query} style={caret.style} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown} onFocus={caret.onFocus} onBlur={caret.onBlur} />{state.error && <p role="alert">{state.error}</p>}{state.loading ? <p role="status">Loading threads…</p> : visible.length ? <ul>{visible.map((thread, index) => <li key={thread.id} className={`${styles.threadRow} ${index === active ? styles.threadSelected : ""}`}><button type="button" onClick={() => onIntent({ type: "thread_open_requested", threadId: thread.id })}>{thread.title}<small>{thread.lastRequestPreview}</small></button>{confirming === thread.id ? <span className={styles.threadActions} role="group" aria-label={`Confirm deletion of ${thread.title}`}><button type="button" onClick={() => { onIntent({ type: "thread_delete_requested", threadId: thread.id }); setConfirming(null); }}>Delete</button><button type="button" onClick={() => setConfirming(null)}>Cancel</button></span> : <button className={styles.threadDelete} type="button" aria-label={`Delete ${thread.title}`} onClick={() => setConfirming(thread.id)}>×</button>}</li>)}</ul> : <p className={styles.muted}>{query ? "No matching threads." : "No saved threads yet."}</p>}</section>;
}
