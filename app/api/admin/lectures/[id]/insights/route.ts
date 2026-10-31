import type { InsightReportBody } from "../../../../../_model/insight-report.ts";
import { insightFailure, insightOwner, insightResponse, insightStorage, InsightRequestError } from "../../../../../_service/insight-request.ts";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** DSH-021: the lecture's audience timeline and the report's topic groups, both filtered by the caller's owner_id (no REST graph read). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { ownerId } = await insightOwner(request);
    const id = (await context.params).id.toLowerCase();
    if (!uuid.test(id)) throw new InsightRequestError("NOT_FOUND", 404);
    const db = insightStorage();
    const [audience, report] = await Promise.all([
      db.from("lecture_audience_records").select("started_at, ended_at, audience, peak_audience, samples, slide_changes").eq("lecture_id", id).eq("owner_id", ownerId).maybeSingle(),
      db.from("instructor_reports").select("id, analysis").eq("lecture_id", id).eq("owner_id", ownerId).order("updated_at", { ascending: false }).limit(1).maybeSingle()]);
    if (audience.error || report.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    const row = audience.data, groups = (report.data?.analysis as InsightReportBody | null)?.groups;
    return insightResponse({
      record: row && { startedAt: row.started_at, endedAt: row.ended_at, audience: row.audience, peakAudience: row.peak_audience, samples: row.samples, slideChanges: row.slide_changes },
      topics: Array.isArray(groups) ? groups.map(({ title, summary, questionIds }) => ({ title, summary, questionIds })) : null,
      reportId: report.data?.id ?? null,
    });
  } catch (error) { return insightFailure(error); }
}
