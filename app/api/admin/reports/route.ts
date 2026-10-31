import { boundedJson, insightFailure, insightOwner, insightResponse, insightStorage, InsightRequestError, readOwnedInsightSource } from "../../../_service/insight-request.ts";
import { checkDailyDrafts, draftBasis, reportView, startDraft, type ReportRow } from "../../../_service/report-request.ts";
import { insightAi } from "../../../_service/insight-ai.ts";
import { draftReport } from "../../../_model/report.ts";

export const runtime = "nodejs";
export const maxDuration = 300;
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SUMMARY = "id,material_id,title,file_name,status,error,created_at,updated_at,drafted_at";

export async function GET(request: Request) {
  try {
    const { ownerId } = await insightOwner(request);
    const { data, error } = await insightStorage().from("instructor_reports").select(SUMMARY).eq("owner_id", ownerId).order("updated_at", { ascending: false }).limit(200);
    if (error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    return insightResponse({ reports: (data as ReportRow[]).map((row) => {
      const { id, materialId, title, fileName, status, error, createdAt, updatedAt } = reportView(row);
      return { id, materialId, title, fileName, status, error, createdAt, updatedAt };
    }) });
  } catch (error) { return insightFailure(error); }
}

/** `{ materialId, metricsOnly? }`: returns the material's report, or creates it and starts its draft (RPT-012/030/033). */
export async function POST(request: Request) {
  try {
    const { ownerId, authorization } = await insightOwner(request);
    const input = await boundedJson(request.body, 4096) as { materialId?: unknown; metricsOnly?: unknown };
    const materialId = typeof input?.materialId === "string" && uuid.test(input.materialId) ? input.materialId.toLowerCase() : null;
    if (!materialId) throw new InsightRequestError("INVALID_REQUEST", 400);
    const db = insightStorage();
    const existing = await db.from("instructor_reports").select("*").eq("owner_id", ownerId).eq("material_id", materialId).maybeSingle();
    if (existing.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    if (existing.data) return insightResponse(reportView(existing.data as ReportRow));
    const metricsOnly = input.metricsOnly === true, ai = metricsOnly ? null : insightAi();
    if (!metricsOnly && !ai) throw new InsightRequestError("ANALYSIS_NOT_CONFIGURED", 503);
    if (ai) await checkDailyDrafts(db, ownerId);
    const source = await readOwnedInsightSource(authorization, [materialId], request.signal), material = source.materials[0];
    if (material.lectureStatus !== "ended") throw new InsightRequestError("LECTURE_NOT_ENDED", 409);
    const basis = await draftBasis(db, ownerId, material), now = new Date().toISOString();
    const inserted = await db.from("instructor_reports").insert({ owner_id: ownerId, material_id: materialId, lecture_id: material.lectureId, title: material.title,
      file_name: material.fileName, created_at: now, updated_at: now,
      ...ai ? { status: "drafting", drafted_at: now } : { status: "ready", document: draftReport({ ...basis, analysis: null }), analysis: null } }).select("*").single();
    if (inserted.error?.code === "23505") {
      // Another tab created it first: show that one.
      const raced = await db.from("instructor_reports").select("*").eq("owner_id", ownerId).eq("material_id", materialId).single();
      if (raced.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
      return insightResponse(reportView(raced.data as ReportRow));
    }
    if (inserted.error || !inserted.data) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    if (ai) startDraft(db, inserted.data.id, now, ai, source, basis, null);
    return insightResponse(reportView(inserted.data as ReportRow), 202);
  } catch (error) { return insightFailure(error); }
}
