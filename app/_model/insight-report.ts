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
  /** RPT-035: body sections whose structure the AI chose for this kind of material. */
  sections: { title: string; text: string }[];
  groups: { title: string; summary: string; questionIds: string[] }[];
};
