/** Keep one entry per slide without losing distinct AI explanations or changing rank. */
export function normalizeInsightReport(body: InsightReportBody): InsightReportBody {
  const reasons = new Map<number, Set<string>>();
  for (const item of body.overall.hotspots) {
    const own = reasons.get(item.page) ?? new Set<string>();
    if (item.reason) own.add(item.reason);
    reasons.set(item.page, own);
  }
  return { ...body, overall: { ...body.overall,
    hotspots: [...reasons].slice(0, 5).map(([page, own]) => ({ page, reason: [...own].join("\n") })) } };
}

export type InsightMetrics = { questions: number; positioned: number; unanswered: number; answered: number; resolved: number; reactions: number; answers: number };
export type InsightReportBody = {
  schemaVersion: 2;
  /** AI provider (`claude` | `openai` | `gemini`); absent on reports made before it was recorded, which were all Claude. */
  provider?: string;
  model: string;
  /** AI-judged material kind (e.g. "투자 설명회"); absent on reports made before it existed. */
  category?: string;
  /** Prompt line for the instructor-chosen folder purpose; absent for unfiled materials and older reports. */
  purpose?: string;
  /** Slides whose analysis call failed; the rest of the report is still valid. */
  failedPages?: number[];
  /** Deck order (1-based). `topic` may be empty for appended image slides that are not in the PDF. */
  slides: { page: number; topic: string; /** Plain summary of a slide without questions. */ content?: string; questionSummary: string; suggestion: string; /** Absent on reports generated before slide issues were added. */ issues?: { title: string; summary: string; questionIds: string[] }[]; metrics: InsightMetrics }[];
  questions: { id: string; page: number; text: string; answers: string[]; reactions: number; status: string }[];
  overall: { summary: string; hotspots: { page: number; reason: string }[]; suggestions: string[] };
  groups: { title: string; summary: string; questionIds: string[] }[];
};
/** `cleared` turns were wiped by "새 대화"; their text is gone and they only keep counting toward the chat limit. */
export type InsightMessage = { role: "user" | "assistant"; text: string; createdAt: string; cleared?: true };
export type InsightReportView = {
  id: string; materialIds: string[]; status: "running" | "failed" | "ready" | "confirmed";
  error: string | null; createdAt: string; confirmedAt?: string; body: InsightReportBody | null; messages?: InsightMessage[];
};
