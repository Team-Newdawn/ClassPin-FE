import { aiReportSelectionKind, normalizeAiReportMaterialIds } from "@/app/_model/ai-report";
import { AdminApiError, adminApiErrorResponse, readSmallJsonBody, requireAdminRequest } from "@/app/_infrastructure/server/admin-api";
import { aiReportModelFingerprint, getAiReportRuntimeConfig } from "@/app/_infrastructure/server/ai-report-config";
import { signAiReportQuote, type AiReportQuotePayload } from "@/app/_infrastructure/server/ai-report-quote";
import { getSupabaseServiceClient } from "@/app/_infrastructure/supabase/server";
import { inspectAiReportSelection } from "@/app/_service/ai-report-server-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminRequest(request);
    const body = await readSmallJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AdminApiError(400, "INVALID_REQUEST");
    const values = body as Record<string, unknown>;
    const materialIds = normalizeAiReportMaterialIds(values.materialIds);
    const folderSelected = values.selectionKind === "folder";
    const selectionKind = aiReportSelectionKind(materialIds.length, folderSelected);
    const folderId = typeof values.folderId === "string" ? values.folderId : null;
    if (selectionKind === "folder" && !folderId) throw new AdminApiError(400, "FOLDER_REQUIRED");

    const config = getAiReportRuntimeConfig();
    const service = getSupabaseServiceClient();
    if (!service) throw new AdminApiError(503, "AI_REPORT_SERVER_NOT_CONFIGURED");
    const selection = await inspectAiReportSelection(service, user.id, materialIds, selectionKind, folderId);
    const estimatedCostMinUsd = Number((selection.slideCount * config.estimatedCostPerSlideUsd).toFixed(6));
    const estimatedCostMaxUsd = Number((estimatedCostMinUsd * 3).toFixed(6));
    if (estimatedCostMaxUsd > config.hardCapUsd) throw new AdminApiError(422, "AI_REPORT_HARD_COST_CAP");
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const quotePayload: AiReportQuotePayload = {
      version: "ai-report-quote.v1",
      ownerId: user.id,
      selectionKind,
      folderId,
      materialIds,
      materialCount: selection.materialCount,
      slideCount: selection.slideCount,
      questionCount: selection.questionCount,
      sourceFingerprint: selection.sourceFingerprint,
      pricingAt: config.pricingAt,
      estimatedCostMinUsd,
      estimatedCostMaxUsd,
      expiresAt,
    };
    return Response.json({
      ...quotePayload,
      modelFingerprint: aiReportModelFingerprint(config),
      requiresCostConfirmation: estimatedCostMaxUsd > config.confirmationThresholdUsd,
      quote: signAiReportQuote(quotePayload, config.quoteHmacKey),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
