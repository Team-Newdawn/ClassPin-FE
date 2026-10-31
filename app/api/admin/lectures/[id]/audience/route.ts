import { boundedJson, insightFailure, insightOwner, insightStorage, InsightRequestError } from "../../../../../_service/insight-request.ts";
import { checkOwnedLecture } from "../../../../../_service/report-request.ts";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 100_000;
const date = (value: unknown) => value === null || (typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value)));
const slide = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 1000;
const at = (value: unknown) => value !== null && date(value);
const list = (value: unknown, max: number, valid: (item: Record<string, unknown>) => boolean) =>
  Array.isArray(value) && value.length <= max && value.every((item) => item !== null && typeof item === "object" && valid(item));

/** RPT-071/DSH-011: the player's tab count and timeline, flushed while LIVE (`endedAt` null) and at lecture end. The last LIVE run overwrites the previous one. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { ownerId, authorization } = await insightOwner(request);
    const id = (await context.params).id.toLowerCase();
    if (!uuid.test(id)) throw new InsightRequestError("NOT_FOUND", 404);
    const body = await boundedJson(request.body, 400_000) as { audience?: unknown; peakAudience?: unknown; startedAt?: unknown; endedAt?: unknown; samples?: unknown; slideChanges?: unknown };
    if (!count(body?.audience) || !count(body.peakAudience) || !date(body.startedAt) || !date(body.endedAt)
      || !list(body.samples, 1440, (item) => at(item.at) && count(item.audience) && slide(item.slide))
      || !list(body.slideChanges, 5000, (item) => at(item.at) && slide(item.slide))) throw new InsightRequestError("INVALID_REQUEST", 400);
    await checkOwnedLecture(authorization, id, request.signal);
    const iso = (value: unknown) => value === null ? null : new Date(value as string).toISOString();
    const result = await insightStorage().from("lecture_audience_records").upsert({ lecture_id: id, owner_id: ownerId, audience: body.audience, peak_audience: body.peakAudience,
      started_at: iso(body.startedAt), ended_at: iso(body.endedAt),
      samples: (body.samples as Record<string, unknown>[]).map((item) => ({ at: iso(item.at), audience: item.audience, slide: item.slide })),
      slide_changes: (body.slideChanges as Record<string, unknown>[]).map((item) => ({ at: iso(item.at), slide: item.slide })), recorded_at: new Date().toISOString() }, { onConflict: "lecture_id" });
    if (result.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return insightFailure(error); }
}
