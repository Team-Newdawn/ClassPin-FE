import { AdminApiError, adminApiErrorResponse, readSmallJsonBody, requireAdminRequest } from "@/app/_infrastructure/server/admin-api";
import { createLabJob, labJob, labJobs } from "@/app/_infrastructure/server/model-lab-store";
import { LAB_REPORT_ID, labLocalRequest, validLabSelection } from "@/app/_model/model-lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function authorize(request: Request) {
  if (!labLocalRequest(request, process.env.NODE_ENV, process.env.NEXT_PUBLIC_SUPABASE_URL)) throw new AdminApiError(404, "LOCAL_ONLY");
  const context = await requireAdminRequest(request);
  const { data, error } = await context.client.from("ai_reports").select("id").eq("id", LAB_REPORT_ID).eq("owner_id", context.user.id).maybeSingle();
  if (error || !data) throw new AdminApiError(404, "AI_REPORT_NOT_FOUND");
  return context.user.id;
}
const respond = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  try {
    const owner = await authorize(request);
    const id = new URL(request.url).searchParams.get("job");
    return respond(id ? await labJob(id, owner) : { jobs: await labJobs(owner) });
  } catch (error) { return adminApiErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const owner = await authorize(request);
    const body = await readSmallJsonBody(request, 2048) as Record<string, unknown>;
    const mode = body?.mode;
    if (!validLabSelection(body) || !["cached", "fresh"].includes(String(mode))) throw new AdminApiError(400, "INVALID_SELECTION");
    return respond(await createLabJob({ ocr:body.ocr, layout:body.layout, llm:body.llm }, mode as "cached" | "fresh", owner, LAB_REPORT_ID), 202);
  } catch (error) { return adminApiErrorResponse(error); }
}
