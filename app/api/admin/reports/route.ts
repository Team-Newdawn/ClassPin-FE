import { boundedJson, insightFailure, insightOwner, insightResponse, insightStorage, InsightRequestError, readOwnedInsightSource } from "../../../_service/insight-request.ts";
import { checkDailyDrafts, draftBasis, reportView, startDraft, type ReportRow } from "../../../_service/report-request.ts";
import { insightAi } from "../../../_service/insight-ai.ts";
import { draftReport, isReportTemplate, REPORT_REQUEST_MAX } from "../../../_model/report.ts";

export const runtime = "nodejs";
export const maxDuration = 300;
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SUMMARY = "id,material_id,template,title,file_name,status,error,created_at,updated_at,drafted_at";

export async function GET(request: Request) {
  try {
    const { ownerId } = await insightOwner(request);
    const { data, error } = await insightStorage().from("instructor_reports").select(SUMMARY).eq("owner_id", ownerId).order("updated_at", { ascending: false }).limit(200);
    if (error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    return insightResponse({ reports: (data as ReportRow[]).map((row) => {
      const { id, materialId, template, title, fileName, status, error, createdAt, updatedAt } = reportView(row);
      return { id, materialId, template, title, fileName, status, error, createdAt, updatedAt };
    }) });
  } catch (error) { return insightFailure(error); }
}

/** `{ materialId, template?, request?, metricsOnly? }`: creates a report and starts its draft; a material may have several (RPT-001/012/030/033/036). */
export async function POST(request: Request) {
  try {
    const { ownerId, authorization } = await insightOwner(request);
    const input = await boundedJson(request.body, 8192) as { materialId?: unknown; metricsOnly?: unknown; template?: unknown; request?: unknown };
    const materialId = typeof input?.materialId === "string" && uuid.test(input.materialId) ? input.materialId.toLowerCase() : null;
    const template = input?.template === undefined ? null : isReportTemplate(input.template) ? input.template : undefined;
    const extra = input?.request === undefined ? "" : typeof input.request === "string" && input.request.length <= REPORT_REQUEST_MAX ? input.request.trim() : undefined;
    if (!materialId || template === undefined || extra === undefined) throw new InsightRequestError("INVALID_REQUEST", 400);
    const db = insightStorage();
    // RPT-036: "빈 문서에서 시작" never calls the AI, so it needs no key and spends no daily draft.
    const metricsOnly = input.metricsOnly === true || template === "blank", ai = metricsOnly ? null : insightAi();
    if (!metricsOnly && !ai) throw new InsightRequestError("ANALYSIS_NOT_CONFIGURED", 503);
    if (ai) await checkDailyDrafts(db, ownerId);
    const source = await readOwnedInsightSource(authorization, [materialId], request.signal), material = source.materials[0];
    if (material.lectureStatus !== "ended") throw new InsightRequestError("LECTURE_NOT_ENDED", 409);
    const basis = await draftBasis(db, ownerId, material, { template, request: extra || null, folder: source.folderLabels.get(material.folderId ?? "") }), now = new Date().toISOString();
    const inserted = await db.from("instructor_reports").insert({ owner_id: ownerId, material_id: materialId, lecture_id: material.lectureId, title: basis.title,
      template, request: extra || null,
      file_name: material.fileName, created_at: now, updated_at: now,
      ...ai ? { status: "drafting", drafted_at: now } : { status: "ready", document: draftReport({ ...basis, analysis: null }), analysis: null } }).select("*").single();
    if (inserted.error || !inserted.data) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    if (ai) startDraft(db, inserted.data.id, now, ai, source, basis);
    return insightResponse(reportView(inserted.data as ReportRow), 202);
  } catch (error) { return insightFailure(error); }
}
