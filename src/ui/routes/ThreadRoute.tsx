import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CanonicalSource, Thread, ThreadContext, ThreadId, TurnId, UserMessage } from "../../domain/types";
import { projectCitationsToMarkdown } from "../../domain/citations";
import { buildThreadContext } from "../../domain/thread-context";
import { IndexedDbThreadStore } from "../../infrastructure/browser/indexeddb-thread-store";
import { createFetchTurnGateway } from "../../infrastructure/browser/turn-gateway";
import { TurnController, type TurnControllerView } from "../controllers/turn-controller";
import { EvidenceBox } from "../boxes/EvidenceBox";
import { PromptBox } from "../boxes/PromptBox";
import { StickyHeader } from "../boxes/StickyHeader";
import { TranscriptBox } from "../boxes/TranscriptBox";
import { MarkdownContent } from "../primitives/MarkdownContent";
import type { BoxIntent } from "../boxes/box-types";
import { workspaceController } from "../controllers/workspace-controller";
import styles from "../App.module.css";

let store: IndexedDbThreadStore | undefined;
const getStore = () => store ??= new IndexedDbThreadStore();
const gateway = createFetchTurnGateway();
const contextLimits = { maxThreadContextTurns: 8, maxThreadContextChars: 24_000, maxEvidenceCharsPerSource: 48_000, maxEvidenceCharsTotal: 96_000, maxTurnRequestBytes: 128_000 } as const;
const timestamp = () => new Date().toISOString() as UserMessage["createdAt"];
const uuid = () => crypto.randomUUID();

export function ResearchStatus({ answerDraft }: { answerDraft: string }) {
  return <div className={styles.researchLoader} role="status" aria-live="polite"><span className={styles.loaderBars} aria-hidden="true"><i /><i /><i /></span><span>{answerDraft ? "synthesizing" : "researching"}</span></div>;
}

function emptyContext(threadId: ThreadId): ThreadContext { return { threadId, turns: [], knownSources: [], availableEvidence: [] }; }
function sourceRecords(thread: Thread | null, live: CanonicalSource[]): CanonicalSource[] {
  const values = new Map<string, CanonicalSource>();
  for (const source of thread?.sources ?? []) values.set(String(source.sourceId), source);
  for (const source of live) values.set(String(source.sourceId), source);
  return [...values.values()];
}
function threadMarkdown(thread: Thread): string {
  return thread.turns.map((turn) => {
    const answer = turn.kind === "research" && turn.status === "completed" ? projectCitationsToMarkdown(turn.result.answer) : turn.status === "failed" ? turn.failure.message : turn.status === "interrupted" ? turn.interruption.message : turn.kind === "search" && turn.status === "completed" ? turn.result.destinations.map((destination) => `[${destination.sourceId}]`).join(" ") : "";
    return `## ${turn.userMessage.content}\n\n${answer}`;
  }).join("\n\n---\n\n");
}
function downloadMarkdown(markdown: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
function glyphProps() { return { "aria-hidden": true, viewBox: "0 0 24 24", width: "18", height: "18", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" as const, strokeLinejoin: "round" as const }; }
function CheckGlyph() { return <svg {...glyphProps()}><path d="m5 12 4 4L19 6" /></svg>; }
function CopyGlyph() { return <svg {...glyphProps()}><rect x="8" y="8" width="11" height="11" rx="1.5" /><path d="M16 8V6.5A1.5 1.5 0 0 0 14.5 5h-7A1.5 1.5 0 0 0 6 6.5v7A1.5 1.5 0 0 0 7.5 15H8" /></svg>; }
function ExportGlyph() { return <svg {...glyphProps()}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>; }

export function ThreadRoute() {
  const { threadId: routeThreadId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const threadId = useMemo(() => (routeThreadId === "new" || !routeThreadId ? uuid() : routeThreadId) as ThreadId, [routeThreadId]);
  const query = params.get("q")?.trim() ?? "";
  const requestedKind = params.get("kind") === "search" ? "search" : "research";
  const [thread, setThread] = useState<Thread | null>(null);
  const threadRef = useRef<Thread | null>(null);
  const [view, setView] = useState<TurnControllerView>({ active: false, lastSequence: 0, events: [], answerDraft: "", sources: [] });
  const [activeRequest, setActiveRequest] = useState("");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [successfulAction, setSuccessfulAction] = useState<"copy" | "export" | null>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const controller = useRef<TurnController | undefined>(undefined);
  const started = useRef(false);

  useEffect(() => () => { if (feedbackTimer.current !== undefined) window.clearTimeout(feedbackTimer.current); }, []);

  useEffect(() => {
    let cancelled = false;
    void getStore().load(threadId).then((result) => { if (!cancelled && result.ok) { threadRef.current = result.value?.thread ?? null; setThread(threadRef.current); } });
    return () => { cancelled = true; };
  }, [threadId]);

  const run = useCallback(async (request: string, kind: "search" | "research") => {
    setActiveRequest(request);
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
    setActiveRequest("");
    if (result.ok) { threadRef.current = result.record.thread; setThread(result.record.thread); if (routeThreadId === "new") navigate(`/topics/${encodeURIComponent(String(threadId))}`, { replace: true }); }
    else setMessage(result.error === "commit_retryable" ? "The result was not saved. Retry save." : result.message ?? "That turn could not be completed.");
  }, [navigate, routeThreadId, threadId]);

  useEffect(() => {
    if (!query || started.current) return;
    started.current = true;
    void run(query, requestedKind);
  }, [query, requestedKind, run]);

  const showSuccess = (action: "copy" | "export") => {
    if (feedbackTimer.current !== undefined) window.clearTimeout(feedbackTimer.current);
    setSuccessfulAction(action);
    feedbackTimer.current = window.setTimeout(() => { setSuccessfulAction(null); feedbackTimer.current = undefined; }, 2000);
  };
  const copyThread = async () => {
    if (!thread) return;
    try { await navigator.clipboard.writeText(threadMarkdown(thread)); showSuccess("copy"); } catch { setSuccessfulAction(null); }
  };
  const exportThread = () => { if (thread) { downloadMarkdown(threadMarkdown(thread), "dorothy-ann-thread.md"); showSuccess("export"); } };
  const onIntent = (intent: BoxIntent) => {
    const command = workspaceController.command(intent);
    if (!command) return;
    if (command.type === "submit") { setValue(""); setMessage(""); void run(command.value, command.kind); }
    else if (command.type === "navigate") navigate(command.to, { replace: command.replace });
    else if (command.type === "invalid") setMessage(command.message);
    else if (command.type === "retry") void controller.current?.retryCommit();
  };
  const sources = sourceRecords(thread, view.sources);
  return <main className={styles.shell}>
    <StickyHeader onIntent={onIntent} actions={thread ? <div className={styles.headerActions} aria-label="Thread actions"><button className={`${styles.iconButton} ${successfulAction === "copy" ? styles.iconButtonSuccess : ""}`} type="button" onClick={() => void copyThread()} aria-label={successfulAction === "copy" ? "Copied thread" : "Copy thread"}>{successfulAction === "copy" ? <CheckGlyph /> : <CopyGlyph />}</button><button className={`${styles.iconButton} ${successfulAction === "export" ? styles.iconButtonSuccess : ""}`} type="button" onClick={exportThread} aria-label={successfulAction === "export" ? "Exported thread" : "Export thread"}>{successfulAction === "export" ? <CheckGlyph /> : <ExportGlyph />}</button></div> : undefined} />
    {message && <p role="alert">{message}</p>}
    {thread && <TranscriptBox thread={thread} sources={sources} onIntent={onIntent} />}
    {view.active && activeRequest && <blockquote className={styles.userTurn}>{activeRequest}</blockquote>}
    {view.active && <ResearchStatus answerDraft={view.answerDraft} />}
    {view.active && view.answerDraft && <MarkdownContent markdown={view.answerDraft} threadSeed={String(threadId)} />}
    {sources.length > 0 && <EvidenceBox sources={sources} onIntent={onIntent} />}
    <PromptBox value={value} disabled={view.active} onChange={setValue} onIntent={onIntent} />
  </main>;
}
