"use client";

import { useState } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { categoryBreakdown, countBy, pinRate, resolveRate, slideHeatmap } from "@/app/_model/stats";
import { defaultQuestionCategorySettings, questionCategoryLabel, type QuestionCategory } from "@/app/_model/types";

export function useInsightsController() {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const { sessions, ready } = useSessions();
  const [scope, setScope] = useState("all");
  const scoped = scope === "all" ? sessions : sessions.filter((session) => session.id === scope);
  const questions = scoped.flatMap((session) => session.questions);
  const settingsFor = (category: QuestionCategory) => scoped.find((session) => category in session.questionCategories)?.questionCategories ?? defaultQuestionCategorySettings();
  const categoryLabel = (category: QuestionCategory) => questionCategoryLabel(settingsFor(category), category, defaultCategoryLabel);
  const unanswered = countBy(questions, "unanswered");
  const hotspots = slideHeatmap(scoped);
  const maxHeat = hotspots[0]?.count ?? 0;
  const categories = categoryBreakdown(questions, categoryLabel);
  const maxCategory = categories[0]?.count ?? 0;
  const openQuestions = scoped
    .flatMap((session) => session.questions.filter((question) => question.status === "unanswered").map((question) => ({ question, session })))
    .sort((a, b) => new Date(b.question.createdAt).getTime() - new Date(a.question.createdAt).getTime());

  return {
    t,
    timeAgo,
    ready,
    scope,
    setScope,
    scopeOptions: sessions.slice(0, 4),
    questions,
    settingsFor,
    categoryLabel,
    unanswered,
    hotspots,
    maxHeat,
    categories,
    maxCategory,
    improvementCandidates: hotspots.filter((item) => item.count >= 2).slice(0, 4),
    openQuestions,
    pinRate: pinRate(questions),
    resolveRate: resolveRate(questions),
    resolved: countBy(questions, "resolved")
  };
}
