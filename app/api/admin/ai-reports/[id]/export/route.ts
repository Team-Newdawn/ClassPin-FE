import { GET as detail } from "../route";
import { insightFailure, InsightRequestError } from "../../../../../_service/insight-request.ts";
import { exportInsight } from "../../../../../_service/insight-export.ts";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const format = new URL(request.url).searchParams.get("format");
    if (!format || !["md", "pdf", "pptx", "docx"].includes(format)) throw new InsightRequestError("INVALID_EXPORT_FORMAT", 400);
    const response = await detail(new Request(request.url.split("?")[0], { headers: request.headers, signal: request.signal }), context);
    if (!response.ok) return response;
    const report = await response.json();
    if (report.status !== "confirmed" || !report.body) throw new InsightRequestError("CONFIRMATION_REQUIRED", 409);
    const result = await exportInsight(report.body, format);
    return new Response(new Uint8Array(result.bytes), { headers: { "Content-Type": result.mime, "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="insight.${format}"` } });
  } catch (error) { return insightFailure(error); }
}
