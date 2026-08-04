import type { ClassSession, Question, QuestionCategory } from "./types";

export const countBy = (questions: Question[], status: Question["status"]) => questions.filter((q) => q.status === status).length;

export const allQuestions = (sessions: ClassSession[]) => sessions.flatMap((session) => session.questions);

export const resolveRate = (questions: Question[]) => questions.length ? Math.round((countBy(questions, "resolved") / questions.length) * 100) : 0;

export const pinRate = (questions: Question[]) => questions.length ? Math.round((questions.filter((q) => q.x !== null).length / questions.length) * 100) : 0;

export interface SlideHeat {
  sessionId: string;
  sessionTitle: string;
  slideIndex: number;
  title: string;
  count: number;
  unanswered: number;
}

export const slideHeatmap = (sessions: ClassSession[]): SlideHeat[] =>
  sessions
    .flatMap((session) => session.slides.map((slide, index) => {
      const questions = session.questions.filter((q) => q.slideIndex === index);
      return { sessionId: session.id, sessionTitle: session.title, slideIndex: index, title: slide.title, count: questions.length, unanswered: countBy(questions, "unanswered") };
    }))
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

export const categoryBreakdown = (questions: Question[], getLabel: (key: QuestionCategory) => string) =>
  (["concept", "why", "example", "error", "important"] as QuestionCategory[])
    .map((key) => ({ key, label: getLabel(key), count: questions.filter((q) => q.category === key).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

export const recentQuestions = (sessions: ClassSession[], limit: number) =>
  sessions
    .flatMap((session) => session.questions.map((question) => ({ question, session })))
    .sort((a, b) => new Date(b.question.createdAt).getTime() - new Date(a.question.createdAt).getTime())
    .slice(0, limit);
