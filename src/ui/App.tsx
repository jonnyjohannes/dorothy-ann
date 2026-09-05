import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { LocalArtifactDraftStore, LocalThreadStore } from "../adapters/browser/local-stores";
import type { SearchResult, Thread, ThreadSummary } from "../domain/types";
import { canPromoteToResearch } from "../domain/policies";
import styles from "./App.module.css";

type Result = SearchResult;
type StreamState = {
  stage: string;
  answer: string;
  sources: Result[];
  error?: string;
};
const store = new LocalThreadStore();
const draftStore = new LocalArtifactDraftStore();
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
    <h3>Data</h3>
    <button onClick={() => void download()}>Export backup</button>
    <button onClick={() => input.current?.click()}>Import backup</button>
    <input ref={input} type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.target.value = ""; }} />
    {message && <p role="status">{message}</p>}
  </section>;
}

function Drawer({ onClose }: { onClose: () => void }) {
  const [topics, setTopics] = useState<ThreadSummary[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const refresh = () => {
    void store.list().then(setTopics);
  };
  useEffect(refresh, []);
  const rename = async (topic: ThreadSummary) => {
    const thread = await store.load(topic.id);
    if (thread && title.trim()) {
      await store.save({ ...thread, title: title.trim(), updatedAt: now() });
      refresh();
    }
    setEditing(null);
  };
  const remove = async (topic: ThreadSummary) => {
    if (window.confirm(`Delete “${topic.title}”? This cannot be undone.`)) {
      await store.remove(topic.id);
      refresh();
    }
  };
  return (
    <aside className={styles.drawer} aria-label="Topics">
      <div className={styles.drawerHeader}>
        <h2>
          Topics{" "}
        </h2>
        <button onClick={onClose} aria-label="Close topics">
          ×
        </button>
      </div>
      {topics.length ? (
        <ul>
          {topics.map((topic) => (
            <li key={topic.id}>
              {editing === topic.id ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void rename(topic);
                  }}
                >
                  <input
                    aria-label={`Rename ${topic.title}`}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    autoFocus
                  />
                  <button type="submit">Save</button>
                </form>
              ) : (
                <>
                  <Link to={`/topics/${topic.id}`} onClick={onClose}>
                    {topic.title}
                  </Link>
                  <div className={styles.topicActions}>
                    <button
                      onClick={() => {
                        setEditing(topic.id);
                        setTitle(topic.title);
                      }}
                    >
                      Rename
                    </button>
                    <button onClick={() => void remove(topic)}>Delete</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No saved topics yet.</p>
      )}
      <BackupControls />
      <p className={styles.drawerNote}>
        Saved topics and sources stay in this browser.
      </p>
      <Link className={styles.settingsLink} to="/settings" onClick={onClose}>
        ⚙
      </Link>
    </aside>
  );
}

function Unlock() {
  const [passphrase, setPassphrase] = useState("");
  const [message, setMessage] = useState("");
  return (
    <main className={styles.center}>
      <section className={styles.card} aria-labelledby="unlock-title">
        <p className={styles.kicker}>private research desk</p>
        <h1 id="unlock-title">dorothy-ann</h1>
        <p>This research desk is private.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const response = await fetch("/api/auth/passphrase", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ passphrase }),
            });
            setMessage(
              response.ok ? "Unlocked." : "That passphrase did not work.",
            );
          }}
        >
          <label htmlFor="passphrase">Passphrase</label>
          <input
            id="passphrase"
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            autoComplete="current-password"
          />
          <button type="submit">Unlock</button>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
    </main>
  );
}

function ThemeControl() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("dorothy-ann-theme") ?? "auto",
  );
  const change = (value: string) => {
    setTheme(value);
    localStorage.setItem("dorothy-ann-theme", value);
    document.documentElement.dataset.theme = value;
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
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

function Settings() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          ← dorothy-ann
        </Link>
        <span className={styles.kicker}>settings</span>
      </header>
      <section className={styles.settings}>
        <h1>Settings</h1>
        <section className={styles.settingsSection}>
          <h2>Appearance</h2>
          <p>Choose how dorothy-ann looks on this device.</p>
          <ThemeControl />
        </section>
      </section>
    </main>
  );
}

function Home() {
  const [query, setQuery] = useState("");
  const [tagline, setTagline] = useState("make mistakes");
  useEffect(() => {
    const lines = ["take chances", "make mistakes", "get messy"];
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % lines.length;
      setTagline(lines[index]);
    }, 2400);
    return () => window.clearInterval(timer);
  }, []);
  const [mode, setMode] = useState<"lookup" | "research">("lookup");
  const [drawer, setDrawer] = useState(false);
  const navigate = useNavigate();
  const inferred = query.trimEnd().endsWith("?");
  const activeMode = mode === "lookup" && inferred ? "research" : mode;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim())
      navigate(
        `/topics/new?mode=${activeMode}&q=${encodeURIComponent(query.trim())}`,
      );
  };
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <button
          className={styles.iconButton}
          onClick={() => setDrawer(true)}
          aria-label="Open topics"
        >
          ☰
        </button>
        <Link to="/" className={styles.brand}>
          dorothy-ann
        </Link>
        <Link
          className={styles.iconButton}
          to="/settings"
          aria-label="Open settings"
        >
          ⚙
        </Link>
      </header>
      {drawer && <Drawer onClose={() => setDrawer(false)} />}
      <section className={styles.hero}>
        <h2 className={styles.kicker}>{tagline}</h2>
        <form onSubmit={submit} className={styles.queryForm}>
          <div className={styles.queryRow}>
            <input
              aria-label="Search query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Add ? to ask Dorothy Ann to research"
              autoFocus
            />
          </div>
          <div className={styles.submitGroup}>
            <select
              aria-label="Query mode"
              value={activeMode}
              onChange={(event) =>
                setMode(event.target.value as "lookup" | "research")
              }
            >
              <option value="lookup">lookup</option>
              <option value="research">research</option>
            </select>
            <button type="submit">Go</button>
          </div>
        </form>
      </section>
    </main>
  );
}

async function readResearchStream(
  response: Response,
  update: (state: StreamState) => void,
) {
  const text = await response.text();
  const blocks = text.split("\n\n").filter(Boolean);
  let state: StreamState = { stage: "starting", answer: "", sources: [] };
  for (const block of blocks) {
    const event = block.match(/^event: (.+)$/m)?.[1];
    const data = block.match(/^data: (.+)$/m)?.[1];
    if (!event || !data) continue;
    const payload = JSON.parse(data) as Record<string, unknown>;
    if (event === "research.sources")
      state = {
        ...state,
        stage: "sources found",
        sources: (payload.sources as Result[]) ?? [],
      };
    else if (event === "research.extraction")
      state = { ...state, stage: "extracting evidence" };
    else if (event === "answer.delta")
      state = {
        ...state,
        stage: "complete",
        answer: state.answer + String(payload.markdown ?? ""),
      };
    else if (event === "turn.failed")
      state = {
        ...state,
        stage: "failed",
        error: String(payload.code ?? "research failed"),
      };
    update(state);
  }
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
      >
        [{sourceIndex + 1}]
      </a>
    ) : (
      <span key={index}>{part}</span>
    );
  });
}

async function appendChatTurn(threadId: string, prompt: string, answer: string) {
  const thread = await store.load(threadId);
  if (!thread) return;
  const timestamp = now();
  await store.save({
    ...thread,
    updatedAt: timestamp,
    turns: [
      ...thread.turns,
      {
        id: id() as Thread["turns"][number]["id"],
        mode: "chat",
        status: "completed",
        createdAt: timestamp,
        updatedAt: timestamp,
        userMessage: { id: id() as never, role: "user", content: prompt, createdAt: timestamp },
        assistantMessage: {
          id: id() as never,
          role: "assistant",
          content: { parts: [{ type: "text", markdown: answer }] },
          createdAt: timestamp,
        },
      },
    ],
  });
}

async function saveTopic(
  threadId: string,
  query: string,
  mode: string,
  state: StreamState,
) {
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
        status: state.error ? "failed" : "completed",
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
        researchRun:
          mode === "research"
            ? {
                id: id() as never,
                origin: "search",
                status: state.error ? "failed" : "completed",
                queries: [query],
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
  await store.save(thread);
}

function transcriptMarkdown(thread: Thread): string {
  const lines = [`---`, `title: "${thread.title.replaceAll('"', '\\"')}"`, `created: ${thread.createdAt}`, `updated: ${thread.updatedAt}`, `model: ${thread.modelRef}`, `search_provider: ${thread.searchRef}`, `---`, "", `# ${thread.title}`];
  for (const turn of thread.turns) {
    lines.push("", "## User", "", turn.userMessage.content);
    if (turn.assistantMessage) lines.push("", "## Assistant", "", turn.assistantMessage.content.parts.map((part) => part.type === "text" ? part.markdown : `[[cite:${part.sourceId}]]`).join(""));
  }
  return `${lines.join("\\n")}\\n`;
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
  const [message, setMessage] = useState("");
  const sourceKey = `${route.threadId ?? "new"}:${route.draftId ?? "report"}`;
  const initialMarkdown = `# Dorothy Ann report: ${params.get("title") ?? "Untitled topic"}\n\n## Conclusion\n\n${params.get("answer") ?? ""}\n\n> This is research context, not executed or independently verified work.\n`;
  useEffect(() => {
    let cancelled = false;
    setDraftLoaded(false);
    void (async () => {
      const draft = await draftStore.loadBySourceKey(sourceKey);
      if (draft) { if (!cancelled) setMarkdown(draft.markdown); }
      else if (route.draftId === "transcript" && route.threadId) {
        const thread = await store.load(route.threadId);
        if (thread && !cancelled) setMarkdown(transcriptMarkdown(thread));
      }
      if (!cancelled) setDraftLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [route.draftId, route.threadId, sourceKey]);
  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      void draftStore.save({ schemaVersion: 1, id: artifactId as never, threadId: (route.threadId ?? "new") as never, sourceKey, format: route.draftId === "transcript" ? "transcript" : "dorothy_ann_report", scope: route.draftId === "transcript" ? "topic" : "answer", markdown, sourceUpdatedAt: now(), dirty: true, createdAt: now(), updatedAt: now() });
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
        <Link to="/" className={styles.brand}>
          ← dorothy-ann
        </Link>
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
  const [drawer, setDrawer] = useState(false);
  const [state, setState] = useState<StreamState>({
    stage: "loading",
    answer: "",
    sources: [],
  });
  const [chatInput, setChatInput] = useState("");
  const [chatAnswer, setChatAnswer] = useState("");
  const [chatStage, setChatStage] = useState("");
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!query) {
          const saved =
            threadId !== "new"
              ? await store.load(threadId)
              : null;
          const turn = saved?.turns.at(-1);
          if (turn && !cancelled)
            setState({
              stage: "saved",
              answer:
                turn.assistantMessage?.content.parts
                  .map((part) => (part.type === "text" ? part.markdown : ""))
                  .join("") ?? "",
              sources: turn.researchRun?.sources ?? [],
            });
          return;
        }
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
            await saveTopic(
              threadId,
              query,
              mode,
              next,
            );
          }
        } else {
          const response = await fetch("/api/research", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query }),
          });
          if (!response.ok) throw new Error("research failed");
          await readResearchStream(response, (next) => {
            if (!cancelled) setState(next);
          });
        }
      } catch (error) {
        if (!cancelled)
          setState((current) => ({
            ...current,
            stage: "failed",
            error: error instanceof Error ? error.message : "request failed",
          }));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [mode, query, threadId]);
  useEffect(() => {
    if (query && mode === "research" && state.stage === "complete")
      void saveTopic(
        threadId,
        query,
        mode,
        state,
      );
  }, [mode, query, threadId, state]);
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <button
          className={styles.iconButton}
          onClick={() => setDrawer(true)}
          aria-label="Open topics"
        >
          ☰
        </button>
        <Link to="/" className={styles.brand}>
          dorothy-ann
        </Link>
        <span className={styles.kicker}>{mode}</span>
      </header>
      {drawer && <Drawer onClose={() => setDrawer(false)} />}
      <div className={styles.topicLayout}>
        <section className={styles.topic}>
          <p className={styles.kicker} aria-live="polite">
            {state.stage}
          </p>
          <h1>{query || "Saved topic"}</h1>
          {state.answer && (
            <span className={styles.exportLinks}>
              <Link
                className={styles.textLink}
                to={`/topics/${threadId}/export/report?title=${encodeURIComponent(query)}&answer=${encodeURIComponent(state.answer)}`}
              >
                Export report →
              </Link>
              <Link
                className={styles.textLink}
                to={`/topics/${threadId}/export/transcript`}
              >
                Export transcript →
              </Link>
            </span>
          )}
          {state.error && (
            <>
              <p role="alert">{state.error}</p>
              <button onClick={() => window.location.reload()}>Retry</button>
            </>
          )}
          {state.answer && (
            <article className={styles.answer}>
              <p>{renderCitations(state.answer, state.sources)}</p>
            </article>
          )}
          {state.answer && (
            <form
              className={styles.chatForm}
              onSubmit={async (event) => {
                event.preventDefault();
                if (!chatInput.trim()) return;
                const prompt = chatInput.trim();
                setChatInput("");
                setChatAnswer("");
                setChatStage("thinking");
                const response = await fetch("/api/turn", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    query: prompt,
                    mode: "chat",
                    context: `${state.answer}\n\nSources:\n${state.sources.map((source) => `${source.title}: ${source.snippet ?? source.url}`).join("\n")}`,
                  }),
                });
                if (!response.ok) {
                  setChatStage("chat unavailable");
                  return;
                }
                let finalAnswer = "";
                await readResearchStream(response, (next) => {
                  finalAnswer = next.answer;
                  setChatAnswer(next.answer);
                  setChatStage(next.stage);
                });
                if (finalAnswer && threadId !== "new") {
                  await appendChatTurn(threadId, prompt, finalAnswer);
                }
              }}
            >
              <label htmlFor="follow-up">Ask a follow-up</label>
              <div className={styles.chatRow}>
                <input
                  id="follow-up"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask about this research"
                />
                <button type="submit">Go</button>
              </div>
              {chatStage && (
                <p className={styles.muted} aria-live="polite">
                  {chatStage}
                </p>
              )}
              {chatAnswer && (
                <p className={styles.chatAnswer}>
                  {renderCitations(chatAnswer, state.sources)}
                </p>
              )}
            </form>
          )}
          {mode === "lookup" && canPromoteToResearch(query) && (
            <Link
              className={styles.promotion}
              to={`/topics/new?mode=research&q=${encodeURIComponent(query)}`}
            >
              Research this with Dorothy Ann →
            </Link>
          )}
          {state.sources.length > 0 && (
            <section
              className={styles.resultsSection}
              aria-labelledby="sources-title"
            >
              <h2 id="sources-title">
                {mode === "research" ? "What I found" : "Results"}
                <span className={styles.sourceCount}>
                  {" "}
                  {state.sources.length}
                </span>
              </h2>
              <ul className={styles.resultList}>
                {state.sources.map((source) => (
                  <li key={source.sourceId}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                    <small>{source.displayUrl}</small>
                    {source.snippet && <p>{source.snippet}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
        {state.sources.length > 0 && (
          <aside className={styles.evidence} aria-label="Evidence">
            <h2>Evidence</h2>
            <p>
              {state.sources.length} source
              {state.sources.length === 1 ? "" : "s"} attached to this turn.
            </p>
            {state.sources.map((source) => (
              <article
                id={`source-${source.sourceId}`}
                className={styles.evidenceItem}
                key={source.sourceId}
              >
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                <small>{source.displayUrl}</small>
                {source.snippet && (
                  <p>{source.snippet.replace(/<[^>]+>/g, "")}</p>
                )}
              </article>
            ))}
          </aside>
        )}
      </div>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/unlock" element={<Unlock />} />
      <Route path="/settings" element={<Settings />} />
      <Route
        path="/topics/:threadId/export/:draftId"
        element={<ExportWorkbench />}
      />
      <Route path="/topics/:threadId" element={<Topic />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
