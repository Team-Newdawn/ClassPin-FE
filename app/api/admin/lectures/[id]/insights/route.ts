import { insightFailure, insightOwner, insightResponse, insightStorage, InsightRequestError } from "../../../../../_service/insight-request.ts";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** DSH-021: the lecture's audience record, filtered by the caller's owner_id (no REST graph read). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { ownerId } = await insightOwner(request);
    const id = (await context.params).id.toLowerCase();
    if (!uuid.test(id)) throw new InsightRequestError("NOT_FOUND", 404);
    const db = insightStorage();
    const audience = await db.from("lecture_audience_records").select("started_at, ended_at, audience, peak_audience").eq("lecture_id", id).eq("owner_id", ownerId).maybeSingle();
    if (audience.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    const row = audience.data;
    return insightResponse({
      record: row && { startedAt: row.started_at, endedAt: row.ended_at, audience: row.audience, peakAudience: row.peak_audience },
    });
  } catch (error) { return insightFailure(error); }
}
