import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after } from "next/server";
import { STALE_RUN_MS, runningAnalyses, oneRenderAtATime, boundedJson, insightOwner, readOwnedInsightSource, renderMaterialSlides, insightStorage, insightResponse, insightFailure, reportView, InsightRequestError } from "../../../_service/insight-request.ts";
import { analyzeInsight } from "../../../_service/insight-claude.ts";

export const runtime = "nodejs";
export const maxDuration = 300;
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// ponytail: one flat quota until billing plans exist; two simultaneous starts can both pass the count (3 at most).
// `next dev` (local and dev:remote) has no quota so analysis changes can be retried freely.
const DAILY_ANALYSES = process.env.NODE_ENV === "development" ? Infinity : 2, KST_MS = 9 * 3_600_000, DAY_MS = 86_400_000;

export async function GET(request: Request) {
  try {
    const { ownerId } = await insightOwner(request);
    const { data, error } = await insightStorage().from("ai_insight_reports")
      .select("id,material_id,status,error,created_at").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    return insightResponse({ reports: (data ?? []).map((row) => reportView(row)) });
  } catch (error) { return insightFailure(error); }
}

export async function POST(request: Request) {
  try {
    const { ownerId, authorization } = await insightOwner(request);
    if (!process.env.CLAUDE_API_KEY) throw new InsightRequestError("ANALYSIS_NOT_CONFIGURED", 503);
    const input = await boundedJson(request.body, 4096) as { materialId?: unknown };
    const materialId = typeof input?.materialId === "string" && uuid.test(input.materialId) ? input.materialId.toLowerCase() : null;
    if (!materialId) throw new InsightRequestError("INVALID_REQUEST", 400);
    const db = insightStorage();
    const running = await db.from("ai_insight_reports").select("id,material_id,status,error,created_at").eq("owner_id", ownerId).eq("material_id", materialId)
      .eq("status", "running").gte("created_at", new Date(Date.now() - STALE_RUN_MS).toISOString()).limit(1).maybeSingle();
    if (running.data) return insightResponse(reportView(running.data), 202);
    // Today's runs in Korean time; failed and interrupted runs are not the instructor's fault, so they don't count.
    const today = new Date(Math.floor((Date.now() + KST_MS) / DAY_MS) * DAY_MS - KST_MS).toISOString();
    const used = await db.from("ai_insight_reports").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).gte("created_at", today)
      .or(`status.in.(ready,confirmed),and(status.eq.running,created_at.gte."${new Date(Date.now() - STALE_RUN_MS).toISOString()}")`);
    if (used.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    if ((used.count ?? 0) >= DAILY_ANALYSES) throw new InsightRequestError("DAILY_LIMIT", 429);
    const source = await readOwnedInsightSource(authorization, [materialId], request.signal);
    const material = source.materials[0];
    if (material.lectureStatus !== "ended") throw new InsightRequestError("LECTURE_NOT_ENDED", 409);
    const inserted = await db.from("ai_insight_reports").insert({ owner_id: ownerId, material_id: materialId }).select("id,material_id,status,error,created_at").single();
    if (inserted.error || !inserted.data) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    // A stop request aborts the Claude calls; finish() only writes while the row is still `running`, so a stopped run never turns ready.
    const stop = new AbortController();
    runningAnalyses.set(inserted.data.id, stop);
    after(async () => {
      const finish = (values: Record<string, unknown>) => db.from("ai_insight_reports").update(values).eq("id", inserted.data.id).eq("status", "running");
      try {
        const work = await mkdtemp(path.join(tmpdir(), "insight-"));
        try {
          const pages = await oneRenderAtATime(() => { stop.signal.throwIfAborted(); return renderMaterialSlides(material, work); });
          const body = await analyzeInsight(source, material, pages, source.purposes.get(material.folderId ?? "") ?? "", AbortSignal.any([stop.signal, AbortSignal.timeout(280_000)]));
          await finish({ status: "ready", body });
        } finally { runningAnalyses.delete(inserted.data.id); await rm(work, { recursive: true, force: true }); }
      } catch (error) {
        // Only stable codes are stored; provider messages may echo prompt content.
        const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "ANALYSIS_FAILED";
        await finish({ status: "failed", error: code });
      }
    });
    return insightResponse(reportView(inserted.data), 202);
  } catch (error) { return insightFailure(error); }
}
