"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "@/app/component/icons";
import { trapDialogFocus } from "@/app/_lib/dialog-focus";
import { useLanguage } from "@/app/_controller/language-context";

import type { Question } from "@/app/_model/types";
import styles from "./question-detail-dialog.module.css";

export function QuestionDetailDialog({ question, onClose }: {
  question: Question;
  onClose: () => void;
}) {
  const { t, timeAgo } = useLanguage();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [question.id]);

  return (
    <div className={`${styles.root} question-detail-backdrop`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className="question-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapDialogFocus}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label={t("question.closeDetail")}><X /></button>
        <div className="question-detail-heading">
          <span>{t("common.slideLabel", { number: question.slideIndex + 1 })}</span>
        </div>
        <h2 id={titleId}>{t("common.question")}</h2>
        <p className="question-detail-question">{question.text}</p>
        <div className="question-detail-meta">
          <span>👍 {question.reactionCount}</span>
          <time dateTime={question.createdAt}>{timeAgo(question.createdAt)}</time>
        </div>
        <button type="button" className="btn secondary" onClick={onClose}>{t("common.confirm")}</button>
      </section>
    </div>
  );
}
