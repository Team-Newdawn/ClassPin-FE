"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import type { Question } from "@/app/_model/types";
import { summarizeQuestions, toSummaryItems, type SummaryPurpose } from "@/app/_service/question-summary-service";
import styles from "./pin-cluster-popover.module.css";

/** 강의 관리 플레이어와 발표 화면이 같은 방식으로 묶음을 펼치고 닫는다. 슬라이드가 바뀌면 자동으로 닫힌다. */
export function usePinCluster(slideId: string | undefined, questions: readonly Question[]) {
  const [cluster, setCluster] = useState<{ slideId: string; ids: string[]; highlightedId: string | null } | null>(null);
  const expandedIds = cluster && cluster.slideId === slideId ? cluster.ids : undefined;
  return {
    expandedIds,
    // 팝오버 목록에서 고른 PIN. 펼친 PIN 중 이것만 커지고 맨 앞으로 나온다.
    highlightedId: expandedIds ? cluster!.highlightedId : null,
    highlightPin: (id: string) => setCluster((current) => current && { ...current, highlightedId: id }),
    clusterQuestions: expandedIds?.flatMap((id) => questions.filter((question) => question.id === id)) ?? [],
    openCluster: (ids: string[]) => { if (slideId) setCluster({ slideId, ids, highlightedId: null }); },
    closeCluster: () => {
      const first = expandedIds?.[0];
      setCluster(null);
      if (first) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cluster-ids~="${first}"]`)?.focus());
    },
  };
}

/** 질문 묶음 팝오버와 강의 관리 오른쪽 패널(현재 슬라이드 질문)이 함께 쓰는 AI 요약 상자. `text`가 있으면 AI를 부르지 않고 그 예시를 보여 준다. */
export function QuestionSummary({ questions, folder, className = "", text }: { questions: readonly Question[]; folder: SummaryPurpose; className?: string; text?: string }) {
  const { t, locale } = useLanguage();
  const purpose = folder?.purpose ?? null;
  const purposeLabel = folder?.purposeLabel ?? null;
  const key = `${locale}:${JSON.stringify(toSummaryItems(questions.slice(0, 20)))}`;
  const [summary, setSummary] = useState<{ key: string; text: string | null }>();

  useEffect(() => {
    if (text !== undefined) return;
    let active = true;
    summarizeQuestions(JSON.parse(key.slice(key.indexOf(":") + 1)), locale, purpose && { purpose, purposeLabel }).then(
      (text) => { if (active) setSummary({ key, text }); },
      (error) => {
        console.error("Question summary failed", error);
        if (active) setSummary({ key, text: null });
      },
    );
    return () => { active = false; };
  }, [key, locale, purpose, purposeLabel, text]);

  const loading = text === undefined && summary?.key !== key;
  return <div className={`${styles.summary} ${className}`} aria-busy={loading}>
    <b><Image src="/assets/design/cluster-sparkle.svg" width={14} height={14} alt="" />{t("report.aiSummary")}</b>
    <p role="status">{text ?? (loading ? t("session.clusterSummaryLoading") : summary?.text ?? t("session.clusterSummaryError"))}</p>
  </div>;
}

export function PinClusterPopover({ questions, folder, summary, highlightedId, onHighlight, onClose }: {
  questions: Question[];
  /** 요약 관점을 정하는 폴더 사용 목적. 미분류 자료는 null. */
  folder: SummaryPurpose;
  /** 강의 준비 화면의 예시 요약. 있으면 AI를 부르지 않는다. */
  summary?: string;
  highlightedId: string | null;
  onHighlight: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLElement>(null);
  const [sort, setSort] = useState<"empathy" | "newest">("empathy");
  // questions는 PIN 번호와 같은 공감순이다. 최신순으로 바꿔도 번호는 PIN에 붙은 번호를 유지한다.
  const sorted = sort === "newest" ? [...questions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : questions;

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || ref.current?.contains(target) || target.closest(".pin-cluster-expanded, dialog, [role='dialog'], [role='alertdialog']")) return;
      onClose();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [onClose]);

  const x = questions.reduce((sum, question) => sum + (question.x ?? 0), 0) / questions.length;
  return <section
    ref={ref}
    className={styles.popover}
    role="dialog"
    aria-labelledby="pin-cluster-title"
    style={{ left: `clamp(8px, calc(${x * 100}% ${x > 0.5 ? "- 388px" : "+ 68px"}), calc(100% - 328px))` }}
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}
  >
    <header><h2 id="pin-cluster-title">{t("session.clusterTitle", { count: questions.length })}</h2><button type="button" autoFocus onClick={onClose} aria-label={t("common.close")}><Image src="/assets/design/cluster-close.svg" width={14} height={14} alt="" /></button></header>
    <QuestionSummary questions={questions} folder={folder} text={summary} />
    <div className={styles.list}>
      <div className={styles.listHeader}>
        <h3>{t("common.question")} <span>{questions.length}</span></h3>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label={t("student.sortQuestions")}>
          <option value="empathy">{t("student.sortByEmpathy")}</option>
          <option value="newest">{t("student.sortByNewest")}</option>
        </select>
      </div>
      {sorted.map((question) => <button key={question.id} type="button" aria-pressed={question.id === highlightedId} onClick={() => onHighlight(question.id)}>
        <span className={styles.number} aria-hidden="true">{questions.indexOf(question) + 1}</span>
        <span className={styles.text}>{question.text}</span>
        <span className={styles.empathy} aria-label={t("question.empathyCount", { count: question.reactionCount })}><Image src="/assets/design/cluster-thumb.svg" width={12} height={12} alt="" />{question.reactionCount}</span>
      </button>)}
    </div>
  </section>;
}
