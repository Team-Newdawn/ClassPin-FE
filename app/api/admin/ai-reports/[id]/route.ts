import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { boundedJson, insightOwner, insightStorage, insightResponse, insightFailure, reportView, readOwnedInsightSource, renderMaterialSlides, runningAnalyses, InsightRequestError } from "../../../../_service/insight-request.ts";
import { chatInsight, viewSlides } from "../../../../_service/insight-claude.ts";
import type { InsightMessage, InsightReportBody } from "../../../../_model/insight-report.ts";

export const runtime = "nodejs";
async function owned(request: Request, id: string) {
  const { ownerId, authorization } = await insightOwner(request);
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new InsightRequestError("NOT_FOUND", 404);
  const db = insightStorage();
  const { data, error } = await db.from("ai_insight_reports").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
  if (!data) throw new InsightRequestError("NOT_FOUND", 404);
  return { db, row: data, authorization };
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { row } = await owned(request, (await context.params).id);
    return insightResponse(reportView(row));
  } catch (error) { return insightFailure(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, { db, row, authorization } = await owned(request, id);
    const body = await boundedJson(request.body, 8192) as { action?: unknown; message?: unknown; slide?: unknown };
    if (body?.action === "confirm") {
      if (row.status === "confirmed") return insightResponse(reportView(row));
      const result = await db.from("ai_insight_reports").update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("id", id).eq("status", "ready").select("*").maybeSingle();
      if (result.error || !result.data) throw new InsightRequestError("REPORT_NOT_READY", 409);
      return insightResponse(reportView(result.data));
    }
    if (body?.action === "cancel") {
      const result = await db.from("ai_insight_reports").update({ status: "failed", error: "ANALYSIS_CANCELLED" })
        .eq("id", id).eq("status", "running").select("*").maybeSingle();
      if (result.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
      runningAnalyses.get(id)?.abort();
      // Already finished or failed: show its current state instead of an error.
      return insightResponse(reportView(result.data ?? row));
    }
    if (body?.action === "reset") {
      // Text is wiped; blank turns stay so a new conversation can't reset the per-report question limit.
      const messages = ((row.messages as InsightMessage[]) ?? []).map(({ role, createdAt }) => ({ role, text: "", createdAt, cleared: true as const }));
      const result = await db.from("ai_insight_reports").update({ messages }).eq("id", id).select("*").single();
      if (result.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
      return insightResponse(reportView(result.data));
    }
    if (body?.action === "chat") {
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 2000) throw new InsightRequestError("INVALID_REQUEST", 400);
      if (!["ready", "confirmed"].includes(row.status)) throw new InsightRequestError("REPORT_NOT_READY", 409);
      if (!process.env.CLAUDE_API_KEY) throw new InsightRequestError("ANALYSIS_NOT_CONFIGURED", 503);
      const history = (row.messages as InsightMessage[]) ?? [];
      // ponytail: flat 5 questions per report until billing plans exist; two tabs sending at once can each pass this check. `next dev` has no limit.
      if (process.env.NODE_ENV !== "development" && history.filter((item) => item.role === "user").length >= 5) throw new InsightRequestError("CHAT_LIMIT", 429);
      const report = row.body as InsightReportBody, stop = new AbortController(), signal = AbortSignal.any([request.signal, stop.signal, AbortSignal.timeout(90_000)]);
      const slide = Number.isInteger(body.slide) && (body.slide as number) >= 1 && (body.slide as number) <= report.slides.length ? body.slide as number : null;
      // The source is read with the instructor's JWT only when the model asks to see slides.
      let material: Promise<Awaited<ReturnType<typeof readOwnedInsightSource>>["materials"][number]> | undefined;
      const view = async (input: unknown) => {
        material ??= readOwnedInsightSource(authorization, [row.material_id], signal).then((source) => source.materials[0]);
        const owned = await material, work = await mkdtemp(path.join(tmpdir(), "insight-chat-"));
        try {
          return await viewSlides(owned, report, (pages) => renderMaterialSlides(owned, work, pages), input);
        } finally { await rm(work, { recursive: true, force: true }); }
      };
      const answer = chatInsight(report, history.filter((item) => !item.cleared), message, slide, view, signal);
      const encoder = new TextEncoder();
      // Text deltas stream as plain text; the turn is saved only once the full answer arrives, otherwise the stream errors.
      return new Response(new ReadableStream({
        async start(controller) {
          try {
            let text = "";
            for await (const delta of answer) { text += delta; controller.enqueue(encoder.encode(delta)); }
            const now = new Date().toISOString();
            const messages: InsightMessage[] = [...history, { role: "user", text: message, createdAt: now }, { role: "assistant", text: text.trim(), createdAt: now }];
            const result = await db.from("ai_insight_reports").update({ messages }).eq("id", id);
            if (result.error) throw new Error("REPORT_STORAGE_UNAVAILABLE");
            controller.close();
          } catch (error) { if (!stop.signal.aborted) controller.error(error); } // a cancelled stream is already closed
        },
        cancel() { stop.abort(); },
      }), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
    }
    throw new InsightRequestError("INVALID_REQUEST", 400);
  } catch (error) { return insightFailure(error); }
}
