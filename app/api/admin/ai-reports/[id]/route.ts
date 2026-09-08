import { aiReportProductStatus, type AiReportStatus } from "@/app/_model/ai-report";
import type { ReportCategoryPin } from "@/app/_model/ai-report-categories";
import { AdminApiError, adminApiErrorResponse, requireAdminRequest } from "@/app/_infrastructure/server/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client, user } = await requireAdminRequest(request);
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) throw new AdminApiError(400, "INVALID_REPORT_ID");
    const { data: report, error } = await client.from("ai_reports")
      .select("id, selection_kind, folder_id, folder_name_snapshot, cutoff_at, status, progress_completed, progress_total, material_count, slide_count, question_count, source_fingerprint, estimated_cost_min_usd, estimated_cost_max_usd, actual_cost_usd, canonical_result, current_revision_id, confirmed_revision_id, safe_error_code, created_at, updated_at")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) throw new AdminApiError(503, "AI_REPORT_READ_FAILED", true);
    if (!report) throw new AdminApiError(404, "AI_REPORT_NOT_FOUND");
    const etag = `W/\"${report.id}:${report.updated_at}\"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });

    const [{ data: materials, error: materialsError }, { data: revisions, error: revisionsError }] = await Promise.all([
      client.from("ai_report_materials")
        .select("material_alias, ordinal, title_snapshot")
        .eq("report_id", id)
        .order("ordinal", { ascending: true }),
      client.from("ai_report_revisions")
        .select("id, revision_no, kind, target_section, instruction_redacted, status, display_result, selected_claim_ids, safe_error_code, created_at")
        .eq("report_id", id)
        .order("revision_no", { ascending: false }),
    ]);
    if (materialsError || revisionsError) throw new AdminApiError(503, "AI_REPORT_READ_FAILED", true);
    const categoryPins: ReportCategoryPin[] = [];
    if (["ready", "confirmed"].includes(report.status)) {
      const { data: slides, error: slidesError } = await client.from("ai_report_slides")
        .select("slide_alias, page_index, analysis_result, ai_report_materials!inner(material_alias)")
        .eq("report_id", id).order("page_index");
      if (slidesError) throw new AdminApiError(503, "AI_REPORT_READ_FAILED", true);
      for (const slide of slides ?? []) {
        const relation = slide.ai_report_materials as unknown as { material_alias: string } | { material_alias: string }[];
        const material = Array.isArray(relation) ? relation[0] : relation;
        const analysis = slide.analysis_result as { pinMappings?: unknown } | null;
        if (!material || !Array.isArray(analysis?.pinMappings)) continue;
        for (const raw of analysis.pinMappings) {
          if (!raw || typeof raw !== "object" || typeof raw.questionAlias !== "string" || !/^Q[0-9]{3}$/.test(raw.questionAlias)) continue;
          categoryPins.push({ evidenceRef: `${material.material_alias}/${slide.slide_alias}/${raw.questionAlias}`, category: typeof raw.category === "string" ? raw.category : "other", text: typeof raw.text === "string" ? raw.text : "", page: slide.page_index + 1 });
        }
      }
    }
    return Response.json({
      ...report,
      product_status: aiReportProductStatus(report.status as AiReportStatus),
      materials: materials ?? [],
      revisions: revisions ?? [],
      category_pins: categoryPins,
    }, { headers: { etag, "cache-control": "private, no-store" } });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
