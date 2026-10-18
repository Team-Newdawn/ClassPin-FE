"use client";

import { ChevronLeft, ChevronRight, MessageCircleQuestion, X } from "@/app/component/icons";
import { useCallback, useRef } from "react";
import type { PresentationQrPosition } from "@/app/_model/types";
import { useLanguage } from "@/app/_controller/language-context";
import { useLectureRemote } from "@/app/_controller/use-lecture-remote";
import { LoadingScreen } from "@/app/component/loading-screen";
import styles from "./page.module.css";

/** 로그인 없는 발표 리모컨. 처음 연 기기 한 대만 LIVE 슬라이드를 한 장씩 넘긴다. */
export default function LectureRemote() {
  const { t } = useLanguage();
  const { state, lecture, syncError, busy, previous, next, changeSettings, questionsOpen, setQuestionsOpen } = useLectureRemote();
  const questionsRef = useRef<HTMLDialogElement>(null);
  const attachQuestionsRef = useCallback((node: HTMLDialogElement | null) => {
    questionsRef.current = node;
    if (node && !node.open) node.showModal();
  }, []);

  if (state === "loading") return <LoadingScreen />;
  if (state !== "ready" || !lecture) {
    const [title, body] = state === "inUse" ? ["remote.inUseTitle", "remote.inUseBody"] as const
      : state === "revoked" ? ["remote.revokedTitle", "remote.revokedBody"] as const
        : ["remote.offlineTitle", "remote.syncError"] as const;
    return <main className={styles.root}><section className={styles.notice}><h1>{t(title)}</h1><p>{t(body)}</p></section></main>;
  }

  const { currentSlide, slideCount, live } = lecture;
  const disabled = !live || busy;
  const closeQuestions = () => {
    questionsRef.current?.close();
    setQuestionsOpen(false);
  };
  return <main className={styles.root}>
    <header className={styles.header}>
      <span className={`${styles.badge} ${live ? styles.live : ""}`}>{t(live ? "session.liveLabel" : "session.notStartedLabel")}</span>
      <h1 title={lecture.title}>{lecture.title}</h1>
    </header>
    <p className={styles.page} aria-live="polite"><b>{slideCount ? currentSlide + 1 : 0}</b> / {slideCount}</p>
    {!live && <p className={styles.hint}>{t("remote.waiting")}</p>}
    {syncError && <p className={styles.error} role="alert">{t("remote.syncError")}</p>}
    <div className={styles.controls}>
      <button type="button" className="btn secondary" disabled={disabled || currentSlide <= 0} onClick={previous}><ChevronLeft aria-hidden="true" />{t("remote.previous")}</button>
      <button type="button" className="btn primary" disabled={disabled || currentSlide >= slideCount - 1} onClick={next}>{t("remote.next")}<ChevronRight aria-hidden="true" /></button>
    </div>
    <section className={styles.settings} aria-label={t("remote.displaySettings")}>
      <button type="button" className={styles.toggle} role="switch" aria-checked={lecture.showQuestionPins} disabled={disabled} onClick={() => changeSettings({ show_question_pins: !lecture.showQuestionPins })}>
        <span>{t("session.questionDisplay")}</span><b>{lecture.showQuestionPins ? "ON" : "OFF"}</b>
      </button>
      <div className={styles.modes} role="group" aria-label={t("session.questionDisplay")}>
        <button type="button" aria-pressed={!lecture.showQuestionLabels} disabled={disabled || !lecture.showQuestionPins} onClick={() => changeSettings({ show_question_labels: false })}>{t("session.pinsOnly")}</button>
        <button type="button" aria-pressed={lecture.showQuestionLabels} disabled={disabled || !lecture.showQuestionPins} onClick={() => changeSettings({ show_question_labels: true })}>{t("session.pinsAndQuestions")}</button>
      </div>
      <button type="button" className={styles.toggle} role="switch" aria-checked={lecture.showPresentationQr} disabled={disabled} onClick={() => changeSettings({ show_presentation_qr: !lecture.showPresentationQr })}>
        <span>{t("session.qrCode")}</span><b>{lecture.showPresentationQr ? "ON" : "OFF"}</b>
      </button>
      <label className={styles.placement}>
        {t("session.qrPosition")}
        <select value={lecture.presentationQrPosition} disabled={disabled || !lecture.showPresentationQr} onChange={(event) => changeSettings({ presentation_qr_position: event.target.value as PresentationQrPosition })}>
          <option value="top-left">{t("session.qrTopLeft")}</option>
          <option value="top-right">{t("session.qrTopRight")}</option>
          <option value="bottom-left">{t("session.qrBottomLeft")}</option>
          <option value="bottom-right">{t("session.qrBottomRight")}</option>
        </select>
      </label>
    </section>
    <button type="button" className={styles.questionsButton} disabled={!live} onClick={() => setQuestionsOpen(true)} aria-haspopup="dialog" aria-expanded={questionsOpen} aria-controls="remote-questions">
      <MessageCircleQuestion aria-hidden="true" /><span>{t("session.questionList")}</span><b>{lecture.questionCount}</b>
    </button>
    {questionsOpen && <dialog id="remote-questions" ref={attachQuestionsRef} className={styles.dialog} aria-labelledby="remote-questions-title" onClose={() => setQuestionsOpen(false)} onCancel={(event) => { event.preventDefault(); closeQuestions(); }} onClick={(event) => { if (event.target === event.currentTarget) closeQuestions(); }}>
      <section className={styles.sheet}>
        <header className={styles.sheetHeader}>
          <h2 id="remote-questions-title">{t("session.questionList")} <span>{lecture.questionCount}</span></h2>
          <button type="button" onClick={closeQuestions} aria-label={t("session.closeQuestions")}><X aria-hidden="true" /></button>
        </header>
        {syncError && <p className={styles.error} role="alert">{t("remote.syncError")}</p>}
        {lecture.questions === undefined ? <p className={styles.hint} role="status">{t("remote.loadingQuestions")}</p>
          : lecture.questions.length ? <ul className={styles.questionList} tabIndex={0} aria-label={t("session.questionList")}>{lecture.questions.map((question) => <li key={question.id}>
            {question.slideIndex !== null && <span>{t("common.slideNumber", { number: question.slideIndex + 1 })}</span>}
            <p>{question.text}</p>
          </li>)}</ul> : <p className={styles.hint}>{t("session.noQuestions")}</p>}
      </section>
    </dialog>}
  </main>;
}
