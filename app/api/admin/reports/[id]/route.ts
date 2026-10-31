import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { boundedJson, insightFailure, insightResponse, InsightRequestError, oneChatRenderAtATime, readOwnedInsightSource, renderMaterialSlides, runningAnalyses } from "../../../../_service/insight-request.ts";
import { checkDailyDrafts, draftBasis, drafting, ownedReport, reportView, startDraft, type ReportRow } from "../../../../_service/report-request.ts";
import { CHAT_SLIDES_PER_ANSWER, chatReport, insightAi, viewSlides } from "../../../../_service/insight-ai.ts";
import { applyReportProposal, CHAT_QUESTIONS_PER_REPORT, draftReport, REDRAFTS_PER_REPORT, parseReportDocument, type ReportDocument, type ReportMessage, type ReportProposal } from "../../../../_model/report.ts";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
// ponytail: in-memory, one server. Move to a DB lock if the app runs on more than one server.
const answeringReports = new Set<string>();
const now = () => new Date().toISOString();
const conflict = (row: ReportRow) => insightResponse({ error: "REPORT_CONFLICT", report: reportView(row) }, 409);
/** The document can be edited, applied to, undone, or chatted about: it exists and no draft run may overwrite it. */
const editable = (row: ReportRow): row is ReportRow & { document: ReportDocument } => Boolean(row.document) && !drafting(row);

export async function GET(request: Request, context: Context) {
  try { return insightResponse(reportView((await ownedReport(request, (await context.params).id)).row)); }
  catch (error) { return insightFailure(error); }
}

/** `{ document, updatedAt }` autosave (RPT-040): a stale `updatedAt` gets 409 with the current report, never an overwrite. */
export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params, { db, row } = await ownedReport(request, id);
    const body = await boundedJson(request.body, 4 * 1024 * 1024) as { document?: unknown; updatedAt?: unknown };
    if (!editable(row)) throw new InsightRequestError("REPORT_NOT_READY", 409);
    if (body?.updatedAt !== row.updated_at) return conflict(row);
    let document: ReportDocument;
    try { document = parseReportDocument(body.document, row.document); } catch { throw new InsightRequestError("INVALID_DOCUMENT", 400); }
    return await save(db, row, { document });
  } catch (error) { return insightFailure(error); }
}

/** Writes only if the row is still at the version this request read; otherwise 409 with what is there now. */
async function save(db: Awaited<ReturnType<typeof ownedReport>>["db"], row: ReportRow, values: Record<string, unknown>, status = 200) {
  const result = await db.from("instructor_reports").update({ ...values, updated_at: now() }).eq("id", row.id).eq("updated_at", row.updated_at).select("*").maybeSingle();
  if (result.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  if (result.data) return insightResponse(reportView(result.data as ReportRow), status);
  const current = await db.from("instructor_reports").select("*").eq("id", row.id).single();
  if (current.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  return conflict(current.data as ReportRow);
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params, { db, ownerId } = await ownedReport(request, id);
    runningAnalyses.get(id)?.abort();
    const result = await db.from("instructor_reports").delete().eq("id", id).eq("owner_id", ownerId);
    if (result.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return insightFailure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params, { db, row, ownerId, authorization } = await ownedReport(request, id);
    const body = await boundedJson(request.body, 8192) as { action?: unknown; metricsOnly?: unknown; messageIndex?: unknown; updatedAt?: unknown; message?: unknown; slide?: unknown };
    const messages = row.messages ?? [];
    if (body?.action === "redraft") {
      if (drafting(row)) throw new InsightRequestError("REPORT_DRAFTING", 409);
      const ai = body.metricsOnly === true ? null : insightAi();
      if (body.metricsOnly !== true && !ai) throw new InsightRequestError("ANALYSIS_NOT_CONFIGURED", 503);
      // RPT-034: an AI redraft over a document is limited per report; retrying a draft that never produced one is not a redraft.
      const redrafts = ai && row.document ? (row.redrafts ?? 0) + 1 : undefined;
      if (redrafts && redrafts > REDRAFTS_PER_REPORT && process.env.NODE_ENV !== "development") throw new InsightRequestError("REDRAFT_LIMIT", 429);
      if (ai) await checkDailyDrafts(db, ownerId);
      const source = await readOwnedInsightSource(authorization, [row.material_id], request.signal);
      const basis = await draftBasis(db, ownerId, source.materials[0]), previous = row.document ?? row.previous_document ?? null;
      // RPT-034/043: the replaced document becomes the undo target.
      if (!ai) return await save(db, row, { status: "ready", error: null, document: draftReport({ ...basis, analysis: null }), analysis: null, previous_document: previous }, 202);
      const draftedAt = now(), response = await save(db, row, { status: "drafting", error: null, drafted_at: draftedAt }, 202);
      if (response.status === 202) startDraft(db, id, draftedAt, ai, source, basis, previous, redrafts);
      return response;
    }
    if (body?.action === "cancel") {
      const result = await db.from("instructor_reports").update({ status: "failed", error: "ANALYSIS_CANCELLED", updated_at: now() })
        .eq("id", id).eq("status", "drafting").select("*").maybeSingle();
      if (result.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
      runningAnalyses.get(id)?.abort();
      // Already finished or failed: show its current state instead of an error.
      return insightResponse(reportView((result.data as ReportRow | null) ?? row));
    }
    if (body?.action === "undo") {
      if (drafting(row)) throw new InsightRequestError("REPORT_DRAFTING", 409);
      if (!row.previous_document) throw new InsightRequestError("NOTHING_TO_UNDO", 409);
      return await save(db, row, { status: "ready", error: null, document: row.previous_document, previous_document: row.document ?? null });
    }
    if (body?.action === "apply") {
      if (!editable(row)) throw new InsightRequestError("REPORT_NOT_READY", 409);
      // The answer being saved would write its message list over the `applied` mark.
      if (answeringReports.has(id)) throw new InsightRequestError("CHAT_BUSY", 409);
      if (body.updatedAt !== row.updated_at) return conflict(row);
      // messageIndex counts the visible messages ReportView returns, which skip cleared turns.
      const visible = messages.flatMap((item, index) => item.cleared ? [] : [index]);
      const index = Number.isInteger(body.messageIndex) ? visible[body.messageIndex as number] : undefined;
      const turn = index === undefined ? undefined : messages[index];
      if (!turn?.proposal || turn.role !== "assistant" || turn.applied) throw new InsightRequestError("INVALID_REQUEST", 400);
      let document: ReportDocument;
      // The instructor may have edited since the proposal; the result must still fit RPT-022.
      try { document = parseReportDocument(applyReportProposal(row.document, turn.proposal), row.document); }
      catch { throw new InsightRequestError("INVALID_PROPOSAL", 409); }
      return await save(db, row, { document, previous_document: row.document, messages: messages.map((item, i) => i === index ? { ...item, applied: true } : item) });
    }
    if (body?.action === "reset") {
      // Saving the answer in progress would bring the wiped text back.
      if (answeringReports.has(id)) throw new InsightRequestError("CHAT_BUSY", 409);
      // Text is wiped; blank turns stay so a new conversation can't reset the per-report question limit.
      const cleared = messages.map(({ role, createdAt }) => ({ role, text: "", createdAt, cleared: true as const }));
      const result = await db.from("instructor_reports").update({ messages: cleared }).eq("id", id).select("*").single();
      if (result.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
      return insightResponse(reportView(result.data as ReportRow));
    }
    if (body?.action === "chat") return await chat(request, db, row, authorization, body);
    throw new InsightRequestError("INVALID_REQUEST", 400);
  } catch (error) { return insightFailure(error); }
}

async function chat(request: Request, db: Awaited<ReturnType<typeof ownedReport>>["db"], row: ReportRow, authorization: string, body: { message?: unknown; slide?: unknown }) {
  const id = row.id, message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 2000) throw new InsightRequestError("INVALID_REQUEST", 400);
  if (!editable(row)) throw new InsightRequestError("REPORT_NOT_READY", 409);
  const document = row.document, ai = insightAi();
  if (!ai) throw new InsightRequestError("ANALYSIS_NOT_CONFIGURED", 503);
  // One answer per report at a time, so two tabs cannot both pass the count below.
  if (answeringReports.has(id)) throw new InsightRequestError("CHAT_BUSY", 409);
  // A pending turn with no answer running was left by a server restart: drop it so that question is refunded.
  const history = (row.messages ?? []).filter((item) => !item.pending);
  // ponytail: flat 5 questions per report until billing plans exist. `next dev` has no limit.
  if (process.env.NODE_ENV !== "development" && history.filter((item) => item.role === "user").length >= CHAT_QUESTIONS_PER_REPORT) throw new InsightRequestError("CHAT_LIMIT", 429);
  answeringReports.add(id);
  const stop = new AbortController(), signal = AbortSignal.any([request.signal, stop.signal, AbortSignal.timeout(90_000)]);
  // Reserve the question before calling the AI: a stopped answer still counts, a server or AI failure is refunded.
  const spent: ReportMessage = { role: "user", text: "", createdAt: now(), cleared: true };
  let material: Awaited<ReturnType<typeof readOwnedInsightSource>>["materials"][number];
  try {
    // The chat context quotes the source questions, read with the instructor's JWT.
    material = (await readOwnedInsightSource(authorization, [row.material_id], signal)).materials[0];
    const reserved = await db.from("instructor_reports").update({ messages: [...history, { ...spent, pending: true }] }).eq("id", id);
    if (reserved.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  } catch (error) { answeringReports.delete(id); throw error; }
  const slide = Number.isInteger(body.slide) && (body.slide as number) >= 1 && (body.slide as number) <= document.metrics.slides ? body.slide as number : null;
  const budget = { left: CHAT_SLIDES_PER_ANSWER };
  const view = async (input: unknown) => {
    const work = await mkdtemp(path.join(tmpdir(), "report-chat-"));
    try { return await viewSlides(material, document.metrics.slides, (pages) => oneChatRenderAtATime(() => { signal.throwIfAborted(); return renderMaterialSlides(material, work, pages); }), input, budget); }
    finally { await rm(work, { recursive: true, force: true }); }
  };
  let proposal: ReportProposal | undefined;
  const answer = chatReport(ai, { document, material, history: history.filter((item) => !item.cleared), message, currentPage: slide, view,
    onProposal: (value) => { proposal = value; }, signal });
  const encoder = new TextEncoder();
  // Text deltas stream as plain text; the turn is saved only once the full answer arrives, otherwise the stream errors.
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        let text = "";
        for await (const delta of answer) { text += delta; controller.enqueue(encoder.encode(delta)); }
        const at = now();
        const saved: ReportMessage[] = [...history, { role: "user", text: message, createdAt: at }, { role: "assistant", text: text.trim(), createdAt: at, ...proposal ? { proposal } : {} }];
        const result = await db.from("instructor_reports").update({ messages: saved }).eq("id", id);
        if (result.error) throw new Error("REPORT_STORAGE_UNAVAILABLE");
        controller.close();
      } catch (error) {
        const stopped = stop.signal.aborted || request.signal.aborted;
        await db.from("instructor_reports").update({ messages: stopped ? [...history, spent] : history }).eq("id", id);
        if (!stop.signal.aborted) controller.error(error); // a cancelled stream is already closed
      } finally { answeringReports.delete(id); }
    },
    cancel() { stop.abort(); },
  }), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
