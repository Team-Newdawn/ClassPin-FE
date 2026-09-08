import { createHash, randomUUID } from "node:crypto";
import { normalizeAiReportMaterialIds } from "@/app/_model/ai-report";
import { AdminApiError, adminApiErrorResponse, readSmallJsonBody, requireAdminRequest } from "@/app/_infrastructure/server/admin-api";
import { aiReportModelFingerprint, getAiReportRuntimeConfig } from "@/app/_infrastructure/server/ai-report-config";
import { verifyAiReportQuote } from "@/app/_infrastructure/server/ai-report-quote";
import { assertAiReportDispatchConfigured, enqueueAiReportJob } from "@/app/_infrastructure/server/cloud-tasks";
import { getSupabaseServiceClient } from "@/app/_infrastructure/supabase/server";
import { inspectAiReportSelection } from "@/app/_service/ai-report-server-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminRequest(request);
    const body = await readSmallJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AdminApiError(400, "INVALID_REQUEST");
    const values = body as Record<string, unknown>;
    if (typeof values.quote !== "string" || typeof values.idempotencyKey !== "string" || !IDEMPOTENCY_PATTERN.test(values.idempotencyKey)) {
      throw new AdminApiError(400, "INVALID_REQUEST");
    }

    const config = getAiReportRuntimeConfig();
    assertAiReportDispatchConfigured(config.providerMode);
    const quote = verifyAiReportQuote(values.quote, config.quoteHmacKey);
    if (!quote || quote.ownerId !== user.id) throw new AdminApiError(409, "AI_REPORT_QUOTE_EXPIRED");
    if (quote.estimatedCostMaxUsd > config.confirmationThresholdUsd && values.confirmedCost !== true) {
      throw new AdminApiError(409, "AI_REPORT_COST_CONFIRMATION_REQUIRED");
    }
    const materialIds = normalizeAiReportMaterialIds(quote.materialIds);
    const service = getSupabaseServiceClient();
    if (!service) throw new AdminApiError(503, "AI_REPORT_SERVER_NOT_CONFIGURED");
    const selection = await inspectAiReportSelection(
      service,
      user.id,
      materialIds,
      quote.selectionKind,
      quote.folderId,
    );
    if (selection.sourceFingerprint !== quote.sourceFingerprint
      || selection.slideCount !== quote.slideCount
      || selection.questionCount !== quote.questionCount) {
      throw new AdminApiError(409, "AI_REPORT_SOURCE_CHANGED");
    }

    const requestHash = createHash("sha256").update(JSON.stringify({
      ownerId: user.id,
      materialIds,
      sourceFingerprint: selection.sourceFingerprint,
      pricingAt: quote.pricingAt,
      estimatedCostMaxUsd: quote.estimatedCostMaxUsd,
    }), "utf8").digest("hex");
    const { data, error } = await service.rpc("create_ai_report_snapshot", {
      target_owner_id: user.id,
      target_selection_kind: quote.selectionKind,
      target_folder_id: quote.folderId,
      target_material_ids: materialIds,
      target_expected_source_fingerprint: quote.sourceFingerprint,
      target_idempotency_key: values.idempotencyKey || randomUUID(),
      target_request_hash: requestHash,
      target_model_fingerprint: aiReportModelFingerprint(config),
      target_prompt_version: "ai-report-prompts.v1",
      target_schema_version: "ai-report-canonical.v1",
      target_pricing_at: quote.pricingAt,
      target_estimated_cost_min_usd: quote.estimatedCostMinUsd,
      target_estimated_cost_max_usd: quote.estimatedCostMaxUsd,
    });
    if (error?.code === "40001") throw new AdminApiError(409, "AI_REPORT_SOURCE_CHANGED");
    if (error || !data || typeof data !== "object") throw new AdminApiError(503, "AI_REPORT_CREATE_FAILED", true);
    const result = data as { reportId?: string; jobId?: string; reused?: boolean };
    if (!result.reportId || !result.jobId) throw new AdminApiError(503, "AI_REPORT_CREATE_FAILED", true);
    try {
      await enqueueAiReportJob(result.jobId, config.providerMode);
    } catch {
      // DB가 권위 원본이다. reconcile 작업이 enqueue 누락을 복구하므로 report/job은 유지한다.
    }
    return Response.json({ reportId: result.reportId, jobId: result.jobId, reused: Boolean(result.reused) }, { status: 202 });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const { client, user } = await requireAdminRequest(request);
    const { data, error } = await client.from("ai_reports")
      .select("id, folder_id, status, progress_completed, progress_total, material_count, slide_count, question_count, estimated_cost_max_usd, actual_cost_usd, safe_error_code, created_at, updated_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(20);
    if (error) throw new AdminApiError(503, "AI_REPORT_LIST_FAILED", true);
    return Response.json({ reports: data ?? [] });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
