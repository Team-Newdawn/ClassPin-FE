"use client";

import { ChevronLeft, ChevronRight, MessageCircleQuestion, X } from "@/app/component/icons";
import { useCallback, useRef } from "react";
import { presentationOptions, QR_POSITIONS, type PresentationOptions, type QrPosition } from "@/app/_model/presentation-options";
import { useLanguage } from "@/app/_controller/language-context";
import { useLectureRemote } from "@/app/_controller/use-lecture-remote";
import { LoadingScreen } from "@/app/component/loading-screen";
import styles from "./page.module.css";

/** 로그인 없는 발표 리모컨. 처음 연 기기 한 대만 LIVE 슬라이드를 한 장씩 넘긴다. */
export default function LectureRemote() {
  const { locale, t } = useLanguage();
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
  const options = presentationOptions({ ...lecture, showQuestionPins: true }, {});
  const changeOptions = (patch: Partial<PresentationOptions>) => changeSettings({ presentation_options: patch });
  const positionLabel = (position: QrPosition) => t(position === "top-left" ? "session.qrTopLeft" : position === "top-center" ? "session.qrTopCenter" : position === "top-right" ? "session.qrTopRight" : position === "bottom-left" ? "session.qrBottomLeft" : position === "bottom-center" ? "session.qrBottomCenter" : "session.qrBottomRight");
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
      <button type="button" className={styles.toggle} role="switch" aria-checked={lecture.showQuestionPins} disabled={disabled} onClick={() => changeSettings({ show_question_pins: !lecture.showQuestionPins })}><span>{t("session.questionDisplay")}</span><b>{lecture.showQuestionPins ? "ON" : "OFF"}</b></button>
      <div className={styles.modes} role="group" aria-label={t("session.questionDisplay")}>
        {(["pins", "questions", "bubbles"] as const).map(mode => <button key={mode} type="button" aria-pressed={options.questionMode === mode} disabled={disabled || !lecture.showQuestionPins} onClick={() => changeSettings({ show_question_labels: mode === "questions" || mode === "bubbles", presentation_options: { questionBubbles: mode === "bubbles" } })}>{mode === "bubbles" ? (locale === "ko" ? "슬라이드쇼 모드" : "Slideshow mode") : t(mode === "pins" ? "session.pinsOnly" : "session.pinsAndQuestions")}</button>)}
      </div>
      <button type="button" className={styles.toggle} role="switch" aria-checked={lecture.showPresentationQr} disabled={disabled} onClick={() => changeSettings({ show_presentation_qr: !lecture.showPresentationQr })}>
        <span>{t("session.qrCode")}</span><b>{lecture.showPresentationQr ? "ON" : "OFF"}</b>
      </button>
      <h2>{t("session.qrLayout")}</h2>
      <div className={styles.positions} role="group" aria-label={t("session.qrPosition")}>
        {QR_POSITIONS.map(position => <button key={position} type="button" data-position={position} aria-pressed={options.qrPosition === position} disabled={disabled || !lecture.showPresentationQr} onClick={() => {
          const base = position.endsWith("center") ? lecture.presentationQrPosition : position as typeof lecture.presentationQrPosition;
          changeSettings({ presentation_qr_position: base, presentation_options: { qrPosition: position, qrBasePosition: base, qrOffset: null } });
        }}><span className={styles.thumbnail} aria-hidden="true" /><span>{positionLabel(position)}</span></button>)}
      </div>
      <hr />
      <h2>{t("session.qrSize")}</h2>
      <div className={styles.sizes} role="group" aria-label={t("session.qrSize")}>
        {([64, 96, 160] as const).map((size, index) => <button key={size} type="button" aria-pressed={options.qrSize === size} disabled={disabled || !lecture.showPresentationQr} onClick={() => changeOptions({ qrSize: size })}><b>{["S", "M", "L"][index]}</b><small>{size}px</small></button>)}
      </div>
      <hr />
      <button type="button" className={styles.toggle} role="switch" aria-checked={options.qrEditable} disabled={disabled || !lecture.showPresentationQr} onClick={() => changeOptions({ qrEditable: !options.qrEditable })}><span>{t("session.qrEditable")}</span><i className={styles.switchTrack} aria-hidden="true" /></button>
      <p className={styles.editHint}>{t("session.qrEditHint")}</p>
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
