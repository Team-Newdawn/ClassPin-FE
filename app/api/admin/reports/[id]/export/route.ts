import { insightFailure, oneRenderAtATime, readOwnedInsightSource, renderMaterialSlides, InsightRequestError } from "../../../../../_service/insight-request.ts";
import { EXPORT_FORMATS, exportFile, ownedReport } from "../../../../../_service/report-request.ts";
import { exportReport } from "../../../../../_service/report-export.ts";
import type { ReportDocument } from "../../../../../_model/report.ts";

export const runtime = "nodejs";
export const maxDuration = 300;
/** RPT-060..064: exports the saved document; the editor saves pending edits before calling this. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const format = new URL(request.url).searchParams.get("format");
    if (!format || !EXPORT_FORMATS.includes(format)) throw new InsightRequestError("INVALID_EXPORT_FORMAT", 400);
    const { row, ownerId, authorization } = await ownedReport(request, (await context.params).id);
    const document = row.document as ReportDocument | null;
    if (row.status !== "ready" || !document) throw new InsightRequestError("REPORT_NOT_READY", 409);
    return await exportFile(request, ownerId, format, async (work, signal) => {
      // Only the slides the sections attach; markdown stays text-only and never reads the deck.
      const pages = format === "md" ? [] : [...new Set(document.sections.flatMap((section) => section.slide ?? []))];
      const material = pages.length ? (await readOwnedInsightSource(authorization, [row.material_id], signal)).materials[0] : null;
      // Slide numbers point into the deck the draft counted; a deck changed since then exports without images.
      // A closed or replaced request leaves the queue without rendering, or kills its poppler processes mid-render.
      const images = material && material.slides.length === document.metrics.slides
        ? await oneRenderAtATime(() => { signal.throwIfAborted(); return renderMaterialSlides(material, work, pages, signal); }) : [];
      return exportReport(document, format, { fileName: row.file_name, images });
    });
  } catch (error) { return insightFailure(error); }
}
