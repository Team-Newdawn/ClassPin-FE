import {
  defaultQuestionCategorySettings,
  questionCategoryLabel,
  type ClassFolder,
  type ClassSession,
  type Question,
  type QuestionCategory,
  type QuestionCategorySettings,
  type Slide
} from "./types.ts";

export const countBy = (questions: readonly Question[], status: Question["status"]) => questions.filter((q) => q.status === status).length;

export const allQuestions = (sessions: readonly ClassSession[]) => sessions.flatMap((session) => session.questions);

export const resolveRate = (questions: readonly Question[]) => questions.length ? Math.round((countBy(questions, "resolved") / questions.length) * 100) : 0;

export const pinRate = (questions: readonly Question[]) => questions.length ? Math.round((questions.filter((q) => q.x !== null).length / questions.length) * 100) : 0;

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

export interface SlideHeat {
  sessionId: string;
  sessionTitle: string;
  slideIndex: number;
  title: string;
  count: number;
  unanswered: number;
}

export const slideHeatmap = (sessions: readonly ClassSession[]): SlideHeat[] =>
  sessions
    .flatMap((session) => {
      const questionsBySlide = groupQuestionsBySlide(session.questions);
      return session.slides.map((slide, index) => {
        const questions = questionsBySlide.get(index) ?? [];
        return { sessionId: session.id, sessionTitle: session.title, slideIndex: index, title: slide.title, count: questions.length, unanswered: countBy(questions, "unanswered") };
      });
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.slideIndex - b.slideIndex);

/** 질문 밀도를 brand blue 단일 scale 4단계로 환산한다 (DESIGN.md · viz-heat-*). */
export const heatLevel = (count: number, max: number): "low" | "mid" | "high" | "critical" => {
  const ratio = max ? count / max : 0;
  if (ratio >= 0.75) return "critical";
  if (ratio >= 0.5) return "high";
  if (ratio >= 0.25) return "mid";
  return "low";
};

export const categoryBreakdown = (questions: readonly Question[], getLabel: (key: QuestionCategory) => string) => {
  const counts = new Map<QuestionCategory, number>();
  questions.forEach((question) => counts.set(question.category, (counts.get(question.category) ?? 0) + 1));
  return [...counts]
    .map(([key, count]) => ({ key, label: getLabel(key), count }))
    .sort((a, b) => b.count - a.count);
};

export const recentQuestions = (sessions: readonly ClassSession[], limit: number) =>
  sessions
    .flatMap((session) => session.questions.map((question) => ({ question, session })))
    .sort((a, b) => new Date(b.question.createdAt).getTime() - new Date(a.question.createdAt).getTime())
    .slice(0, limit);

export function buildSessionInsights(
  sessions: readonly ClassSession[],
  defaultCategoryLabel: (category: QuestionCategory) => string
) {
  const questions: Question[] = [];
  const openQuestions: Array<{ question: Question; session: ClassSession }> = [];
  const settingsByCategory = new Map<QuestionCategory, QuestionCategorySettings>();
  let unanswered = 0;
  let resolved = 0;
  let pinned = 0;

  sessions.forEach((session) => {
    Object.keys(session.questionCategories).forEach((category) => {
      if (!settingsByCategory.has(category)) settingsByCategory.set(category, session.questionCategories);
    });
    session.questions.forEach((question) => {
      questions.push(question);
      if (question.x !== null) pinned += 1;
      if (question.status === "resolved") resolved += 1;
      if (question.status === "unanswered") {
        unanswered += 1;
        openQuestions.push({ question, session });
      }
    });
  });

  openQuestions.sort((a, b) => b.question.createdAt.localeCompare(a.question.createdAt));
  const fallbackSettings = defaultQuestionCategorySettings();
  const settingsFor = (category: QuestionCategory) => settingsByCategory.get(category) ?? fallbackSettings;
  const getCategoryLabel = (category: QuestionCategory) => questionCategoryLabel(settingsFor(category), category, defaultCategoryLabel);
  const hotspots = slideHeatmap(sessions);
  const categories = categoryBreakdown(questions, getCategoryLabel);

  return {
    questions,
    settingsFor,
    categoryLabel: getCategoryLabel,
    unanswered,
    resolved,
    pinRate: questions.length ? Math.round((pinned / questions.length) * 100) : 0,
    resolveRate: questions.length ? Math.round((resolved / questions.length) * 100) : 0,
    hotspots,
    maxHeat: hotspots[0]?.count ?? 0,
    categories,
    maxCategory: categories[0]?.count ?? 0,
    openQuestions
  };
}
