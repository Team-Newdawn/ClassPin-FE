"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import type { Question } from "@/app/_model/types";
import { countSummaryChanges, SUMMARY_REFRESH_CHANGES, SUMMARY_REFRESH_IDLE_MS, SummaryError, summarizeQuestions, toSummaryItems, type SummaryPurpose } from "@/app/_service/question-summary-service";

export type { SummaryPurpose };

/** 강의 관리 플레이어와 발표 화면이 같은 방식으로 묶음을 펼치고 닫는다. 슬라이드가 바뀌면 자동으로 닫힌다. */
export function usePinCluster(slideId: string | undefined, questions: readonly Question[]) {
  const [cluster, setCluster] = useState<{ slideId: string; ids: string[]; highlightedId: string | null } | null>(null);
  const expandedIds = cluster && cluster.slideId === slideId ? cluster.ids : undefined;
  const questionsById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const clusterQuestions = useMemo(() => expandedIds?.flatMap((id) => {
    const question = questionsById.get(id);
    return question ? [question] : [];
  }) ?? [], [expandedIds, questionsById]);
  return {
    expandedIds,
    // 팝오버 목록에서 고른 PIN. 펼친 PIN 중 이것만 커지고 맨 앞으로 나온다.
    highlightedId: expandedIds ? cluster!.highlightedId : null,
    highlightPin: (id: string) => setCluster((current) => current && { ...current, highlightedId: id }),
    clusterQuestions,
    openCluster: (ids: string[]) => { if (slideId) setCluster({ slideId, ids, highlightedId: null }); },
    closeCluster: () => {
      const first = expandedIds?.[0];
      setCluster(null);
      if (first) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cluster-ids~="${first}"]`)?.focus());
    },
  };
}

// 슬라이드별 마지막으로 요약한 질문. 패널이 잠깐 사라졌다 돌아와도 갱신 기준을 이어 간다(새로고침하면 처음부터).
const summarizedBySlide = new Map<string, readonly Question[]>();

/** AI summary state for `QuestionSummary`. `text` set means a fixed example, so the AI is not called. */
export function useQuestionSummary({ questions, folder, text, refreshKey }: { questions: readonly Question[]; folder: SummaryPurpose; text?: string; refreshKey?: string }) {
  const { locale } = useLanguage();
  const purpose = folder?.purpose ?? null;
  const purposeLabel = folder?.purposeLabel ?? null;
  const [, refreshed] = useReducer((count: number) => count + 1, 0);
  const summarized = refreshKey ? summarizedBySlide.get(refreshKey) : undefined;
  const changes = summarized ? countSummaryChanges(summarized, questions) : SUMMARY_REFRESH_CHANGES;
  const target = summarized && changes < SUMMARY_REFRESH_CHANGES ? summarized : questions;
  const key = `${locale}:${JSON.stringify(toSummaryItems(target.slice(0, 20)))}`;
  const [summary, setSummary] = useState<{ key: string; text: string | null; limited?: boolean }>();

  useEffect(() => {
    if (!refreshKey || changes === 0) return;
    const remember = () => summarizedBySlide.set(refreshKey, questions);
    if (changes >= SUMMARY_REFRESH_CHANGES) { remember(); return; }
    const timer = setTimeout(() => { remember(); refreshed(); }, SUMMARY_REFRESH_IDLE_MS);
    return () => clearTimeout(timer);
  }, [refreshKey, changes, questions]);

  useEffect(() => {
    if (text !== undefined) return;
    let active = true;
    summarizeQuestions(JSON.parse(key.slice(key.indexOf(":") + 1)), locale, purpose && { purpose, purposeLabel }).then(
      (text) => { if (active) setSummary({ key, text }); },
      (error) => {
        console.error("Question summary failed", error);
        if (active) setSummary({ key, text: null, limited: error instanceof SummaryError && error.status === 429 });
      },
    );
    return () => { active = false; };
  }, [key, locale, purpose, purposeLabel, text]);

  return { loading: text === undefined && summary?.key !== key, summary };
}
