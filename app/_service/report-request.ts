import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after } from "next/server";
import { boundedJson, insightOwner, insightStorage, InsightRequestError, oneRenderAtATime, readOwnedInsightSource, renderMaterialSlides, runningAnalyses, STALE_RUN_MS } from "./insight-request.ts";
import { analyzeInsight, type InsightAi } from "./insight-ai.ts";
import { redactInsightText } from "./insight-redaction.ts";
import { restOrigin } from "../_infrastructure/server/rest-origin.ts";
import { CHAT_QUESTIONS_PER_REPORT, draftReport, REDRAFTS_PER_REPORT, reportMetrics, type ReportDocument, type ReportMessage, type ReportStatus, type ReportView } from "../_model/report.ts";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Db = ReturnType<typeof insightStorage>;
type Source = Awaited<ReturnType<typeof readOwnedInsightSource>>;
type Material = Source["materials"][number];
export type ReportRow = { id: string; material_id: string; title: string; file_name: string; status: ReportStatus; error: string | null; created_at: string; updated_at: string;
  drafted_at: string | null; redrafts?: number; document?: ReportDocument | null; previous_document?: ReportDocument | null; messages?: ReportMessage[] };

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
  return { id: row.id, materialId: row.material_id, title: row.title, fileName: row.file_name, status: stale ? "failed" : row.status,
    error: stale ? "ANALYSIS_INTERRUPTED" : row.error, createdAt: row.created_at, updatedAt: row.updated_at, document: row.document ?? null,
    canUndo: row.previous_document != null, messages: messages.filter((item) => !item.cleared),
    // Cleared and pending turns still count: a new conversation must not reset the per-report limit.
    questionsLeft: Math.max(0, CHAT_QUESTIONS_PER_REPORT - messages.filter((item) => item.role === "user").length),
    redraftsLeft: Math.max(0, REDRAFTS_PER_REPORT - (row.redrafts ?? 0)) };
}
/** True while a draft run may still write; a stale one can be redrafted or cancelled. */
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
export async function draftBasis(db: Db, ownerId: string, material: Material) {
  const record = await db.from("lecture_audience_records").select("started_at,ended_at,audience,peak_audience")
    .eq("lecture_id", material.lectureId).eq("owner_id", ownerId).maybeSingle();
  if (record.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  const audience = record.data;
  const metrics = reportMetrics(material, { startedAt: material.startedAt ?? audience?.started_at ?? null, endedAt: material.endedAt ?? audience?.ended_at ?? null },
    audience && { audience: audience.audience, peakAudience: audience.peak_audience });
  const pageOf = new Map(material.slides.map((slide) => [slide.id, slide.pageIndex + 1]));
  const questions = material.questions.map((q) => ({ page: pageOf.get(q.slideId)!, text: redactInsightText(q.text), reactions: q.reactions, status: q.status,
    answers: q.answers.map((answer) => redactInsightText(answer.body)) }));
  return { title: material.title, metrics, questions };
}

/**
 * Runs render → analysis → draft in `after()` for a row the caller already set to `drafting` with `draftedAt`.
 * finish() only writes while that same run is current, so a cancelled or superseded run never overwrites the report.
 */
export function startDraft(db: Db, id: string, draftedAt: string, ai: InsightAi, source: Source, basis: Awaited<ReturnType<typeof draftBasis>>, previous: ReportDocument | null,
  /** The report's redraft count after this run; only a successful AI redraft over a document spends one. */ redrafts?: number) {
  const material = source.materials[0], stop = new AbortController();
  runningAnalyses.set(id, stop);
  after(async () => {
    const finish = (values: Record<string, unknown>) => db.from("instructor_reports").update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", id).eq("status", "drafting").eq("drafted_at", draftedAt);
    try {
      const work = await mkdtemp(path.join(tmpdir(), "report-"));
      try {
        const pages = await oneRenderAtATime(() => { stop.signal.throwIfAborted(); return renderMaterialSlides(material, work, undefined, stop.signal); });
        const analysis = await analyzeInsight(ai, source, material, pages, source.purposes.get(material.folderId ?? "") ?? "", AbortSignal.any([stop.signal, AbortSignal.timeout(280_000)]));
        await finish({ status: "ready", error: null, document: draftReport({ ...basis, analysis }), analysis, previous_document: previous, ...redrafts === undefined ? {} : { redrafts } });
      } finally {
        if (runningAnalyses.get(id) === stop) runningAnalyses.delete(id);
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
