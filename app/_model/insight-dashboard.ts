type Timed = { createdAt: string };
type LectureSpan = { start: number; end: number };

/** DSH-022: from the LIVE start to the recorded end, or to the last question when no end was recorded. */
export function lectureSpan(startedAt: string | null, endedAt: string | null, questions: Timed[]): LectureSpan | null {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(start)) return null;
  const ended = endedAt ? Date.parse(endedAt) : NaN;
  const end = Number.isFinite(ended) ? ended : Math.max(start, ...questions.map((question) => Date.parse(question.createdAt)).filter(Number.isFinite));
  return { start, end: Math.max(start, end) };
}

/** DSH-052: records that a dashboard was opened; only the 20 most recent stay so the browser record stays small. */
export function rememberView(viewed: Readonly<Record<string, string>>, id: string, at: string): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...viewed, [id]: at }).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 20));
}
