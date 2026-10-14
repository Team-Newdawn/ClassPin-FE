"use client";

import { useLanguage } from "@/app/_controller/language-context";
import { ThumbsUp } from "@/app/component/icons";
import type { Question } from "@/app/_model/types";


export function QuestionCard({ question, onClick, selected = false }: {
  question: Question;
  onClick: () => void;
  selected?: boolean;
}) {
  const { t, timeAgo } = useLanguage();

  return (
    <button type="button" className={`question-card ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onClick}>
      <div className="question-meta">
        <time className="question-time" dateTime={question.createdAt}>{timeAgo(question.createdAt)}</time>
      </div>
      <div className="question-card-row">
        <p className="question-card-copy" title={question.text}>{question.text}</p>
        <span className="question-empathy" aria-label={t("question.empathyCount", { count: question.reactionCount })}><ThumbsUp aria-hidden="true" />{question.reactionCount}</span>
      </div>
    </button>
  );
}
