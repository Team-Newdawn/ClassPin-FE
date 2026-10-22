export type InsightMetrics = { questions: number; positioned: number; unanswered: number; answered: number; resolved: number; reactions: number; answers: number };
export type InsightReportBody = {
  schemaVersion: 2;
  model: string;
  /** AI-judged material kind (e.g. "투자 설명회"); absent on reports made before it existed. */
  category?: string;
  /** Prompt line for the instructor-chosen folder purpose; absent for unfiled materials and older reports. */
  purpose?: string;
  /** Deck order (1-based). `topic` may be empty for appended image slides that are not in the PDF. */
  slides: { page: number; topic: string; questionSummary: string; suggestion: string; metrics: InsightMetrics }[];
  questions: { id: string; page: number; text: string; answers: string[]; reactions: number; status: string }[];
  overall: { summary: string; hotspots: { page: number; reason: string }[]; suggestions: string[] };
  groups: { title: string; summary: string; questionIds: string[] }[];
};
export type InsightMessage = { role: "user" | "assistant"; text: string; createdAt: string };
export type InsightReportView = {
  id: string; materialIds: string[]; status: "running" | "failed" | "ready" | "confirmed";
  error: string | null; createdAt: string; body: InsightReportBody | null; messages?: InsightMessage[];
};
