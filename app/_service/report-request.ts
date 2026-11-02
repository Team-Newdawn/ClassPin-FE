import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after } from "next/server";
import { boundedJson, insightOwner, insightStorage, InsightRequestError, oneRenderAtATime, readOwnedInsightSource, renderMaterialSlides, runningAnalyses, STALE_RUN_MS } from "./insight-request.ts";
import { analyzeInsight, type InsightAi } from "./insight-ai.ts";
import { redactInsightText } from "./insight-redaction.ts";
import { restOrigin } from "../_infrastructure/server/rest-origin.ts";
import { previewReportExport, type exportReport } from "./report-export.ts";
import { CHAT_QUESTIONS_PER_REPORT, draftReport, REPORT_TEMPLATES, reportMetrics, type ReportTemplate, type DraftProgress, type ReportDocument, type ReportMessage, type ReportStatus, type ReportView } from "../_model/report.ts";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Db = ReturnType<typeof insightStorage>;
type Source = Awaited<ReturnType<typeof readOwnedInsightSource>>;
type Material = Source["materials"][number];
export type ReportRow = { id: string; material_id: string; title: string; file_name: string; status: ReportStatus; error: string | null; created_at: string; updated_at: string;
  drafted_at: string | null; template?: ReportTemplate | null; request?: string | null; document?: ReportDocument | null; previous_document?: ReportDocument | null; messages?: ReportMessage[] };

export const EXPORT_FORMATS = ["md", "pdf", "pptx", "docx"];
// ponytail: in-memory, one server. Move to a DB lock if the app runs on more than one server.
const exportsByOwner = new Map<string, AbortController>();
/**
 * RPT-060..064 and DSH-042: one export per instructor. A newer request (another click, a format or item switch) stops the older
 * one, so repeated clicks cannot fill the server-wide render queue; `next dev` has no limit. `preview=1` adds the rendered preview.
 */
export async function exportFile(request: Request, ownerId: string, format: string, build: (work: string, signal: AbortSignal) => ReturnType<typeof exportReport>) {
  const mine = new AbortController(), signal = AbortSignal.any([request.signal, mine.signal]);
  if (process.env.NODE_ENV !== "development") { exportsByOwner.get(ownerId)?.abort(); exportsByOwner.set(ownerId, mine); }
  const work = await mkdtemp(path.join(tmpdir(), "report-export-"));
  try {
    const result = await build(work, signal);
    if (new URL(request.url).searchParams.get("preview") === "1") {
      try {
        const preview = await oneRenderAtATime(() => { signal.throwIfAborted(); return previewReportExport(result, format, work, signal); });
        return new Response(preview, { headers: { "Cache-Control": "no-store" } });
      } catch {
        throw new InsightRequestError("EXPORT_PREVIEW_FAILED", 503);
      }
    }
    return new Response(new Uint8Array(result.bytes), { headers: { "Content-Type": result.mime, "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="report.${format}"` } });
  } finally {
    if (exportsByOwner.get(ownerId) === mine) exportsByOwner.delete(ownerId);
    await rm(work, { recursive: true, force: true });
  }
}

/** The caller's own `instructor_reports` row, or 404 for a bad id, someone else's report, or a missing one (RPT-081). */
export async function ownedReport(request: Request, id: string) {
  const { ownerId, authorization } = await insightOwner(request);
  if (!uuid.test(id)) throw new InsightRequestError("NOT_FOUND", 404);
  const db = insightStorage();
  const { data, error } = await db.from("instructor_reports").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  if (!data) throw new InsightRequestError("NOT_FOUND", 404);
  return { db, row: data as ReportRow, ownerId, authorization };
}

/** A draft still `drafting` long after its run started was cut off (restart/deploy) and shows as failed. */
const staleDraft = (row: ReportRow) => row.status === "drafting" && Date.now() - Date.parse(row.drafted_at ?? row.updated_at) > STALE_RUN_MS;
export function reportView(row: ReportRow): ReportView {
  const messages = row.messages ?? [], stale = staleDraft(row);
  return { id: row.id, materialId: row.material_id, template: row.template ?? null, title: row.title, fileName: row.file_name, status: stale ? "failed" : row.status,
    error: stale ? "ANALYSIS_INTERRUPTED" : row.error, createdAt: row.created_at, updatedAt: row.updated_at, document: row.document ?? null,
    canUndo: row.previous_document != null, messages: messages.filter((item) => !item.cleared),
    // Cleared and pending turns still count: a new conversation must not reset the per-report limit.
    questionsLeft: Math.max(0, CHAT_QUESTIONS_PER_REPORT - messages.filter((item) => item.role === "user").length) };
}
/** True while a draft run may still write; a stale one can be retried or cancelled. */
export const drafting = (row: ReportRow) => row.status === "drafting" && !staleDraft(row);

// ponytail: one flat quota until billing plans exist; two simultaneous starts can both pass the count (3 at most).
// `next dev` (local and dev:remote) has no quota so analysis changes can be retried freely.
const DAILY_ANALYSES = process.env.NODE_ENV === "development" ? Infinity : 2, KST_MS = 9 * 3_600_000, DAY_MS = 86_400_000;
/** AI drafts started today in Korean time; failed and interrupted runs are not the instructor's fault, so they don't count. */
export async function checkDailyDrafts(db: Db, ownerId: string) {
  const today = new Date(Math.floor((Date.now() + KST_MS) / DAY_MS) * DAY_MS - KST_MS).toISOString();
  const used = await db.from("instructor_reports").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).gte("drafted_at", today)
    .or(`status.eq.ready,and(status.eq.drafting,drafted_at.gte."${new Date(Date.now() - STALE_RUN_MS).toISOString()}")`);
  if (used.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  if ((used.count ?? 0) >= DAILY_ANALYSES) throw new InsightRequestError("DAILY_LIMIT", 429);
}

/** Code-only draft parts: metrics (RPT-023) with the player's audience record, and the redacted raw questions for a metrics-only draft. */
/** RPT-036: `form` is the report's template and the instructor's extra request; both shape the title and every AI draft. */
export async function draftBasis(db: Db, ownerId: string, material: Material, form: { template?: ReportTemplate | null; request?: string | null; folder?: string } = {}) {
  const record = await db.from("lecture_audience_records").select("started_at,ended_at,audience,peak_audience")
    .eq("lecture_id", material.lectureId).eq("owner_id", ownerId).maybeSingle();
  if (record.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  const audience = record.data;
  const startedAt = material.startedAt ?? audience?.started_at ?? null;
  const metrics = reportMetrics(material, { startedAt, endedAt: material.endedAt ?? audience?.ended_at ?? null },
    audience && { audience: audience.audience, peakAudience: audience.peak_audience });
  const pageOf = new Map(material.slides.map((slide) => [slide.id, slide.pageIndex + 1]));
  const questions = material.questions.map((q) => ({ page: pageOf.get(q.slideId)!, text: redactInsightText(q.text), reactions: q.reactions, status: q.status,
    answers: q.answers.map((answer) => redactInsightText(answer.body)) }));
  const template = form.template ?? null;
  return { title: template ? `${material.title} · ${REPORT_TEMPLATES[template].label}` : material.title, metrics, questions, template, request: form.request ?? null,
    // RPT-036 보고용 개요; the folder is unknown (null) for unfiled materials.
    lecture: { title: material.title, startedAt, folder: material.folderId ? form.folder ?? null : null } };
}

/**
 * Runs render → analysis → draft in `after()` for a row the caller already set to `drafting` with `draftedAt`.
 * finish() only writes while that same run is current, so a cancelled or superseded run never overwrites the report.
 */
/**
 * RPT-032: the running draft's step and slide-analysis preview, read by `GET` while polling. It lives exactly as long as the
 * in-process run, so a restart loses neither more nor less than the run itself.
 * ponytail: one server, like runningAnalyses. Store it in the row if drafts ever run on another server than the reads.
 */
export const draftProgress: Map<string, DraftProgress> = ((globalThis as { reportDraftProgress?: Map<string, DraftProgress> }).reportDraftProgress ??= new Map());

export function startDraft(db: Db, id: string, draftedAt: string, ai: InsightAi, source: Source, basis: Awaited<ReturnType<typeof draftBasis>>) {
  const material = source.materials[0], stop = new AbortController();
  runningAnalyses.set(id, stop);
  // A cancelled run that is still unwinding must not overwrite the next run's progress.
  const report = (progress: DraftProgress) => { if (runningAnalyses.get(id) === stop) draftProgress.set(id, progress); };
  report({ step: "render" });
  after(async () => {
    const finish = (values: Record<string, unknown>) => db.from("instructor_reports").update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", id).eq("status", "drafting").eq("drafted_at", draftedAt);
    try {
      // Step timings only (no content), to see whether the slide or the body step dominates.
      const started = Date.now();
      const work = await mkdtemp(path.join(tmpdir(), "report-"));
      try {
        const pages = await oneRenderAtATime(() => { stop.signal.throwIfAborted(); return renderMaterialSlides(material, work, undefined, stop.signal); });
        // RPT-036: the template and the instructor's own request (their text, so quoted and redacted) join the folder purpose.
        const purpose = [source.purposes.get(material.folderId ?? "") ?? "", basis.template ? REPORT_TEMPLATES[basis.template].prompt : "",
          basis.request ? `강사의 추가 요청: "${redactInsightText(basis.request).replaceAll("\"", "")}". 위 규칙과 충돌하지 않는 범위에서 반영한다.` : ""].filter(Boolean).join(" ");
        const slidesAt = Date.now();
        let bodyAt = 0;
        report({ step: "slides", done: 0, total: material.slides.length });
        const analysis = await analyzeInsight(ai, source, material, pages, purpose, AbortSignal.any([stop.signal, AbortSignal.timeout(280_000)]), (progress) => {
          if (progress.step === "slides") return report(progress);
          bodyAt = Date.now();
          const preview = draftReport({ ...basis, analysis: progress.partial });
          // 보고용's Top 3, conclusion and follow-ups only exist after the body call, so its preview is the overview alone.
          report({ step: "body", preview: basis.template === "executive" ? { ...preview, sections: preview.sections.slice(0, 1) } : preview });
        });
        console.info("[report-draft]", JSON.stringify({ pages: pages.length, renderMs: slidesAt - started, slidesMs: bodyAt - slidesAt, bodyMs: Date.now() - bodyAt }));
        await finish({ status: "ready", error: null, document: draftReport({ ...basis, analysis }), analysis });
      } finally {
        if (runningAnalyses.get(id) === stop) { runningAnalyses.delete(id); draftProgress.delete(id); }
        await rm(work, { recursive: true, force: true });
      }
    } catch (error) {
      // Only stable codes are stored; provider messages may echo prompt content.
      await finish({ status: "failed", error: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "ANALYSIS_FAILED" });
    }
  });
}

/** 404 unless the caller's REST course graph (read with their JWT) contains this lecture. */
/** 404 unless the backend's lecture state, read with the caller's JWT, is this lecture (someone else's or an unknown id answers 200 with no body). */
export async function checkOwnedLecture(authorization: string, lectureId: string, signal: AbortSignal) {
  const origin = restOrigin();
  if (!origin) throw new InsightRequestError("SERVICE_UNAVAILABLE", 503);
  const response = await fetch(`${origin}/api/instructor/lectures/${lectureId}/state`, { headers: { Authorization: authorization }, cache: "no-store", redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  if (!response.ok) throw response.status < 500 ? new InsightRequestError("NOT_FOUND", 404) : new InsightRequestError("SOURCE_UNAVAILABLE", 502);
  const state = await boundedJson(response.body, 64 * 1024).catch(() => null) as { id?: unknown } | null;
  if (typeof state?.id !== "string" || state.id.toLowerCase() !== lectureId) throw new InsightRequestError("NOT_FOUND", 404);
}
