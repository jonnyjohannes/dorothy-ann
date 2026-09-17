import { Hono, type Context } from "hono";
import { threadIdSchema } from "../domain/schemas-v3.js";
import type { CommitTerminalTurnInput, ThreadRevision, ThreadStore, ThreadStoreFailure, ThreadStoreResult } from "../ports/storage-v3.js";

const statusFor = (failure: ThreadStoreFailure) => failure.code === "revision_conflict" ? 409
  : failure.code === "thread_not_found" ? 404
    : failure.code === "thread_deleted" ? 410
      : failure.code === "invalid_record" ? 400
        : failure.code === "integrity_failure" ? 422
          : failure.code === "quota_exceeded" ? 507 : 503;

export function createThreadStorageRoutes(store: ThreadStore) {
  const routes = new Hono();
  const send = <T>(context: Context, result: ThreadStoreResult<T>) => result.ok
    ? context.json(result.value)
    : context.json({ failure: result.failure }, statusFor(result.failure));

  routes.get("/", async (context) => send(context, await store.list()));
  routes.get("/export", async (context) => {
    const raw = context.req.query("ids");
    const ids = raw ? raw.split(",").map((id) => threadIdSchema.safeParse(id)) : [];
    if (ids.some((id) => !id.success)) return context.json({ failure: { code: "invalid_record", retryable: false } }, 400);
    return send(context, await store.exportData(raw ? ids.flatMap((id) => id.success ? [id.data] : []) : undefined));
  });
  routes.post("/import/preview", async (context) => {
    const body = await context.req.json().catch(() => null) as { backup?: unknown } | null;
    if (!body || !("backup" in body)) return context.json({ failure: { code: "invalid_record", retryable: false } }, 400);
    const result = await store.inspectImport(body.backup);
    return result.ok ? context.json({ preview: result.value.preview }) : send(context, result);
  });
  routes.post("/import", async (context) => {
    const body = await context.req.json().catch(() => null) as { backup?: unknown; onConflict?: unknown } | null;
    if (!body || !("backup" in body) || (body.onConflict !== "keep_existing" && body.onConflict !== "replace_existing")) return context.json({ failure: { code: "invalid_record", retryable: false } }, 400);
    const inspected = await store.inspectImport(body.backup);
    if (!inspected.ok) return send(context, inspected);
    return send(context, await store.importData(inspected.value.candidate, { onConflict: body.onConflict }));
  });
  routes.get("/:threadId", async (context) => {
    const id = threadIdSchema.safeParse(context.req.param("threadId"));
    return id.success ? send(context, await store.load(id.data)) : context.json({ failure: { code: "invalid_record", retryable: false } }, 400);
  });
  routes.post("/:threadId/terminal", async (context) => {
    const id = threadIdSchema.safeParse(context.req.param("threadId"));
    const body = await context.req.json().catch(() => null) as CommitTerminalTurnInput | null;
    if (!id.success || !body || body.threadId !== id.data) return context.json({ failure: { code: "invalid_record", retryable: false } }, 400);
    return send(context, await store.commitTerminalTurn(body));
  });
  routes.delete("/:threadId", async (context) => {
    const id = threadIdSchema.safeParse(context.req.param("threadId"));
    const body = await context.req.json().catch(() => ({})) as { expectedRevision?: unknown };
    if (!id.success || (body.expectedRevision !== undefined && typeof body.expectedRevision !== "string")) return context.json({ failure: { code: "invalid_record", retryable: false } }, 400);
    return send(context, await store.remove({ threadId: id.data, expectedRevision: body.expectedRevision as ThreadRevision | undefined }));
  });
  return routes;
}
