"use client";

import { useLanguage } from "@/app/_controller/language-context";
import { questionCategoryClass, questionCategoryLabel, questionMarkerEmoji, type Question, type QuestionCategorySettings } from "@/app/_model/types";
import { StatusBadge } from "@/app/component/status-badge";

export function QuestionCard({ question, questionCategories, selected, onClick }: {
  question: Question;
  questionCategories: QuestionCategorySettings;
  selected: boolean;
  onClick: () => void;
}) {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const label = questionCategoryLabel(questionCategories, question.category, defaultCategoryLabel);

  return (
    <button className={`question-card ${selected ? "selected" : ""}`} onClick={onClick}>
      <div className="question-meta">
        <span className={`category ${questionCategoryClass(questionCategories, question.category)}`}>
          {questionMarkerEmoji(question.marker) && <i aria-hidden="true">{questionMarkerEmoji(question.marker)}</i>}
          {label}
        </span>
        <StatusBadge status={question.status} />
      </div>
      <p className="question-card-copy">{question.text}</p>
      {question.answer && <div className="question-answer"><span>{t("session.myAnswer")}</span><p>{question.answer}</p></div>}
      <div className="question-card-footer">
        {question.x !== null && <span className="pin-context">{question.anchorKind !== "point" ? t("session.regionQuestion") : t("session.pinQuestion")}</span>}
        <time className="question-time" dateTime={question.createdAt}>{timeAgo(question.createdAt)}</time>
      </div>
    </button>
  );
}
