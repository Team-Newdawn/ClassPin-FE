import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET as detail } from "../route";
import { insightFailure, insightOwner, oneRenderAtATime, readOwnedInsightSource, renderMaterialSlides, InsightRequestError } from "../../../../../_service/insight-request.ts";
import { exportInsight, previewInsightExport } from "../../../../../_service/insight-export.ts";
import type { InsightReportView } from "../../../../../_model/insight-report.ts";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const format = new URL(request.url).searchParams.get("format");
    if (!format || !["md", "pdf", "pptx", "docx"].includes(format)) throw new InsightRequestError("INVALID_EXPORT_FORMAT", 400);
    const response = await detail(new Request(request.url.split("?")[0], { headers: request.headers, signal: request.signal }), context);
    if (!response.ok) return response;
    const report = await response.json() as InsightReportView;
    if (report.status !== "confirmed" || !report.body) throw new InsightRequestError("CONFIRMATION_REQUIRED", 409);
    const { authorization } = await insightOwner(request);
    const material = (await readOwnedInsightSource(authorization, report.materialIds, request.signal)).materials[0];
    const work = await mkdtemp(path.join(tmpdir(), "insight-export-"));
    try {
      // Slide images only when the deck still matches the analysis; markdown stays text-only.
      const images = format !== "md" && material.slides.length === report.body.slides.length ? await oneRenderAtATime(() => renderMaterialSlides(material, work)) : [];
      const result = await exportInsight(report.body, format, { title: material.title, fileName: material.fileName, date: report.confirmedAt ?? report.createdAt, images });
      if (new URL(request.url).searchParams.get("preview") === "1") {
        try {
          const preview = await oneRenderAtATime(() => previewInsightExport(result, format, work, request.signal));
          return new Response(preview, { headers: { "Cache-Control": "no-store" } });
        } catch {
          throw new InsightRequestError("EXPORT_PREVIEW_FAILED", 503);
        }
      }
      return new Response(new Uint8Array(result.bytes), { headers: { "Content-Type": result.mime, "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="insight.${format}"` } });
    } finally { await rm(work, { recursive: true, force: true }); }
  } catch (error) { return insightFailure(error); }
}
