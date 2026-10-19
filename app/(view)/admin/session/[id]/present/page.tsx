"use client";

import type { CSSProperties } from "react";
import { PresentationQr } from "../component/presentation-qr";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "@/app/component/icons";
import { LanguageSwitcher } from "@/app/component/language-switcher";
import { PinClusterPopover } from "../component/pin-cluster-popover";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { useSessionPresentationController } from "./controller";
import styles from "./page.module.css";


export default function SessionPresentation() {
  const {
    t,
    ready,
    canControl,
    presenterSlide,
    returnToPresenter,
    session,
    slide,
    currentSlide,
    selectedPinId,
    joinUrl,
    pageQuestions,
    visibleQuestionIds,
    activeQuestionId,
    liveQuestionId,
    liveReactions,
    pinMilestone,
    positionedQuestionCount,
    controlsVisible,
    isFullscreen,
    actionError,
    stageRef,
    revealControls,
    selectPin,
    clearPinSelection,
    showQuestionLabels, presentationOptions, savePresentationOptions,
    folder,
    expandedIds,
    highlightedId,
    highlightPin,
    clusterQuestions,
    openCluster,
    closeCluster,
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
  const qrPositionClass = presentationOptions.qrPosition;

  return (
    <main
      ref={stageRef}
      className={`${styles.root} presentation-shell class-presentation-shell ${session.showPresentationQr ? `qr-${qrPositionClass}` : ""} ${controlsVisible ? "controls-visible" : ""}`}
      style={{ "--presentation-qr-size": `${presentationOptions.qrSize + 16}px` } as CSSProperties}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
    >
      <div className="presentation-slide class-presentation-slide class-presentation-canvas" onClick={(event) => { if (!(event.target as Element).closest("button, [role='dialog']")) clearPinSelection(); }} aria-label={`${session.title} · ${t("common.slideNumber", { number: currentSlide + 1 })}`}>
        <SlideCanvas
          slide={slide}
          questions={pageQuestions}
          visibleQuestionIds={visibleQuestionIds}
          selectedId={activeQuestionId}
          liveQuestionId={liveQuestionId}
          livePinEffect={presentationOptions.questionMode === "pins" ? "collapse" : "hold"}
          onSelectPin={selectPin}
          onSelectCluster={openCluster}
          expandedIds={expandedIds}
          highlightedId={highlightedId}
          dimmed={Boolean(expandedIds || selectedPinId)}
          showPins={session.showQuestionPins}
          showQuestionLabels={session.showQuestionPins && showQuestionLabels}
        >
          {session.showQuestionPins && clusterQuestions.length > 0 && <PinClusterPopover key={expandedIds!.join("|")} questions={clusterQuestions} folder={folder} highlightedId={highlightedId} onHighlight={highlightPin} onClose={closeCluster} />}
        </SlideCanvas>
      </div>

      {session.showPresentationQr && <PresentationQr options={presentationOptions} onChange={savePresentationOptions} joinUrl={joinUrl} code={session.code} />}

      <div className="class-presentation-reactions" aria-hidden="true">
        {liveReactions.map((reaction) => <span
          key={reaction.id}
          className="slide-emoji-reaction lecture-live-reaction"
          style={{ left: `${reaction.left}%`, animationDelay: `${reaction.delay}ms` }}
        >{reaction.emoji}</span>)}
      </div>
      {session.showQuestionPins && <>
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

      <button className="presentation-side-control previous" disabled={currentSlide === 0} onClick={previousSlide} aria-label={t("session.previousSlide")}><ChevronLeft /></button>
      <button className="presentation-side-control next" disabled={currentSlide === session.slides.length - 1} onClick={nextSlide} aria-label={t("session.nextSlide")}><ChevronRight /></button>

      <footer className="presentation-footer">
        {presenterSlide !== null && <button type="button" className="presentation-text-button presentation-return" onClick={returnToPresenter}>{t("presentation.returnToPresenter", { number: presenterSlide + 1 })}</button>}
        {actionError && <span className="presentation-error" role="alert">{actionError}</span>}
        <span className="presentation-page" aria-live="polite">{currentSlide + 1} / {session.slides.length}</span>
        <span className="presentation-hint">{t(canControl ? "presentation.hint" : "presentation.followerHint")}</span>
      </footer>

    </main>
  );
}
