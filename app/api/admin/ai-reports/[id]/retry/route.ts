import { createHash } from "node:crypto";
import { getAiReportRuntimeConfig } from "@/app/_infrastructure/server/ai-report-config";
import { AdminApiError, adminApiErrorResponse, readSmallJsonBody, requireAdminRequest } from "@/app/_infrastructure/server/admin-api";
import { assertAiReportDispatchConfigured, enqueueAiReportJob } from "@/app/_infrastructure/server/cloud-tasks";
import { getSupabaseServiceClient } from "@/app/_infrastructure/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY = /^[A-Za-z0-9_-]{16,200}$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client, user } = await requireAdminRequest(request);
    const { id } = await params;
    const body = await readSmallJsonBody(request);
    const idempotencyKey = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).idempotencyKey : null;
    if (!UUID.test(id) || typeof idempotencyKey !== "string" || !IDEMPOTENCY.test(idempotencyKey)) throw new AdminApiError(400, "INVALID_REQUEST");
    const { data: report, error: reportError } = await client.from("ai_reports").select("id, source_fingerprint, model_fingerprint, status").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (reportError) throw new AdminApiError(503, "AI_REPORT_READ_FAILED", true);
    if (!report) throw new AdminApiError(404, "AI_REPORT_NOT_FOUND");
    if (report.status !== "failed") throw new AdminApiError(409, "AI_REPORT_NOT_RETRYABLE");
    const config = getAiReportRuntimeConfig();
    assertAiReportDispatchConfigured(config.providerMode);
    const service = getSupabaseServiceClient();
    if (!service) throw new AdminApiError(503, "AI_REPORT_SERVER_NOT_CONFIGURED");
    const requestHash = createHash("sha256").update(`${id}|${report.source_fingerprint}|${report.model_fingerprint}`).digest("hex");
    const { data, error } = await service.rpc("retry_ai_report", { target_report_id: id, target_owner_id: user.id, target_idempotency_key: idempotencyKey, target_request_hash: requestHash });
    if (error || !data || typeof data !== "object") throw new AdminApiError(503, "AI_REPORT_RETRY_FAILED", true);
    const result = data as { reportId?: string; jobId?: string; stage?: "prepare" | "synthesize"; reused?: boolean };
    if (!result.reportId || !result.jobId || !result.stage) throw new AdminApiError(503, "AI_REPORT_RETRY_FAILED", true);
    try { await enqueueAiReportJob(result.jobId, config.providerMode, result.stage); } catch { /* reconcile recovers enqueue gaps */ }
    return Response.json({ reportId: result.reportId, jobId: result.jobId, reused: Boolean(result.reused) }, { status: 202 });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
