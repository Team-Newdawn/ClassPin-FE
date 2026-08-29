"use client";

import { QRCodeSVG } from "qrcode.react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "@/app/component/icons";
import { LanguageSwitcher } from "@/app/component/language-switcher";
import { QuestionDetailDialog } from "../component/question-detail-dialog";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { useSessionPresentationController } from "./controller";
import styles from "./page.module.css";

export default function SessionPresentation() {
  const {
    t,
    ready,
    session,
    slide,
    detailQuestion,
    joinUrl,
    pageQuestions,
    visibleQuestionIds,
    pinDisplayPositions,
    activeQuestionId,
    liveQuestionId,
    liveReactions,
    pinMilestone,
    positionedQuestionCount,
    controlsVisible,
    isFullscreen,
    actionError,
    stageRef,
    presentationCanvasRef,
    revealControls,
    openQuestionDetail,
    closeQuestionDetail,
    toggleFullscreen,
    previousSlide,
    nextSlide,
    goHome,
    goBackToAdmin,
    closePresentation
  } = useSessionPresentationController();

  if (!ready) return <main className={`${styles.root} presentation-shell presentation-message`}><span className="spinner" /></main>;
  if (!session) return <main className={`${styles.root} presentation-shell presentation-message`}><h1>{t("session.notFound")}</h1><button className="presentation-text-button" onClick={goHome}>{t("common.homeBack")}</button></main>;
  if (!slide) return <main className={`${styles.root} presentation-shell presentation-message`}><h1>{t("presentation.noSlides")}</h1><button className="presentation-text-button" onClick={goBackToAdmin}>{t("presentation.backToAdmin")}</button></main>;

  return (
    <main
      ref={stageRef}
      className={`${styles.root} presentation-shell class-presentation-shell ${session.presentationInteractions && session.showPresentationQr ? `qr-${session.presentationQrPosition}` : ""} ${controlsVisible ? "controls-visible" : ""}`}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
    >
      <div ref={presentationCanvasRef} className="presentation-slide class-presentation-slide class-presentation-canvas" aria-label={`${session.title} · ${t("common.slideNumber", { number: session.currentSlide + 1 })}`}>
        <SlideCanvas
          slide={slide}
          questions={pageQuestions}
          questionCategories={session.questionCategories}
          visibleQuestionIds={visibleQuestionIds}
          pinDisplayPositions={pinDisplayPositions}
          selectedId={activeQuestionId}
          liveQuestionId={liveQuestionId}
          onSelectPin={openQuestionDetail}
          showPins={session.presentationInteractions && session.showQuestionPins}
          showQuestionLabels={session.presentationInteractions && session.showQuestionPins}
          labelContent="body"
        />
      </div>

      {session.presentationInteractions && session.showPresentationQr && <aside
        className={`presentation-join-qr ${session.presentationQrPosition}`}
        role="img"
        aria-label={`${t("presentation.joinQrAria")} · ${session.code}`}
      >
        <QRCodeSVG value={joinUrl} size={108} bgColor="#ffffff" fgColor="#101827" level="M" />
        <div><span>{t("presentation.scanToJoin")}</span><b>{session.code}</b></div>
      </aside>}

      {session.presentationInteractions && <>
        <div className="class-presentation-reactions" aria-hidden="true">
          {liveReactions.map((reaction) => <span
            key={reaction.id}
            className="slide-emoji-reaction lecture-live-reaction"
            style={{ left: `${reaction.left}%`, animationDelay: `${reaction.delay}ms` }}
          >{reaction.emoji}</span>)}
        </div>
        {pinMilestone !== null && <output className="class-presentation-milestone" role="status" aria-live="polite" aria-atomic="true">{pinMilestone}!</output>}
        <output className="class-presentation-status top-right" aria-label={t("presentation.pinTotal", { count: positionedQuestionCount })}><span>PIN</span><b>{String(positionedQuestionCount).padStart(2, "0")}</b></output>
      </>}

      <header className="presentation-topbar">
        <div className="presentation-title"><span className={`status-dot ${session.status}`} /><b>{session.title}</b></div>
        <div className="presentation-top-actions">
          <LanguageSwitcher />
          <button onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? t("presentation.exitFullscreen") : t("presentation.startFullscreen")} title={`${isFullscreen ? t("presentation.exitFullscreen") : t("presentation.startFullscreen")} (F)`}>
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </button>
          <button onClick={closePresentation} aria-label={t("presentation.close")} title={t("presentation.close")}><X /></button>
        </div>
      </header>

      <button className="presentation-side-control previous" disabled={session.currentSlide === 0} onClick={previousSlide} aria-label={t("session.previousSlide")}><ChevronLeft /></button>
      <button className="presentation-side-control next" disabled={session.currentSlide === session.slides.length - 1} onClick={nextSlide} aria-label={t("session.nextSlide")}><ChevronRight /></button>

      <footer className="presentation-footer">
        {actionError && <span className="presentation-error" role="alert">{actionError}</span>}
        <span className="presentation-page" aria-live="polite">{session.currentSlide + 1} / {session.slides.length}</span>
        <span className="presentation-hint">{t("presentation.hint")}</span>
      </footer>

      {session.presentationInteractions && detailQuestion && <QuestionDetailDialog question={detailQuestion} questionCategories={session.questionCategories} onClose={closeQuestionDetail} />}
    </main>
  );
}
