import { boundedJson, insightFailure, insightOwner, InsightRequestError } from "../../../../_service/insight-request.ts";
import { EXPORT_FORMATS, exportFile } from "../../../../_service/report-request.ts";
import { exportReport } from "../../../../_service/report-export.ts";
import { parseExportDocument, REPORT_LIMITS } from "../../../../_model/report.ts";

export const runtime = "nodejs";
export const maxDuration = 300;
/** DSH-042: the dashboard sends the sections it shows; the server only lays them out (text only, no slide images). */
export async function POST(request: Request) {
  try {
    const format = new URL(request.url).searchParams.get("format");
    if (!format || !EXPORT_FORMATS.includes(format)) throw new InsightRequestError("INVALID_EXPORT_FORMAT", 400);
    const { ownerId } = await insightOwner(request);
    // Korean text is 3 bytes a character in UTF-8, plus JSON overhead.
    const body = await boundedJson(request.body, REPORT_LIMITS.total * 4) as { document?: unknown; fileName?: unknown } | null;
    let document;
    try { document = parseExportDocument(body?.document); } catch { throw new InsightRequestError("INVALID_DOCUMENT", 400); }
    const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, REPORT_LIMITS.title) : "";
    return await exportFile(request, ownerId, format, () => exportReport(document, format, { fileName, images: [] }));
  } catch (error) { return insightFailure(error); }
}
