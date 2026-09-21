import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { SearchResultKind, SourceRecord, Thread, ThreadContext, ThreadId, TurnId, UserMessage } from "../../domain/types";
import { buildThreadContext } from "../../domain/thread-context";
import { getBrowserThreadStore } from "../../infrastructure/browser/thread-store";
import { createFetchTurnGateway } from "../../infrastructure/browser/turn-gateway";
import { TurnController, type TurnControllerView } from "../controllers/turn-controller";
import { EvidenceBox } from "../boxes/EvidenceBox";
import { PromptBox } from "../boxes/PromptBox";
import { StickyHeader } from "../boxes/StickyHeader";
import { TranscriptBox } from "../boxes/TranscriptBox";
import { MarkdownContent } from "../primitives/MarkdownContent";
import { sourceAccentSlotForIndex } from "../color-scheme";
import { researchAnswerPosition } from "../policies/answer-position";
import { threadMarkdown } from "../policies/thread-markdown";
import type { BoxIntent } from "../boxes/box-types";
import { workspaceController } from "../controllers/workspace-controller";
import { classifyPromptInput } from "../controllers/prompt-classifier";
import styles from "../App.module.css";
import { threadSelectorState } from "../navigation-state";

const gateway = createFetchTurnGateway();
const contextLimits = { maxThreadContextTurns: 8, maxThreadContextChars: 24_000, maxEvidenceCharsPerSource: 48_000, maxEvidenceCharsTotal: 96_000, maxTurnRequestBytes: 128_000 } as const;
const timestamp = () => new Date().toISOString() as UserMessage["createdAt"];
const uuid = () => crypto.randomUUID();

function researchStage(answerDraft: string, events: TurnControllerView["events"]): string {
  const phase = [...events].reverse().find((event) => event.type === "phase");
  const recursing = events.some((event) => event.type === "phase" && event.phase === "recursing");
  if (phase?.type === "phase") {
    if (phase.phase === "synthesizing") return "synthesizing";
    if (recursing) {
      if (phase.phase === "searching") return "recursing · searching";
      if (phase.phase === "extracting") return "recursing · extracting evidence";
      if (phase.phase === "assessing") return "recursing · assessing research";
      return "recursing";
    }
    if (phase.phase === "searching") return "searching sources";
    if (phase.phase === "extracting") return "extracting evidence";
    if (phase.phase === "assessing") return "assessing research";
    if (phase.phase === "decomposing") return "research direction";
    if (phase.phase === "resolving") return "resolving evidence";
  }
  return answerDraft ? "synthesizing" : "researching";
}

export function ResearchStatus({ answerDraft, events = [] }: { answerDraft: string; events?: TurnControllerView["events"] }) {
  return <div className={styles.researchLoader} role="status" aria-live="polite"><span className={styles.loaderBars} aria-hidden="true"><i /><i /><i /></span><span>{researchStage(answerDraft, events)}</span></div>;
}

function emptyContext(threadId: ThreadId): ThreadContext { return { threadId, turns: [], knownSources: [], availableEvidence: [] }; }
function sourceRecords(thread: Thread | null, live: SourceRecord[]): SourceRecord[] {
  const values = new Map<string, SourceRecord>();
  for (const source of thread?.sources ?? []) values.set(String(source.sourceId), source);
  for (const source of live) values.set(String(source.sourceId), source);
  return [...values.values()];
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
  const location = useLocation();
  const threadId = useMemo(() => (routeThreadId === "new" || !routeThreadId ? uuid() : routeThreadId) as ThreadId, [routeThreadId]);
  const queryValues = params.getAll("q");
  const query = queryValues.length === 1 ? (params.get("q") ?? "") : "";
  const [thread, setThread] = useState<Thread | null>(null);
  const threadRef = useRef<Thread | null>(null);
  const [view, setView] = useState<TurnControllerView>({ active: false, lastSequence: 0, events: [], answerDraft: "", sources: [] });
  const [activeRequest, setActiveRequest] = useState("");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [successfulAction, setSuccessfulAction] = useState<"copy" | "export" | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>(undefined);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const controller = useRef<TurnController | undefined>(undefined);
  const started = useRef(false);

  useEffect(() => () => { if (feedbackTimer.current !== undefined) window.clearTimeout(feedbackTimer.current); }, []);

  useEffect(() => {
    let cancelled = false;
    void getBrowserThreadStore().then((store) => store.load(threadId)).then((result) => { if (!cancelled && result.ok) { threadRef.current = result.value?.thread ?? null; setThread(threadRef.current); } });
    return () => { cancelled = true; };
  }, [threadId]);

  const run = useCallback(async (request: string, kind: "search" | "research", resultKind?: SearchResultKind) => {
    setActiveRequest(request);
    const createdAt = timestamp();
    const turnId = uuid() as TurnId;
    const userMessage: UserMessage = { id: uuid() as UserMessage["id"], role: "user", content: request, createdAt };
    const executionId = uuid() as never;
    const store = await getBrowserThreadStore();
    const record = await store.load(threadId);
    const current = record.ok ? record.value?.thread ?? null : threadRef.current;
    const context = kind === "research" ? (current ? buildThreadContext(current, contextLimits) : emptyContext(threadId)) : undefined;
    const answerPosition = researchAnswerPosition(current?.turns ?? []);
    const activeController = new TurnController(gateway, store, timestamp, setView);
    controller.current = activeController;
    setMessage("");
    const result = await activeController.run({ threadId, turnId, executionId, kind, resultKind, request, userMessage, createdAt, expectedRevision: record.ok ? record.value?.revision ?? null : null, create: current ? undefined : { id: threadId, title: [...request].slice(0, 120).join(""), createdAt }, context, answerPosition: kind === "research" ? answerPosition : undefined, gatewayOptions: { maxResults: 5, researchLimits: {} } });
    setActiveRequest("");
    if (result.ok) { threadRef.current = result.record.thread; setThread(result.record.thread); if (routeThreadId === "new" || !routeThreadId) navigate(`/threads/${encodeURIComponent(String(threadId))}`, { replace: true }); }
    else setMessage(result.error === "commit_retryable" ? "The result was not saved. Retry save." : result.message ?? "That turn could not be completed.");
  }, [navigate, routeThreadId, threadId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (queryValues.length > 1) { setMessage("The prompt URL must contain exactly one q parameter."); return; }
    if (!query.trim()) return;
    const submission = classifyPromptInput(query);
    if (submission.kind === "invalid") { setMessage(submission.message); return; }
    void run(submission.kind === "search" ? submission.query : submission.value, submission.kind, submission.kind === "search" ? submission.resultKind : undefined);
  }, [query, queryValues.length, run]);

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
    if (command.type === "submit") { setValue(""); setMessage(""); void run(command.value, command.kind, command.kind === "search" ? command.resultKind : undefined); }
    else if (command.type === "navigate") navigate(command.to, { replace: command.replace, state: command.to === "/threads" ? threadSelectorState(location) : undefined });
    else if (command.type === "invalid") setMessage(command.message);
    else if (command.type === "retry") void controller.current?.retryCommit();
  };
  const sources = sourceRecords(thread, view.sources);
  const sourceById = new Map(sources.map((source) => [String(source.sourceId), source]));
  const resolveCitation = (sourceId: string) => { const source = sourceById.get(sourceId); const number = sources.findIndex((candidate) => String(candidate.sourceId) === sourceId) + 1; return source ? { label: source.title, href: source.url, sourceId, number } : undefined; };
  const selectCitation = (sourceId: string) => { setSelectedSourceId(sourceId); window.setTimeout(() => document.getElementById(`source-${sourceId}`)?.focus(), 0); };
  return <main className={`${styles.shell} ${styles.threadShell}`}>
    <StickyHeader onIntent={onIntent} actions={thread ? <div className={styles.headerActions} aria-label="Thread actions"><button className={`${styles.iconButton} ${successfulAction === "copy" ? styles.iconButtonSuccess : ""}`} type="button" onClick={() => void copyThread()} aria-label={successfulAction === "copy" ? "Copied thread" : "Copy thread"}>{successfulAction === "copy" ? <CheckGlyph /> : <CopyGlyph />}</button><button className={`${styles.iconButton} ${successfulAction === "export" ? styles.iconButtonSuccess : ""}`} type="button" onClick={exportThread} aria-label={successfulAction === "export" ? "Exported thread" : "Export thread"}>{successfulAction === "export" ? <CheckGlyph /> : <ExportGlyph />}</button></div> : undefined} />
    {message && <p role="alert">{message}</p>}
    {thread && <TranscriptBox thread={thread} sources={sources} onIntent={onIntent} onCitationSelect={selectCitation} />}
    {view.active && activeRequest && <article className={styles.scrollback}><blockquote className={styles.userTurn}>{activeRequest}</blockquote></article>}
    {view.active && <ResearchStatus answerDraft={view.answerDraft} events={view.events} />}
    {view.active && view.answerDraft && <MarkdownContent markdown={view.answerDraft} threadSeed={String(threadId)} resolveCitation={resolveCitation} citationAccentSlot={(sourceId) => { const index = sources.findIndex((source) => String(source.sourceId) === sourceId); return index >= 0 ? sourceAccentSlotForIndex(index, 8) : undefined; }} onCitationSelect={selectCitation} />}
    {sources.length > 0 && <EvidenceBox sources={sources} selectedSourceId={selectedSourceId} onIntent={onIntent} />}
    <PromptBox value={value} disabled={view.active} onChange={setValue} onIntent={onIntent} />
  </main>;
}
