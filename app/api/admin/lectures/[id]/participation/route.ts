import { insightFailure, insightOwner, insightResponse, insightStorage, InsightRequestError } from "../../../../../_service/insight-request.ts";
import { checkOwnedLecture } from "../../../../../_service/report-request.ts";
import { participationCounts } from "../../../../../_model/insight-dashboard.ts";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PAGE = 1000, MAX_PAGES = 50;

/**
 * DSH-023 step 1. ponytail: reads BE-owned tables with the service role, the one exception to "business data goes through
 * the BE". Delete this route once ClassPin-BE#10 B (`GET /api/instructor/lectures/{id}/participation`) is deployed.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { authorization } = await insightOwner(request);
    const id = (await context.params).id.toLowerCase();
    if (!uuid.test(id)) throw new InsightRequestError("NOT_FOUND", 404);
    await checkOwnedLecture(authorization, id, request.signal);
    const db = insightStorage();
    // PostgREST returns at most 1,000 rows per request, so read in stable-ordered pages.
    const all = async <T,>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
      const rows: T[] = [];
      for (let index = 0; index < MAX_PAGES; index++) {
        const { data, error } = await page(index * PAGE, index * PAGE + PAGE - 1);
        if (error || !data) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
        rows.push(...data);
        if (data.length < PAGE) return rows;
      }
      throw new InsightRequestError("INPUT_LIMIT", 413);
    };
    const [questions, reactions] = await Promise.all([
      all<{ author_id: string | null; region_id: string | null }>((from, to) =>
        db.from("questions").select("author_id, region_id").eq("lecture_id", id).order("id").range(from, to)),
      all<{ reactor_id: string }>((from, to) =>
        db.from("question_reactions").select("reactor_id, questions!inner(lecture_id)").eq("questions.lecture_id", id)
          .order("question_id").order("reactor_id").range(from, to)),
    ]);
    return insightResponse(participationCounts(questions.map((row) => ({ authorId: row.author_id, pinned: row.region_id !== null })),
      reactions.map((row) => row.reactor_id)));
  } catch (error) { return insightFailure(error); }
}
