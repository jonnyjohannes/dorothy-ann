import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { LocalArtifactDraftStore, LocalThreadStore } from "../adapters/browser/local-stores";
import { ThreadStateOwner } from "../application/thread-owner";
import type { ResearchDecision, ResearchQuery, SearchResult, Thread, ThreadSummary } from "../domain/types";
import { renderThreadScrollback } from "../domain/thread-state";
import { canPromoteToResearch, parseSlashCommand, resolveQueryMode } from "../domain/policies";
import styles from "./App.module.css";
import { TurnTranscriptBox } from "./TurnTranscriptBox";
import { EvidenceBox } from "./EvidenceBox";

type Result = SearchResult;
type StreamState = {
  stage: string;
  answer: string;
  sources: Result[];
  error?: string;
  guidance?: string;
  generatedQueries?: ResearchQuery[];
  plan?: ResearchDecision;
};
const store = new LocalThreadStore();
const draftStore = new LocalArtifactDraftStore();
const rotatingTaglines = ["take chances", "make mistakes", "get messy"] as const;
const threadOwner = new ThreadStateOwner(store);
const now = () => new Date().toISOString() as Thread["createdAt"];
const id = () => crypto.randomUUID();

function BackupControls() {
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const download = async () => {
    const backup = await store.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dorothy-ann-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Backup downloaded.");
  };
  const importBackup = async (file: File) => {
    try {
      const backup = JSON.parse(await file.text());
      const preview = await store.inspectImport(backup);
      if (preview.issues.length) { setMessage(`${preview.issues.length} invalid record(s) skipped.`); return; }
      const replace = window.confirm(`${preview.add} new topic(s), ${preview.conflicts} conflict(s). Replace conflicts?`);
      const report = await store.importData(backup, { onConflict: replace ? "replace" : "skip" });
      setMessage(`Imported ${report.added.length + report.replaced.length} topic(s).`);
    } catch { setMessage("That backup could not be imported."); }
  };
  return <section className={styles.backupControls} aria-label="Data backup">
    <p>threads have a 7 day ttl from last activity.</p>
    <button className={styles.textButton} onClick={() => void download()}>Export backup</button>
    <button className={styles.textButton} onClick={() => input.current?.click()}>Import backup</button>
    <input ref={input} type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.target.value = ""; }} />
    {message && <p role="status">{message}</p>}
  </section>;
}

function RotatingBrand({ to, prefix = "" }: { to?: string; prefix?: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % rotatingTaglines.length), 3000);
    return () => window.clearInterval(timer);
  }, []);
  const content = `${prefix}${rotatingTaglines[index]}`;
  return (
    <span className={styles.brandGroup}>
      <Link to="/new" className={styles.signature} aria-label="New topic">~∞|°_°|∞~</Link>
      {to ? <Link to={to} className={styles.brand}>{content}</Link> : <span className={styles.brand}>{content}</span>}
    </span>
  );
}

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : "/"; } catch { return "/"; }
}

function Unlock() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const [passphrase, setPassphrase] = useState("");
  const [message, setMessage] = useState("");
  return (
    <main className={styles.unlockShell}>
      <header className={styles.header}>
        <RotatingBrand />
      </header>
      <section className={styles.unlockCard} aria-label="Unlock">
        <form
          className={styles.unlockForm}
          onSubmit={async (event) => {
            event.preventDefault();
            const response = await fetch("/api/auth/passphrase", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ passphrase }),
            });
            if (response.ok) { setMessage("Unlocked."); navigate(returnTo, { replace: true }); }
            else setMessage("That passphrase did not work.");
          }}
        >
          <label className={styles.srOnly} htmlFor="passphrase">Passphrase</label>
          <input
            id="passphrase"
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            autoComplete="current-password"
            placeholder="passphrase"
            autoFocus
          />

        </form>
        {message && <p role="status" className={styles.muted}>{message}</p>}
      </section>
    </main>
  );
}

function applyTheme(theme: string) {
  const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "auto" && prefersDark ? "dark" : theme === "auto" ? "light" : theme;
  document.documentElement.dataset.theme = resolved;
}

function ThemeBootstrap() {
  useEffect(() => {
    const theme = localStorage.getItem("dorothy-ann-theme") ?? "auto";
    applyTheme(theme);
    if (theme !== "auto" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme("auto");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return null;
}

function ThemeControl() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("dorothy-ann-theme") ?? "auto",
  );
  const change = (value: string) => {
    setTheme(value);
    localStorage.setItem("dorothy-ann-theme", value);
    applyTheme(value);
  };
  useEffect(() => { applyTheme(theme); }, [theme]);
  return (
    <label className={styles.themeControl}>
      Appearance
      <select
        aria-label="Appearance"
        value={theme}
        onChange={(event) => change(event.target.value)}
      >
        <option value="auto">auto</option>
        <option value="light">light</option>
        <option value="dark">dark</option>
      </select>
    </label>
  );
}

function SecondaryLayout({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <RotatingBrand to="/" />
        <button className={styles.closeButton} aria-label={`Close ${label}`} onClick={onClose}>×</button>
      </header>
      <section className={styles.settings}>{children}</section>
    </main>
  );
}

function Settings() {
  const navigate = useNavigate();
  return (
    <SecondaryLayout label="settings" onClose={() => navigate("/", { replace: true })}>
      <h2 className={styles.pageTitle}><code>/settings</code></h2>
      <p><ThemeControl /></p>
      <BackupControls />
    </SecondaryLayout>
  );
}

function ThreadPicker({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const navigate = useNavigate();
  const route = useParams();
  const activeThreadId = route.threadId;
  const [topics, setTopics] = useState<ThreadSummary[]>([]);
  const [active, setActive] = useState(0);
  const [filter, setFilter] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const visibleTopics = topics.filter((topic) => topic.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const selectedIndex = visibleTopics.length ? Math.min(active, visibleTopics.length - 1) : 0;
  const focused = visibleTopics[selectedIndex];
  const refresh = () => void store.list().then((next) => {
    setTopics(next);
    setActive((value) => Math.min(value, Math.max(0, next.length - 1)));
  });
  const deleteTopic = (topic: ThreadSummary) => {
    if (!window.confirm(`Delete “${topic.title}”?`)) return;
    setDeleteError("");
    void store.remove(topic.id).then(() => {
      setTopics((current) => current.filter((candidate) => candidate.id !== topic.id));
      if (activeThreadId === topic.id) navigate("/", { replace: true });
      refresh();
    }).catch(() => setDeleteError("That topic could not be deleted."));
  };
  useEffect(refresh, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!embedded && event.key === "Escape") { event.preventDefault(); onClose(); }
      const editingFilter = event.target instanceof HTMLInputElement && event.target.classList.contains(styles.threadSearch);
      if (editingFilter && (event.key === "Delete" || event.key === "Backspace")) return;
      if ((event.key === "Delete" || event.key === "Backspace") && focused) { event.preventDefault(); deleteTopic(focused); }
      if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, Math.max(0, visibleTopics.length - 1))); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
      if (event.key === "Enter" && focused) { event.preventDefault(); navigate(`/topics/${focused.id}`, { replace: true }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, focused, navigate, onClose, visibleTopics.length]);
  const picker = <section className={`${styles.threadPicker} ${embedded ? styles.threadPickerInline : ""}`} role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : "true"} aria-label="Saved threads">
      <h2 className={styles.pageTitle}><code>/threads</code></h2>
      <input className={styles.threadSearch} aria-label="Find threads" placeholder="find threads" value={filter} autoFocus onChange={(event) => { setFilter(event.target.value); setActive(0); }} />
      {visibleTopics.length ? <ul>{visibleTopics.map((topic, index) => <li key={topic.id} className={`${styles.threadRow} ${index === selectedIndex ? styles.threadSelected : ""}`}><button autoFocus={false} aria-current={index === selectedIndex ? "true" : undefined} onKeyDown={(event) => { if ((event.key === "Delete" || event.key === "Backspace") && index === selectedIndex) { event.preventDefault(); event.stopPropagation(); deleteTopic(topic); } }} onClick={() => navigate(`/topics/${topic.id}`, { replace: true })}>{topic.title}<small>{topic.lastTurnPreview ?? ""}</small></button><button className={styles.threadDelete} aria-label={`Delete ${topic.title}`} onClick={() => deleteTopic(topic)}>Delete</button></li>)}</ul> : <p className={styles.muted}>{filter ? "No matching threads." : "No saved threads yet."}</p>}
      {deleteError && <p role="alert" className={styles.muted}>{deleteError}</p>}
      <p className={styles.muted}>↑/↓ select · Enter open · Delete remove · Escape close</p>
    </section>;
  return embedded ? picker : <div className={styles.commandOverlay} role="dialog" aria-modal="true" aria-label="Saved threads">{picker}</div>;
}

function ThreadsRoute() {
  const navigate = useNavigate();
  return <SecondaryLayout label="threads" onClose={() => navigate("/", { replace: true })}><ThreadPicker embedded onClose={() => navigate("/", { replace: true })} /></SecondaryLayout>;
}

function PromptBox({ value, onChange, onSubmit, onCommand, disabled = false }: { value: string; onChange: (value: string) => void; onSubmit: (value: string, mode: "lookup" | "research") => void; onCommand: (command: string) => void; disabled?: boolean }) {
  const submit = (event: FormEvent) => { event.preventDefault(); const input = value.trim(); if (!input) return; if (input.startsWith("/")) { onCommand(input); return; } onSubmit(input, resolveQueryMode(input)); };
  return <form className={styles.promptBox} onSubmit={submit}>
    <input aria-label="Search query" value={value} onChange={(event) => onChange(event.target.value)} placeholder="...? for research" disabled={disabled} autoFocus />
  </form>;
}

function GlobalShortcuts() {
  const navigate = useNavigate();
  const lastEscape = useRef(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.code === "KeyS") { event.preventDefault(); navigate("/threads"); return; }
      if (event.altKey && event.code === "KeyC") { event.preventDefault(); navigate("/settings"); return; }
      if (event.key !== "Escape") return;
      const now = Date.now();
      if (now - lastEscape.current < 500) { event.preventDefault(); navigate("/new", { replace: true }); }
      lastEscape.current = now;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
  return null;
}

function Home() {
  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState(false);
  const [message, setMessage] = useState("");
  const [params] = useSearchParams();
  const externalQuery = params.get("q");
  const navigate = useNavigate();
  useEffect(() => {
    const input = externalQuery?.trim();
    if (!input) return;
    const mode = resolveQueryMode(input);
    const threadId = id();
    navigate(`/topics/${threadId}?mode=${mode}&q=${encodeURIComponent(input)}`, { replace: true });
  }, [externalQuery, navigate]);
  const submit = (input: string, selectedMode: "lookup" | "research") => navigate(`/topics/new?mode=${selectedMode}&q=${encodeURIComponent(input)}`);
  const command = (input: string) => { const command = parseSlashCommand(input); if (command === "/settings") navigate("/settings"); else if (command === "/new") { setQuery(""); navigate("/", { replace: true }); } else if (command === "/threads") navigate("/threads"); else setMessage(`Unknown command: ${input}`); };
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <RotatingBrand to="/" />
      </header>
      {threads && <ThreadPicker onClose={() => setThreads(false)} />}
      <section className={styles.hero}>
        <h2 className={styles.pageTitle}><code>according to my research...</code></h2>
        <div className={styles.commandList}>
          <p><code>/new</code> — <code>&lt;esc&gt;</code> <code>&lt;esc&gt;</code></p>
          <p><code>/settings</code> — <code>&lt;alt&gt;</code> + <code>c</code></p>
          <p><code>/threads</code> — <code>&lt;alt&gt;</code> + <code>s</code></p>
        </div>
      </section>
      {message && <p role="status" className={styles.commandMessage}>{message}</p>}
      <PromptBox value={query} onChange={setQuery} onSubmit={submit} onCommand={command} />
    </main>
  );
}

async function readResearchStream(
  response: Response,
  update: (state: StreamState) => void,
) {
  if (!response.body) throw new Error("stream unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let state: StreamState = { stage: "starting", answer: "", sources: [] };
  const process = (block: string) => {
    const event = block.match(/^event: (.+)$/m)?.[1];
    const data = block.match(/^data: (.+)$/m)?.[1];
    if (!event || !data || event === "heartbeat") return;
    const payload = JSON.parse(data) as Record<string, unknown>;
    if (event === "research.sources") state = { ...state, stage: "sources found", sources: (payload.sources as Result[]) ?? [] };
    else if (event === "research.extracting") state = { ...state, stage: "extracting evidence" };
    else if (event === "research.extraction") state = { ...state, stage: "extracting evidence" };
    else if (event === "research.planning") state = { ...state, stage: "planning" };
    else if (event === "research.planner.failed") state = { ...state, stage: "synthesizing" };
    else if (event === "research.plan") { const plan = payload.plan as ResearchDecision; state = { ...state, stage: plan.status === "ready" ? "synthesizing" : "research direction", guidance: "guidance" in plan ? plan.guidance : undefined, generatedQueries: plan.queries, plan }; }
    else if (event === "research.followup.query") { const planned = payload.query as ResearchQuery; state = { ...state, stage: "searching additional angles", generatedQueries: state.generatedQueries?.some((query) => query.query === planned.query) ? state.generatedQueries : [...(state.generatedQueries ?? []), planned] }; }
    else if (event === "research.followup.searching") state = { ...state, stage: "searching additional angles" };
    else if (event === "research.followup.sources") { const nextSources = (payload.sources as Result[]) ?? []; state = { ...state, stage: "additional sources found", sources: [...state.sources, ...nextSources.filter((source) => !state.sources.some((known) => known.canonicalUrl === source.canonicalUrl))] }; }
    else if (event === "research.followup.extracting") state = { ...state, stage: "extracting additional evidence" };
    else if (event === "research.followup.extraction") state = { ...state, stage: "extracting additional evidence" };
    else if (event === "research.evidence") state = { ...state, stage: "synthesizing" };
    else if (event === "answer.delta") state = { ...state, stage: "synthesizing", answer: state.answer + String(payload.markdown ?? "") };
    else if (event === "turn.completed") state = { ...state, stage: "complete" };
    else if (event === "turn.failed") state = { ...state, stage: "failed", error: String(payload.code ?? "research failed") };
    update(state);
  };
  while (true) {
    const next = await reader.read();
    buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) process(block);
    if (next.done) break;
  }
  if (buffer.trim()) process(buffer);
}

function renderCitations(answer: string, sources: Result[]) {
  return answer.split(/(\[\[cite:[^\]]+\]\])/g).map((part, index) => {
    const match = /^\[\[cite:(.+)\]\]$/.exec(part);
    if (!match) return <span key={index}>{part}</span>;
    const sourceIndex = sources.findIndex(
      (source) => source.sourceId === match[1],
    );
    return sourceIndex >= 0 ? (
      <a
        className={styles.citation}
        key={index}
        href={`#source-${match[1]}`}
        title={sources[sourceIndex].title}
        onClick={() => window.setTimeout(() => document.getElementById(`source-${match[1]}`)?.focus(), 0)}
      >
        [{sourceIndex + 1}]
      </a>
    ) : (
      <span key={index}>{part}</span>
    );
  });
}

async function startChatTurn(threadId: string, prompt: string): Promise<Thread | null> {
  const thread = await store.load(threadId);
  if (!thread) return null;
  const timestamp = now();
  const next: Thread = { ...thread, updatedAt: timestamp, turns: [...thread.turns, { id: id() as Thread["turns"][number]["id"], mode: "chat", status: "running", createdAt: timestamp, updatedAt: timestamp, userMessage: { id: id() as never, role: "user", content: prompt, createdAt: timestamp } }] };
  return store.commit({ thread: next, reason: "query_started", committedAt: timestamp });
}

async function appendChatTurn(threadId: string, prompt: string, answer: string): Promise<Thread | null> {
  const thread = await store.load(threadId);
  if (!thread) return null;
  const timestamp = now();
  const previous = thread.turns.at(-1);
  const assistant = { id: id() as never, role: "assistant" as const, content: { parts: [{ type: "text" as const, markdown: answer }] }, createdAt: timestamp };
  const completed = previous?.mode === "chat" && previous.userMessage.content === prompt
    ? { ...previous, status: "completed" as const, updatedAt: timestamp, assistantMessage: assistant }
    : { id: id() as Thread["turns"][number]["id"], mode: "chat" as const, status: "completed" as const, createdAt: timestamp, updatedAt: timestamp, userMessage: { id: id() as never, role: "user" as const, content: prompt, createdAt: timestamp }, assistantMessage: assistant };
  return store.commit({ thread: { ...thread, updatedAt: timestamp, turns: previous?.mode === "chat" && previous.userMessage.content === prompt ? [...thread.turns.slice(0, -1), completed] : [...thread.turns, completed] }, reason: "turn_completed", committedAt: timestamp });
}

async function saveTopic(
  threadId: string,
  query: string,
  mode: string,
  state: StreamState,
  reason: "created" | "query_started" | "lookup_completed" | "research_stage" | "turn_completed" | "turn_failed" | "turn_interrupted" | "renamed" = "lookup_completed",
): Promise<Thread> {
  const timestamp = now();
  const sources = state.sources.map((source, index) => ({
    ...source,
    rank: source.rank || index + 1,
    canonicalUrl: source.canonicalUrl || source.url,
  }));
  const thread: Thread = {
    schemaVersion: 1,
    id: threadId as Thread["id"],
    title: query.slice(0, 60),
    createdAt: timestamp,
    updatedAt: timestamp,
    modelRef: "configured",
    searchRef: "brave",
    turns: [
      {
        id: id() as Thread["turns"][number]["id"],
        mode: mode === "research" ? "research" : "chat",
        status: state.error ? (state.stage === "interrupted" ? "interrupted" : "failed") : ["starting", "loading", "sources found", "extracting evidence", "planning", "searching additional angles", "additional sources found", "extracting additional evidence", "synthesizing"].includes(state.stage) ? "running" : "completed",
        createdAt: timestamp,
        updatedAt: timestamp,
        userMessage: {
          id: id() as never,
          role: "user",
          content: query,
          createdAt: timestamp,
        },
        assistantMessage: state.answer
          ? {
              id: id() as never,
              role: "assistant",
              content: { parts: [{ type: "text", markdown: state.answer }] },
              createdAt: timestamp,
            }
          : undefined,
        lookupResults: mode === "lookup" && state.stage !== "starting" ? sources : undefined,
        researchRun:
          mode === "research" && (state.stage === "complete" || Boolean(state.error))
            ? {
                id: id() as never,
                origin: "search",
                status: state.error ? "failed" : "completed",
                queries: [query, ...(state.generatedQueries ?? []).map((planned) => planned.query)],
                generatedQueries: state.generatedQueries,
                planner: state.plan,
                guidance: state.guidance,
                targetViablePages: 3,
                sources,
                extractions: [],
                evidenceSourceIds: sources.map((source) => source.sourceId),
                startedAt: timestamp,
                updatedAt: timestamp,
              }
            : undefined,
      },
    ],
  };
  const existing = await store.load(threadId);
  if (existing) {
    const previous = existing.turns.at(-1);
    const nextTurn = thread.turns[0];
    const sameTurn = previous?.userMessage.content === query && previous.mode === nextTurn.mode;
    const turns = sameTurn
      ? [...existing.turns.slice(0, -1), { ...previous, ...nextTurn, id: previous.id, userMessage: previous.userMessage }]
      : [...existing.turns, nextTurn];
    const merged: Thread = { ...existing, updatedAt: timestamp, turns };
    return store.commit({ thread: merged, reason, committedAt: timestamp });
  }
  return store.commit({ thread, reason, committedAt: timestamp });
}

function transcriptMarkdown(thread: Thread): string {
  return renderThreadScrollback(thread).markdown;
}
function sourcesForThread(thread: Thread): Result[] {
  return Array.from(new Map(thread.turns.flatMap((turn) => turn.researchRun?.sources ?? turn.lookupResults ?? []).map((source) => [source.sourceId, source])).values());
}

function downloadMarkdown(markdown: string, filename: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ExportWorkbench() {
  const route = useParams();
  const [params] = useSearchParams();
  const [markdown, setMarkdown] = useState(
    `# Dorothy Ann report: ${params.get("title") ?? "Untitled topic"}\n\n## Conclusion\n\n${params.get("answer") ?? ""}\n\n> This is research context, not executed or independently verified work.\n`,
  );
  const [preview, setPreview] = useState(false);
  const [artifactId] = useState(() => id());
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [savedMarkdown, setSavedMarkdown] = useState("");
  const [message, setMessage] = useState("");
  const sourceKey = `${route.threadId ?? "new"}:${route.draftId ?? "report"}`;
  const initialMarkdown = `# Dorothy Ann report: ${params.get("title") ?? "Untitled topic"}\n\n## Conclusion\n\n${params.get("answer") ?? ""}\n\n> This is research context, not executed or independently verified work.\n`;
  useEffect(() => {
    let cancelled = false;
    setDraftLoaded(false);
    void (async () => {
      const draft = await draftStore.loadBySourceKey(sourceKey);
      if (draft) { if (!cancelled) { setMarkdown(draft.markdown); setSavedMarkdown(draft.markdown); } }
      else if (route.draftId === "transcript" && route.threadId) {
        const thread = await store.load(route.threadId);
        if (thread && !cancelled) { const transcript = transcriptMarkdown(thread); setMarkdown(transcript); setSavedMarkdown(transcript); }
      } else if (!cancelled) setSavedMarkdown(initialMarkdown);
      if (!cancelled) setDraftLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [route.draftId, route.threadId, sourceKey]);
  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      void draftStore.save({ schemaVersion: 1, id: artifactId as never, threadId: (route.threadId ?? "new") as never, sourceKey, format: route.draftId === "transcript" ? "transcript" : "dorothy_ann_report", scope: route.draftId === "transcript" ? "topic" : "answer", markdown, sourceUpdatedAt: now(), dirty: false, createdAt: now(), updatedAt: now() }).then(() => setSavedMarkdown(markdown));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftLoaded, markdown, route.draftId, route.threadId, sourceKey]);
  const copy = async () => {
    if (navigator.clipboard) { await navigator.clipboard.writeText(markdown); setMessage("Markdown copied."); }
    else setMessage("Clipboard is unavailable; select the Markdown manually.");
  };
  const share = async () => {
    if (navigator.share) await navigator.share({ title: params.get("title") ?? "Dorothy Ann report", text: markdown });
    else setMessage("Native sharing is unavailable; use Copy Markdown or Download .md.");
  };
  const startOver = async () => {
    const draft = await draftStore.loadBySourceKey(sourceKey);
    if (draft) await draftStore.remove(draft.id);
    setMarkdown(initialMarkdown);
    setMessage("Draft cleared.");
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dorothy-ann-report.md";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <RotatingBrand to="/" />
        <span className={styles.kicker}>report workbench</span>
      </header>
      <section className={styles.workbench}>
        <div className={styles.workbenchActions}>
          <button onClick={() => setPreview(false)} aria-pressed={!preview}>
            Edit
          </button>
          <button onClick={() => setPreview(true)} aria-pressed={preview}>
            Preview
          </button>
          <button onClick={() => void copy()}>Copy Markdown</button>
          <button onClick={download}>Download .md</button>
          <button onClick={() => void share()}>Share</button>
          <button onClick={() => void startOver()}>Start over</button>
        </div>
        {draftLoaded && markdown !== savedMarkdown && <p role="status">Saving draft…</p>}
        {message && <p role="status">{message}</p>}
        {preview ? (
          <article className={styles.preview}>
            <pre>{markdown}</pre>
          </article>
        ) : (
          <textarea
            aria-label="Report Markdown"
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
          />
        )}
      </section>
    </main>
  );
}
function Topic() {
  const [params] = useSearchParams();
  const route = useParams();
  const [threadId] = useState(() => route.threadId === "new" ? id() : route.threadId ?? id());
  const query = params.get("q") ??"";
  const mode = params.get("mode") ?? "lookup";
  const navigate = useNavigate();
  const [threads, setThreads] = useState(false);
  const [state, setState] = useState<StreamState>({
    stage: "loading",
    answer: "",
    sources: [],
  });
  const [chatInput, setChatInput] = useState("");
  const [chatAnswer, setChatAnswer] = useState("");
  const [chatStage, setChatStage] = useState("");
  const [thread, setThread] = useState<Thread | null>(null);
  const hasResearchHistory = Boolean(thread?.turns.some((turn) => turn.mode === "research" || turn.researchRun));
  const effectiveMode = mode === "research" || hasResearchHistory ? "research" : "lookup";
  const [exportMessage, setExportMessage] = useState("");
  const exportMessageTimer = useRef<number | null>(null);
  const [commandMessage, setCommandMessage] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const showExportMessage = (message: string) => {
    setExportMessage(message);
    if (exportMessageTimer.current) window.clearTimeout(exportMessageTimer.current);
    exportMessageTimer.current = window.setTimeout(() => setExportMessage(""), 3000);
  };
  useEffect(() => () => { if (exportMessageTimer.current) window.clearTimeout(exportMessageTimer.current); }, []);
  const isResearchMode = effectiveMode === "research";
  const researchController = useRef<AbortController | null>(null);
  useEffect(() => {
    let cancelled = false;
    const requestId = id();
    threadOwner.begin(`topic:${threadId}`, requestId);
    const run = async () => {
      try {
        if (!query) {
          const saved =
            threadId !== "new"
              ? await store.load(threadId)
              : null;
          const turn = saved?.turns.at(-1);
          const savedSources = saved ? sourcesForThread(saved) : [];
          if (saved && !cancelled) {
            setThread(saved);
            if (saved.turns.some((savedTurn) => savedTurn.mode === "research" || savedTurn.researchRun) && mode !== "research") navigate(`/topics/${threadId}?mode=research`, { replace: true });
          }
          if (turn && !cancelled)
            setState({
              stage: "saved",
              answer:
                turn.assistantMessage?.content.parts
                  .map((part) => (part.type === "text" ? part.markdown : ""))
                  .join("") ?? "",
              sources: savedSources,
            });
          return;
        }
        const existing = await store.load(threadId);
        if (existing && !cancelled) setThread(existing);
        const existingTurn = existing?.turns.at(-1);
        const sameQuery = existingTurn?.userMessage.content === query && existingTurn.mode === mode;
        if (existingTurn && sameQuery && existingTurn.status !== "pending") {
          const savedSources = existingTurn.researchRun?.sources ?? existingTurn.lookupResults ?? [];
          const savedAnswer = existingTurn.assistantMessage?.content.parts.map((part) => part.type === "text" ? part.markdown : "").join("") ?? "";
          if (!cancelled) setState({ stage: existingTurn.status === "running" ? "interrupted" : existingTurn.status === "failed" ? "failed" : "saved", answer: savedAnswer, sources: savedSources, error: existingTurn.status === "running" ? "This search was interrupted. Retry to continue." : existingTurn.failure?.message });
          return;
        }
        setState({ stage: "starting", answer: "", sources: [] });
        await saveTopic(threadId, query, mode, { stage: "starting", answer: "", sources: [] }, "query_started").then((committed) => { if (!cancelled) setThread(committed); });
        if (mode === "lookup") {
          const response = await fetch("/api/lookup", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query }),
          });
          if (!response.ok) throw new Error("lookup failed");
          const data = (await response.json()) as { results: Result[] };
          if (!cancelled) {
            const next = {
              stage: data.results.length ? "results found" : "no results",
              answer: "",
              sources: data.results,
            };
            setState(next);
            setThread(await saveTopic(threadId, query, mode, next));
          }
        } else {
          const controller = new AbortController();
          researchController.current = controller;
          const response = await fetch("/api/research", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              query,
              ...(existing && sourcesForThread(existing).length > 0 ? {
                context: {
                  originalQuery: existing.turns[0]?.userMessage.content ?? "",
                  sources: sourcesForThread(existing),
                },
              } : {}),
            }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("research failed");
          await readResearchStream(response, (next) => {
            if (!cancelled && threadOwner.isCurrent(`topic:${threadId}`, requestId)) {
              setState(next);
            }
          });
        }
      } catch (error) {
        if (!cancelled && threadOwner.isCurrent(`topic:${threadId}`, requestId)) {
          const interrupted = error instanceof DOMException && error.name === "AbortError";
          const failure = interrupted ? "Research stopped." : error instanceof Error ? error.message : "request failed";
          const next = { ...state, stage: interrupted ? "interrupted" : "failed", error: failure };
          setState(next);
          void saveTopic(threadId, query, mode, next, interrupted ? "turn_interrupted" : "turn_failed");
        }
      } finally { researchController.current = null; threadOwner.finish(`topic:${threadId}`, requestId); }
    };
    void run();
    return () => {
      cancelled = true;
      researchController.current?.abort();
    };
  }, [mode, query, threadId]);
  useEffect(() => {
    if (query && mode === "research" && state.stage === "complete")
      void saveTopic(threadId, query, mode, state, state.error ? "turn_failed" : "turn_completed")
        .then(setThread)
        .catch((error) => setState((current) => ({ ...current, stage: "failed", error: error instanceof Error ? error.message : "turn_persist_failed" })));
  }, [mode, query, threadId, state]);
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <RotatingBrand to="/" />
        {thread && thread.turns.some((turn) => turn.assistantMessage) && (
          <div className={styles.headerActions}>
            <button className={styles.textButton} onClick={async () => { const artifact = renderThreadScrollback(thread); try { await navigator.clipboard.writeText(artifact.markdown); showExportMessage("Copied."); } catch { showExportMessage("Copy is unavailable; use Export file."); } }}>Copy</button>
            <button className={styles.textButton} onClick={() => { const artifact = renderThreadScrollback(thread); downloadMarkdown(artifact.markdown, artifact.filename); showExportMessage("Markdown exported."); }}>Export</button>
            {exportMessage && <span role="status" className={styles.muted}>{exportMessage}</span>}
          </div>
        )}
      </header>
      {threads && <ThreadPicker onClose={() => setThreads(false)} />}
      <div className={`${styles.topicLayout} ${isResearchMode ? styles.researchLayout : styles.lookupLayout}`}>
        <section className={styles.topic}>
          {state.error && (
            <>
              <p role="alert">{state.error}</p>
              <button onClick={() => window.location.reload()}>Retry</button>
            </>
          )}
          {isResearchMode && state.stage !== "complete" && (state.guidance || state.generatedQueries?.length) && (
            <section className={styles.researchPlanLive} aria-live="polite">
              {state.guidance && <><span className={styles.researchPlanLabel}>research direction</span><p>{state.guidance}</p></>}
              {state.generatedQueries?.length ? <><span className={styles.researchPlanLabel}>searches</span><ol>{state.generatedQueries.map((planned) => <li key={`${planned.priority}-${planned.query}`}><code>{planned.query}</code><small>{planned.purpose}</small></li>)}</ol></> : null}
            </section>
          )}
          {isResearchMode && ["loading", "starting", "sources found", "extracting evidence", "planning", "searching additional angles", "additional sources found", "extracting additional evidence", "synthesizing"].includes(state.stage) && (
            <>
              <div className={styles.researchLoader} role="status" aria-live="polite">
                <span className={styles.loaderBars} aria-hidden="true"><i /><i /><i /></span>
                <span>{state.stage === "loading" || state.stage === "starting" ? "researching" : state.stage}</span>
              </div>
              <button onClick={() => researchController.current?.abort()}>Stop</button>
            </>
          )}
          {thread && <TurnTranscriptBox thread={thread} onEvidenceSelect={(sourceId) => { setSelectedSourceId(sourceId); window.setTimeout(() => document.getElementById(`source-${sourceId}`)?.focus(), 0); }} />}
          {state.answer && !thread && (
            <article className={styles.answer}>
              <p>{renderCitations(state.answer, state.sources)}</p>
            </article>
          )}
          <PromptBox value={chatInput} onChange={setChatInput} onCommand={(input) => { const command = parseSlashCommand(input); if (command === "/settings") navigate("/settings"); else if (command === "/new") navigate("/", { replace: true }); else if (command === "/threads") navigate("/threads"); else setCommandMessage(`Unknown command: ${input}`); }} onSubmit={async (prompt) => {
            setChatInput("");
            if (effectiveMode === "lookup") {
              navigate(`/topics/${threadId}?mode=research&q=${encodeURIComponent(prompt)}`);
              return;
            }
            setChatAnswer(""); setChatStage("thinking");
            const pending = await startChatTurn(threadId, prompt); if (pending) setThread(pending);
            const response = await fetch("/api/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: prompt, mode: "chat", context: `${state.answer}\n\nSources:\n${state.sources.map((source) => `${source.title}: ${source.snippet ?? source.url}`).join("\n")}` }) });
            if (!response.ok) { setChatStage("chat unavailable"); return; }
            let finalAnswer = "";
            await readResearchStream(response, (next) => { finalAnswer = next.answer; setChatAnswer(next.answer); setChatStage(next.stage); });
            if (finalAnswer) { const committed = await appendChatTurn(threadId, prompt, finalAnswer); if (committed) setThread(committed); }
          }} />
          {commandMessage && <p className={styles.commandMessage} role="status">{commandMessage}</p>}
          {chatStage && <p className={styles.muted} aria-live="polite">{chatStage}</p>}
          {chatAnswer && <p className={styles.chatAnswer}>{renderCitations(chatAnswer, state.sources)}</p>}
          {mode === "lookup" && canPromoteToResearch(query) && (
            <Link
              className={styles.promotion}
              to={`/topics/new?mode=research&q=${encodeURIComponent(query)}`}
            >
              Research this with Dorothy Ann →
            </Link>
          )}
          {!isResearchMode && state.sources.length > 0 && <EvidenceBox sources={state.sources} selectedSourceId={selectedSourceId} onSelect={setSelectedSourceId} />}
        </section>
        {isResearchMode && state.sources.length > 0 && <EvidenceBox sources={state.sources} selectedSourceId={selectedSourceId} onSelect={setSelectedSourceId} />}
      </div>
    </main>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (location.pathname === "/unlock") { setState("ready"); return; }
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetch("/api/providers/status").then((response) => response.json()) as { fixtureMode?: boolean };
        if (!status.fixtureMode) {
          const session = await fetch("/api/auth/session").then((response) => response.json()) as { authenticated?: boolean };
          if (!session.authenticated) {
            const returnTo = `${location.pathname}${location.search}`;
            navigate(`/unlock?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
            return;
          }
        }
        if (!cancelled) setState("ready");
      } catch { if (!cancelled) setState("error"); }
    })();
    return () => { cancelled = true; };
  }, [location.pathname, navigate]);
  if (state === "loading") return <main className={styles.center}><p role="status">Checking access…</p></main>;
  if (state === "error") return <main className={styles.center}><p role="alert">Unable to check access.</p><button onClick={() => window.location.reload()}>Retry</button></main>;
  return <>{children}</>;
}

export function App() {
  return (
    <>
      <ThemeBootstrap />
      <AuthGate>
        <GlobalShortcuts />
    <Routes>
      <Route path="/unlock" element={<Unlock />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/threads" element={<ThreadsRoute />} />
      <Route
        path="/topics/:threadId/export/:draftId"
        element={<ExportWorkbench />}
      />
      <Route path="/topics/:threadId" element={<Topic />} />
      <Route path="*" element={<Home />} />
    </Routes>
    </AuthGate>
    </>
  );
}
