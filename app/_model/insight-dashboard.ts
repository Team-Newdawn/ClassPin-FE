type Timed = { createdAt: string };
type LectureSpan = { start: number; end: number };

const MINUTE = 60_000;

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

/** DSH-023: people, not rows. A null author (deleted account) counts as nobody. */
export function participationCounts(questions: readonly { authorId: string | null; pinned: boolean }[], reactorIds: readonly string[]) {
  const authors = new Set(questions.flatMap((question) => question.authorId ?? []));
  const pinAuthors = questions.flatMap((question) => question.pinned && question.authorId ? [question.authorId] : []);
  return { questionAuthors: authors.size, engaged: new Set([...authors, ...reactorIds]).size, reactorsOrPinAuthors: new Set([...pinAuthors, ...reactorIds]).size };
}

/** DSH-042: a part longer than `limit` characters continues in "(2)", "(3)" sections; lines are never split. */
export function exportSections(title: string, lines: readonly string[], limit: number): { title: string; text: string }[] {
  const parts: string[][] = [[]];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > limit && parts.at(-1)!.length) { parts.push([]); size = 0; }
    parts.at(-1)!.push(line.slice(0, limit)); size += line.length + 1;
  }
  return parts.map((part, index) => ({ title: index ? `${title} (${index + 1})` : title, text: part.join("\n") }));
}

/** DSH-030: at most six equal buckets (whole minutes) over the span; every question made inside the span counts. */
export function questionFlow(questions: Timed[], span: LectureSpan): { size: number; buckets: { start: number; end: number; count: number }[] } {
  // Rounded like the header's "진행 n분": a lecture ended a few ms past 5:00 is 5 minutes, not 6 with an empty last bucket.
  const minutes = Math.max(1, Math.round((span.end - span.start) / MINUTE)), size = Math.ceil(minutes / 6);
  const buckets = Array.from({ length: Math.ceil(minutes / size) }, (_, index) => ({ start: index * size, end: Math.min((index + 1) * size, minutes), count: 0 }));
  for (const question of questions) {
    const time = Date.parse(question.createdAt);
    // A question exactly at span.end belongs to the last bucket.
    if (time >= span.start && time <= span.end) buckets[Math.min(Math.floor((time - span.start) / MINUTE / size), buckets.length - 1)].count += 1;
  }
  return { size, buckets };
}
