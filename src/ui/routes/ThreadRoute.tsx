import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CanonicalSource, Thread, ThreadContext, ThreadId, TurnId, UserMessage } from "../../domain/types";
import { buildThreadContext } from "../../domain/thread-context";
import { IndexedDbThreadStore } from "../../infrastructure/browser/indexeddb-thread-store";
import { createFetchTurnGateway } from "../../infrastructure/browser/turn-gateway";
import { TurnController, type TurnControllerView } from "../controllers/turn-controller";
import { EvidenceBox } from "../boxes/EvidenceBox";
import { PromptBox } from "../boxes/PromptBox";
import { StickyHeader } from "../boxes/StickyHeader";
import { TranscriptBox } from "../boxes/TranscriptBox";
import type { BoxIntent } from "../boxes/box-types";
import styles from "../App.module.css";

let store: IndexedDbThreadStore | undefined;
const getStore = () => store ??= new IndexedDbThreadStore();
const gateway = createFetchTurnGateway();
const contextLimits = { maxThreadContextTurns: 8, maxThreadContextChars: 24_000, maxEvidenceCharsPerSource: 48_000, maxEvidenceCharsTotal: 96_000, maxTurnRequestBytes: 128_000 } as const;
const timestamp = () => new Date().toISOString() as UserMessage["createdAt"];
const uuid = () => crypto.randomUUID();
const requestedResearch = (query: string) => query.trimEnd().endsWith("?");

function emptyContext(threadId: ThreadId): ThreadContext { return { threadId, turns: [], knownSources: [], availableEvidence: [] }; }
function sourceRecords(thread: Thread | null, live: CanonicalSource[]): CanonicalSource[] {
  const values = new Map<string, CanonicalSource>();
  for (const source of thread?.sources ?? []) values.set(String(source.sourceId), source);
  for (const source of live) values.set(String(source.sourceId), source);
  return [...values.values()];
}

export function ThreadRoute() {
  const { threadId: routeThreadId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const threadId = useMemo(() => (routeThreadId === "new" || !routeThreadId ? uuid() : routeThreadId) as ThreadId, [routeThreadId]);
  const query = params.get("q")?.trim() ?? "";
  const requestedKind = requestedResearch(query) ? "research" : "search";
  const [thread, setThread] = useState<Thread | null>(null);
  const threadRef = useRef<Thread | null>(null);
  const [view, setView] = useState<TurnControllerView>({ active: false, lastSequence: 0, events: [], answerDraft: "", sources: [] });
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const controller = useRef<TurnController | undefined>(undefined);
  const started = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getStore().load(threadId).then((result) => { if (!cancelled && result.ok) { threadRef.current = result.value?.thread ?? null; setThread(threadRef.current); } });
    return () => { cancelled = true; };
  }, [threadId]);

  const run = useCallback(async (request: string, kind: "search" | "research") => {
    const createdAt = timestamp();
    const turnId = uuid() as TurnId;
    const userMessage: UserMessage = { id: uuid() as UserMessage["id"], role: "user", content: request, createdAt };
    const executionId = uuid() as never;
    const current = threadRef.current;
    const context = kind === "research" ? (current ? buildThreadContext(current, contextLimits) : emptyContext(threadId)) : undefined;
    const record = current ? await getStore().load(threadId) : null;
    const activeController = new TurnController(gateway, getStore(), timestamp, setView);
    controller.current = activeController;
    setMessage("");
    const result = await activeController.run({ threadId, turnId, executionId, kind, request, userMessage, createdAt, expectedRevision: record && record.ok ? record.value?.revision ?? null : null, create: current ? undefined : { id: threadId, title: request.slice(0, 60), createdAt }, context, gatewayOptions: { maxResults: 5, researchLimits: {} } });
    if (result.ok) { threadRef.current = result.record.thread; setThread(result.record.thread); if (routeThreadId === "new") navigate(`/topics/${encodeURIComponent(String(threadId))}`, { replace: true }); }
    else setMessage(result.error === "commit_retryable" ? "The result was not saved. Retry save." : "That turn could not be completed.");
  }, [navigate, routeThreadId, threadId]);

  useEffect(() => {
    if (!query || started.current) return;
    started.current = true;
    void run(query, requestedKind);
  }, [query, requestedKind, run]);

  const onIntent = (intent: BoxIntent) => {
    if (intent.type === "prompt_submitted") { setValue(""); void run(intent.value, requestedResearch(intent.value) ? "research" : "search"); }
    else if (intent.type === "command_requested") { if (intent.command === "/new") navigate("/new", { replace: true }); else if (intent.command === "/threads") navigate("/threads"); else if (intent.command === "/settings") navigate("/settings"); }
    else if (intent.type === "new_thread_requested") navigate("/new", { replace: true });
    else if (intent.type === "retry_requested") void controller.current?.retryCommit();
  };
  const sources = sourceRecords(thread, view.sources);
  return <main className={styles.shell}>
    <StickyHeader onIntent={onIntent} />
    {message && <p role="alert">{message}</p>}
    {view.active && <p role="status" aria-live="polite">{view.answerDraft ? "synthesizing" : "researching"}</p>}
    {thread && <TranscriptBox thread={thread} sources={sources} onIntent={onIntent} />}
    {view.answerDraft && <p className={styles.answer}>{view.answerDraft}</p>}
    {sources.length > 0 && <EvidenceBox sources={sources} onIntent={onIntent} />}
    <PromptBox value={value} disabled={view.active} onChange={setValue} onIntent={onIntent} />
  </main>;
}
