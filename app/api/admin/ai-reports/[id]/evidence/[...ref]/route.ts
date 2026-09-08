import { AdminApiError, adminApiErrorResponse, requireAdminRequest } from "@/app/_infrastructure/server/admin-api";
import { getSupabaseServiceClient } from "@/app/_infrastructure/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MATERIAL = /^M[0-9]{3}$/;
const SLIDE = /^S[0-9]{3}$/;
const TARGET = /^(?:R|Q)[0-9]{3}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; ref: string[] }> }) {
  try {
    const { client, user } = await requireAdminRequest(request);
    const { id, ref } = await params;
    if (!UUID.test(id) || ref.length !== 3 || !MATERIAL.test(ref[0]) || !SLIDE.test(ref[1]) || !TARGET.test(ref[2])) {
      throw new AdminApiError(400, "INVALID_EVIDENCE_REF");
    }
    const { data: report, error: reportError } = await client.from("ai_reports").select("id, status").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (reportError) throw new AdminApiError(503, "AI_REPORT_READ_FAILED", true);
    if (!report || !["ready", "confirmed"].includes(report.status)) throw new AdminApiError(404, "AI_REPORT_EVIDENCE_NOT_FOUND");

    const { data: slide, error: slideError } = await client.from("ai_report_slides")
      .select("slide_alias, page_index, evidence_prefix, analysis_result, ai_report_materials!inner(material_alias, title_snapshot)")
      .eq("report_id", id).eq("slide_alias", ref[1]).eq("ai_report_materials.material_alias", ref[0]).maybeSingle();
    if (slideError) throw new AdminApiError(503, "AI_REPORT_READ_FAILED", true);
    if (!slide?.evidence_prefix) throw new AdminApiError(404, "AI_REPORT_EVIDENCE_NOT_FOUND");
    const materialRelation = slide.ai_report_materials as unknown as { material_alias: string; title_snapshot: string } | Array<{ material_alias: string; title_snapshot: string }>;
    const material = Array.isArray(materialRelation) ? materialRelation[0] : materialRelation;
    if (!material) throw new AdminApiError(404, "AI_REPORT_EVIDENCE_NOT_FOUND");
    const analysis = object(slide.analysis_result);
    const regions = Array.isArray(analysis?.regions) ? analysis.regions.map(object).filter(Boolean) as Array<Record<string, unknown>> : [];
    const pins = Array.isArray(analysis?.pinMappings) ? analysis.pinMappings.map(object).filter(Boolean) as Array<Record<string, unknown>> : [];
    const target = ref[2];
    const rawRegion = regions.find((item) => item.alias === target) ?? null;
    const rawPin = pins.find((item) => item.questionAlias === target) ?? null;
    if (!rawRegion && !rawPin) throw new AdminApiError(404, "AI_REPORT_EVIDENCE_NOT_FOUND");
    const relatedRegion = rawRegion ?? regions.find((item) => item.alias === rawPin?.regionAlias) ?? null;

    const service = getSupabaseServiceClient();
    if (!service) throw new AdminApiError(503, "AI_REPORT_SERVER_NOT_CONFIGURED");
    const { data: signed, error: signedError } = await service.storage.from("ai-report-evidence").createSignedUrl(`${slide.evidence_prefix}/redacted.png`, 300);
    if (signedError || !signed?.signedUrl) throw new AdminApiError(503, "AI_REPORT_EVIDENCE_READ_FAILED", true);
    const bbox = object(relatedRegion?.bboxNorm);
    return Response.json({
      evidenceRef: ref.join("/"), materialAlias: material.material_alias, materialTitle: material.title_snapshot,
      slideAlias: slide.slide_alias, slideNumber: slide.page_index + 1, imageUrl: signed.signedUrl,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      region: relatedRegion && bbox ? { alias: String(relatedRegion.alias), type: String(relatedRegion.type ?? "other"), summary: String(relatedRegion.summary ?? ""), bboxNorm: { x1: Number(bbox.x1), y1: Number(bbox.y1), x2: Number(bbox.x2), y2: Number(bbox.y2) } } : null,
      pin: rawPin ? {
        questionAlias: String(rawPin.questionAlias), text: String(rawPin.text ?? ""), category: String(rawPin.category ?? ""),
        status: String(rawPin.status ?? ""), reactionCount: Number(rawPin.reactionCount ?? 0),
        regionAlias: typeof rawPin.regionAlias === "string" ? rawPin.regionAlias : null,
        mappingStatus: String(rawPin.mappingStatus ?? "no-coordinate"), anchor: rawPin.anchor ?? null,
        answers: Array.isArray(rawPin.answers) ? rawPin.answers.flatMap((answer) => { const value = object(answer); return value ? [{ body: String(value.body ?? "") }] : []; }) : [],
      } : null,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
