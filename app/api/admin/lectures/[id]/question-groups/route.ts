import { boundedJson, insightFailure, insightOwner, insightResponse, insightStorage, InsightRequestError } from "../../../../../_service/insight-request.ts";
import { checkOwnedLecture } from "../../../../../_service/report-request.ts";
import { groupQuestions, insightAi } from "../../../../../_service/insight-ai.ts";
import { restOrigin } from "../../../../../_infrastructure/server/rest-origin.ts";

export const runtime = "nodejs";
export const maxDuration = 120;
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Groups = Awaited<ReturnType<typeof groupQuestions>>;
// ponytail: in-memory, one server. Two tabs opening the same dashboard share one AI call; move to a DB lock on more servers.
const running = new Map<string, Promise<Groups>>();

/**
 * DSH-034: question types for a lecture without a report. The stored groups are returned while the lecture's question set is
 * unchanged; otherwise the AI groups the current questions once and the result replaces the stored one.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { ownerId, authorization } = await insightOwner(request);
    const id = (await context.params).id.toLowerCase();
    if (!uuid.test(id)) throw new InsightRequestError("NOT_FOUND", 404);
    await checkOwnedLecture(authorization, id, request.signal);
    const origin = restOrigin();
    if (!origin) throw new InsightRequestError("SERVICE_UNAVAILABLE", 503);
    const response = await fetch(`${origin}/api/instructor/lectures/${id}/questions`, { headers: { Authorization: authorization }, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]) });
    if (!response.ok) throw new InsightRequestError("SOURCE_UNAVAILABLE", 502);
    const rows = await boundedJson(response.body, 8 * 1024 * 1024) as { id?: unknown; raw_text?: unknown }[] | null;
    const questions = (Array.isArray(rows) ? rows : []).flatMap((row) => typeof row?.id === "string" && typeof row.raw_text === "string" ? [{ id: row.id, text: row.raw_text }] : []);
    const ids = questions.map((question) => question.id).sort();

    const db = insightStorage();
    const stored = await db.from("lecture_question_groups").select("question_ids, groups").eq("lecture_id", id).eq("owner_id", ownerId).maybeSingle();
    if (stored.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
    if (stored.data && JSON.stringify(stored.data.question_ids) === JSON.stringify(ids)) return insightResponse({ groups: stored.data.groups });
    if (!questions.length) return insightResponse({ groups: [] });
    const ai = insightAi();
    if (!ai) throw new InsightRequestError("ANALYSIS_NOT_CONFIGURED", 503);

    // Not tied to this request: a closed tab still stores the result for the next visit.
    let run = running.get(id);
    if (!run) {
      run = groupQuestions(ai, questions, AbortSignal.timeout(90_000)).then(async (groups) => {
        const saved = await db.from("lecture_question_groups").upsert({ lecture_id: id, owner_id: ownerId, question_ids: ids, groups,
          provider: ai.name, model: ai.model(), created_at: new Date().toISOString() }, { onConflict: "lecture_id" });
        if (saved.error) throw new InsightRequestError("REPORT_STORAGE_UNAVAILABLE", 503);
        return groups;
      }).finally(() => running.delete(id));
      running.set(id, run);
    }
    return insightResponse({ groups: await run });
  } catch (error) {
    // Provider errors are plain `Error("AI_…")` codes, as in report drafts; the screen shows one message for all of them.
    return insightFailure(error instanceof Error && !(error instanceof InsightRequestError) && /^AI_[A-Z_]+$/.test(error.message)
      ? new InsightRequestError("ANALYSIS_FAILED", 502) : error);
  }
}
