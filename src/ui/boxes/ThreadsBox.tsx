import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import styles from "../App.module.css";
import type { ThreadId } from "../../domain/types";
import type { BoxIntent, ThreadsViewState } from "./box-types";
import { rankThreads } from "./box-policies";
import { ACCENT_NAMES, readColorScheme } from "../color-scheme";
export function ThreadsBox({ state, onIntent }: { state: ThreadsViewState; onIntent: (intent: BoxIntent) => void }) {
  const searchInput = useRef<HTMLInputElement>(null);
  const activeRow = useRef<HTMLLIElement>(null);
  // Filtering may place a different row under a stationary pointer; wait for real pointer motion.
  const hoverAfterFilter = useRef(true);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState({ index: 0, hue: 0 });
  const [scheme, setScheme] = useState(() => readColorScheme(document.documentElement.dataset.colorScheme));
  const [confirming, setConfirming] = useState<ThreadId | null>(null);
  const visible = useMemo(() => rankThreads(state.threads, query), [state.threads, query]);
  const active = Math.min(selection.index, Math.max(0, visible.length - 1));
  const moveTo = (index: number) => setSelection((current) => current.index === index ? current : { index, hue: (current.hue + 1) % ACCENT_NAMES[scheme].length });
  useEffect(() => setSelection((current) => current.index === active ? current : { ...current, index: active }), [active]);
  useEffect(() => {
    const refresh = () => setScheme(readColorScheme(document.documentElement.dataset.colorScheme));
    window.addEventListener("dorothy-ann-preference-change", refresh);
    return () => window.removeEventListener("dorothy-ann-preference-change", refresh);
  }, []);
  useEffect(() => { if (scheme === "mono") setSelection((current) => current.hue === 0 ? current : { ...current, hue: 0 }); }, [scheme]);
  useEffect(() => { activeRow.current?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  const slot = selection.hue % ACCENT_NAMES[scheme].length + 1;
  const rowStyle = { "--thread-active-accent": `var(--accent-${slot})`, "--thread-active-foreground": `var(--thread-foreground-${slot}, var(--command-foreground-1))` } as CSSProperties;
  useEffect(() => { searchInput.current?.focus(); }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const selected = visible[active];
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && visible.length) {
      event.preventDefault();
      moveTo((active + (event.key === "ArrowDown" ? 1 : -1) + visible.length) % visible.length);
    }
    if (confirming) {
      if (event.key === "Enter" || event.key.toLowerCase() === "y") { event.preventDefault(); onIntent({ type: "thread_delete_requested", threadId: confirming }); setConfirming(null); }
      else if (event.key.toLowerCase() === "n") { event.preventDefault(); setConfirming(null); }
      return;
    }
    if (event.key === "Enter" && selected) { event.preventDefault(); onIntent({ type: "thread_open_requested", threadId: selected.id }); }
    if ((event.key === "Delete" || event.key === "Backspace") && !query && selected) { event.preventDefault(); setConfirming(selected.id); }
  };
  const onContainerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (confirming) setConfirming(null);
    else onIntent({ type: "route_escape_requested" });
  };
  return <section aria-label="Saved threads" className={styles.threadPicker} onKeyDown={onContainerKeyDown}>
    <input ref={searchInput} autoFocus className={styles.threadSearch} aria-label="Find threads" value={query} onChange={(event) => { hoverAfterFilter.current = false; setQuery(event.target.value); setSelection((current) => ({ ...current, index: 0 })); }} onKeyDown={onKeyDown} />
    <div className={`${styles.threadListViewport} app-thread-list-scroll`} role="region" aria-label="Saved threads list">
      {state.error && <p role="alert">{state.error}</p>}
      {state.loading ? <p role="status">Loading threads…</p> : visible.length ? <ul>{visible.map((thread, index) => <li ref={index === active ? activeRow : undefined} key={thread.id} onMouseEnter={() => { if (hoverAfterFilter.current) moveTo(index); }} onMouseMove={() => { if (!hoverAfterFilter.current) { hoverAfterFilter.current = true; moveTo(index); } }} style={index === active ? rowStyle : undefined} className={`${styles.threadRow} ${index === active ? styles.threadSelected : ""}`}><button type="button" onClick={() => onIntent({ type: "thread_open_requested", threadId: thread.id })}>{thread.title}<small>{thread.lastRequestPreview}</small></button>{confirming === thread.id ? <span className={styles.threadActions} role="group" aria-label={`Confirm deletion of ${thread.title}`}><button type="button" onClick={() => { onIntent({ type: "thread_delete_requested", threadId: thread.id }); setConfirming(null); }}>Delete</button><button type="button" onClick={() => setConfirming(null)}>Cancel</button></span> : <button className={styles.threadDelete} type="button" aria-label={`Delete ${thread.title}`} onClick={() => setConfirming(thread.id)}>×</button>}</li>)}</ul> : !state.error && <p className={styles.muted}>{query ? "No matching threads." : "No saved threads yet."}</p>}
    </div>
  </section>;
}
