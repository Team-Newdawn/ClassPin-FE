import type { ClassFolder, ClassSession, Question, Slide } from "./types.ts";

export function summarizeEndReport(slideCount: number, questions: readonly Pick<Question, "slideIndex" | "reactionCount">[]) {
  const counts = Array.from({ length: slideCount }, () => 0);
  let unmapped = 0;
  let reactionCount = 0;
  for (const question of questions) {
    if (Number.isInteger(question.slideIndex) && question.slideIndex >= 0 && question.slideIndex < slideCount) counts[question.slideIndex]++;
    else unmapped++;
    reactionCount += question.reactionCount;
  }
  const maximum = counts.reduce((highest, count) => Math.max(highest, count), unmapped);
  const topSlides: (number | null)[] = counts.flatMap((count, index) => count === maximum && maximum > 0 ? [index + 1] : []);
  if (unmapped === maximum && maximum > 0) topSlides.push(null);
  return { counts, unmapped, maximum, topSlides, questionCount: questions.length, reactionCount };
}

export function groupQuestionsBySlide<T extends Question>(questions: readonly T[]): ReadonlyMap<number, T[]> {
  const grouped = new Map<number, T[]>();
  questions.forEach((question) => {
    const group = grouped.get(question.slideIndex);
    if (group) group.push(question);
    else grouped.set(question.slideIndex, [question]);
  });
  return grouped;
}

export type FolderSummary = ClassFolder & {
  materialCount: number;
  slideCount: number;
  questionCount: number;
  cover?: Slide;
  updatedAt: string | null;
};
type FolderAccumulator = FolderSummary & { updatedTimestamp: number };

export function summarizeFolders(
  folders: readonly ClassFolder[],
  sessions: readonly ClassSession[],
  unfiled: ClassFolder
): FolderSummary[] {
  const orderedFolders = [...folders, unfiled];
  const summaries = new Map<string | null, FolderAccumulator>();

  orderedFolders.forEach((folder) => {
    const key = folder.id === unfiled.id ? null : folder.id;
    const createdAt = Date.parse(folder.createdAt);
    summaries.set(key, { ...folder, materialCount: 0, slideCount: 0, questionCount: 0, updatedAt: null, updatedTimestamp: Number.isFinite(createdAt) ? createdAt : 0 });
  });

  sessions.forEach((session) => {
    const summary = summaries.get(session.folderId);
    if (!summary) return;
    if (summary.materialCount === 0) summary.cover = session.slides[0];
    summary.materialCount += 1;
    summary.slideCount += session.slides.length;
    summary.questionCount += session.questions.length;
    summary.updatedTimestamp = Math.max(summary.updatedTimestamp, Date.parse(session.createdAt) || 0);
  });

  return orderedFolders.map((folder) => {
    const key = folder.id === unfiled.id ? null : folder.id;
    const { updatedTimestamp, ...summary } = summaries.get(key)!;
    return { ...summary, updatedAt: updatedTimestamp ? new Date(updatedTimestamp).toISOString() : null };
  });
}
