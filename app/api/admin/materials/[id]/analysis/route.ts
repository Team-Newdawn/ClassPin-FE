import { after } from "next/server";
import { insightFailure, insightOwner, insightResponse, insightStorage, InsightRequestError, readOwnedInsightSource } from "../../../../../_service/insight-request.ts";
import { insightAi } from "../../../../../_service/insight-ai.ts";
import { analysisView, ensureAnalysis, readAnalysis } from "../../../../../_service/material-analysis.ts";

export const runtime = "nodejs";
export const maxDuration = 300;
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const materialId = async (context: { params: Promise<{ id: string }> }) => {
  const id = (await context.params).id.toLowerCase();
  if (!uuid.test(id)) throw new InsightRequestError("NOT_FOUND", 404);
  return id;
};

/**
 * RPT-125: starts the material's shared analysis unless a result made from the same inputs exists or is running here, and
 * answers at once with what is stored; the dashboard then polls `GET`. Only ended lectures are analyzed.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { ownerId, authorization } = await insightOwner(request);
    const id = await materialId(context), ai = insightAi();
    if (!ai) throw new InsightRequestError("ANALYSIS_NOT_CONFIGURED", 503);
    const source = await readOwnedInsightSource(authorization, [id], request.signal), material = source.materials[0];
    if (material.lectureStatus !== "ended") throw new InsightRequestError("LECTURE_NOT_ENDED", 409);
    const { row, run } = await ensureAnalysis(insightStorage(), ai, ownerId, source, material);
    // Not tied to this request: a closed tab still stores the result for the next visit and for reports.
    if (run) after(() => run.settled);
    return insightResponse(analysisView(row));
  } catch (error) { return insightFailure(error); }
}

/** RPT-125: the stored state only (no REST read, no AI), for polling; someone else's material reads as `none`. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { ownerId } = await insightOwner(request);
    return insightResponse(analysisView(await readAnalysis(insightStorage(), ownerId, await materialId(context))));
  } catch (error) { return insightFailure(error); }
}
