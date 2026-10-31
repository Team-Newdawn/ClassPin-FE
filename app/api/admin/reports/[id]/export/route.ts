import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { insightFailure, oneRenderAtATime, readOwnedInsightSource, renderMaterialSlides, InsightRequestError } from "../../../../../_service/insight-request.ts";
import { ownedReport } from "../../../../../_service/report-request.ts";
import { exportReport, previewReportExport } from "../../../../../_service/report-export.ts";
import type { ReportDocument } from "../../../../../_model/report.ts";

export const runtime = "nodejs";
export const maxDuration = 300;
// ponytail: in-memory, one server. Move to a DB lock if the app runs on more than one server.
const exportsByOwner = new Map<string, AbortController>();
/** RPT-060..064: exports the saved document; the editor saves pending edits before calling this. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(request.url), format = url.searchParams.get("format");
    if (!format || !["md", "pdf", "pptx", "docx"].includes(format)) throw new InsightRequestError("INVALID_EXPORT_FORMAT", 400);
    const { row, ownerId, authorization } = await ownedReport(request, (await context.params).id);
    const document = row.document as ReportDocument | null;
    if (row.status !== "ready" || !document) throw new InsightRequestError("REPORT_NOT_READY", 409);
    // One export per instructor: a newer request (another click, a format switch) stops the older one, so repeated
    // clicks cannot fill the server-wide render queue. `next dev` has no limit.
    const mine = new AbortController(), signal = AbortSignal.any([request.signal, mine.signal]);
    if (process.env.NODE_ENV !== "development") { exportsByOwner.get(ownerId)?.abort(); exportsByOwner.set(ownerId, mine); }
    const work = await mkdtemp(path.join(tmpdir(), "report-export-"));
    try {
      // Only the slides the sections attach; markdown stays text-only and never reads the deck.
      const pages = format === "md" ? [] : [...new Set(document.sections.flatMap((section) => section.slide ?? []))];
      const material = pages.length ? (await readOwnedInsightSource(authorization, [row.material_id], signal)).materials[0] : null;
      // Slide numbers point into the deck the draft counted; a deck changed since then exports without images.
      // A closed or replaced request leaves the queue without rendering, or kills its poppler processes mid-render.
      const images = material && material.slides.length === document.metrics.slides
        ? await oneRenderAtATime(() => { signal.throwIfAborted(); return renderMaterialSlides(material, work, pages, signal); }) : [];
      const result = await exportReport(document, format, { fileName: row.file_name, images });
      if (url.searchParams.get("preview") === "1") {
        try {
          const preview = await oneRenderAtATime(() => { signal.throwIfAborted(); return previewReportExport(result, format, work, signal); });
          return new Response(preview, { headers: { "Cache-Control": "no-store" } });
        } catch {
          throw new InsightRequestError("EXPORT_PREVIEW_FAILED", 503);
        }
      }
      return new Response(new Uint8Array(result.bytes), { headers: { "Content-Type": result.mime, "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="report.${format}"` } });
    } finally {
      if (exportsByOwner.get(ownerId) === mine) exportsByOwner.delete(ownerId);
      await rm(work, { recursive: true, force: true });
    }
  } catch (error) { return insightFailure(error); }
}
