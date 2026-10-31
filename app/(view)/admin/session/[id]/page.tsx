"use client";

import Image from "next/image";
import { PresentationControls } from "./component/presentation-controls";
import Link from "next/link";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, FileText, GripVertical, ListFilter, MessageCircleQuestion, Monitor, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Play, QrCode, Search, Smartphone, Square, Trash2, X } from "@/app/component/icons";
import { lectureRemoteAvailable } from "@/app/_controller/use-lecture-remote";
import { RemoteDialog } from "./component/remote-dialog";
import { useLanguage } from "@/app/_controller/language-context";
import { LoadingScreen } from "@/app/component/loading-screen";
import { QuestionCard } from "./component/question-card";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { StatusBadge } from "./component/status-badge";
import { MAX_QUESTION_PANEL, MIN_QUESTION_PANEL, useSessionAdminController } from "./controller";
import styles from "./page.module.css";
import { LecturePreparation } from "./component/lecture-preparation";
import { PinClusterPopover, QuestionSummary } from "./component/pin-cluster-popover";
import { usePinCluster } from "./component/pin-cluster-controller";
import { slideIndexFromPageNumber } from "@/app/_model/class/presentation-rotation";

function SessionToggle({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return <button
    type="button"
    className={`session-toggle ${checked ? "on" : ""}`}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onClick}
  >
    <span className="session-toggle-thumb" />
    <span className="session-toggle-state">{checked ? "ON" : "OFF"}</span>
  </button>;
}

import { trapDialogFocus } from "@/app/component/dialog-focus";

const NOTE_MIN_HEIGHT = 36; // 12px 글자 2줄

export default function SessionAdmin() {
  const { t, timeAgo } = useLanguage();
  const controller = useSessionAdminController();
  const [pageDraft, setPageDraft] = useState("");
  const [menuSlideId, setMenuSlideId] = useState<string | null>(null);
  const [noteHeight, setNoteHeight] = useState(NOTE_MIN_HEIGHT);
  const [remoteOpen, setRemoteOpen] = useState(false);
  // 위로 끌면 노트가 커지고, 그리드의 슬라이드 행이 그만큼 줄어든다.
  const resizeNote = (delta: number) => setNoteHeight((height) => Math.round(Math.min(Math.max(height + delta, NOTE_MIN_HEIGHT), window.innerHeight * .4)));
  const { expandedIds, highlightedId, highlightPin, clusterQuestions, openCluster, closeCluster } = usePinCluster(controller.slide?.id, controller.session?.questions ?? []);
  const {
    prepare, questionScope, setQuestionScope, questionSort, setQuestionSort, panelQuestions, showQuestionLabels,
    ready, session, liveReactions, liveElapsed, audienceCount, slide, folder, folderAccentIndex, folderHref, folderSessions, questionsBySlide, questionCounts, slideQuestions,
    selected, visibleQuestions, tab, filter, query, shareOpen, mobileQuestionsOpen, copied,
    actionError, lectureSaving, presentationError, folderRailOpen, questionPanelWidth, noteDraft,
    noteDirty, noteSavingSlideId, noteSavedSlideId, deleteTarget, deletingSlide,
    deleteSlideError, deleteTargetQuestionCount, joinUrl, playerWorkspaceRef, filmstripRef,
    handleSlideWheel, toggleFolderRail, openShare,
    closeShare, openMobileQuestions, closeMobileQuestions, changeQuery, changeFilter, selectQuestion,
    selectQuestionFromList, changeSlide, handleSlidePageKeyDown, resetSlidePageInput,
    endConfirmOpen, closeEndConfirm, confirmEnd, toggleStatus, startedToast, togglePresentationAutoplay, toggleQuestionPins,
    changePresentationQrPlacement,
    changeNoteDraft, saveNoteOnBlur, openDeleteSlide,
    closeDeleteSlide, confirmDeleteSlide, startQuestionPanelResize, resizeQuestionPanel,
    finishQuestionPanelResize, cancelQuestionPanelResize, resizeQuestionPanelByKeyboard,
    openPresentation, copyJoinLink, goHome
  } = controller;

  if (!ready) return <LoadingScreen />;
  if (!session || !slide) return <div className={`${styles.root} empty-state`}><h1>{t("session.notFound")}</h1><button className="btn primary" onClick={goHome}>{t("common.home")}</button></div>;

  if (prepare) return <LecturePreparation controller={controller} />;

  const live = session.status === "live";
  const pageTarget = slideIndexFromPageNumber(pageDraft, session.slides.length);
  const noteStatus = noteSavingSlideId === slide.id
    ? t("session.speakerNotesSaving")
    : noteDirty
      ? t("session.speakerNotesPending")
      : noteSavedSlideId === slide.id
        ? t("session.speakerNotesSaved")
        : t("session.speakerNotesAutosaveHint");
  return <>
    <div
      className={`${styles.root} session-admin-shell ${folderRailOpen ? "" : "folder-rail-collapsed"}`}
      style={{ "--question-panel-width": `${questionPanelWidth}px` } as React.CSSProperties}
      inert={lectureSaving || endConfirmOpen}
      aria-busy={lectureSaving}
    >
      <aside className={`session-folder-rail folder-accent-${folderAccentIndex}`}>
        <div className="folder-rail-head">
          {folderRailOpen && <Link href={folderHref} aria-label={t("session.backToFolder")}><ArrowLeft aria-hidden="true" /><span>{folder?.name ?? t("folders.unfiled")}</span></Link>}
          <button type="button" onClick={toggleFolderRail} aria-label={t(folderRailOpen ? "session.collapseFolders" : "session.expandFolders")} title={t(folderRailOpen ? "session.collapseFolders" : "session.expandFolders")}>{folderRailOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</button>
        </div>
        {folderRailOpen && <>
          <div className="folder-rail-title">{t("session.materialCount")} <span>{folderSessions.length}</span></div>
          <nav aria-label={t("session.folderMaterials")}>
            {folderSessions.map((item) => <Link key={item.id} href={`/admin/session/${item.id}`} className={item.id === session.id ? "active" : ""} aria-current={item.id === session.id ? "page" : undefined}><span className="folder-rail-thumb"><SlideCanvas slide={item.slides[0]} compact /></span><span><b>{item.title}</b><small>{item.slides.length} {t("common.slide")}</small></span></Link>)}
          </nav>
        </>}
      </aside>
      <main className="session-admin-main">
        <div className="workspace-tabs">
          <b className="workspace-title" title={session.title}>{session.title}</b>
          <div className="session-status">
            <span className={`session-state-badge ${live ? "live" : ""}`}><i aria-hidden="true" />{t(live ? "session.liveLabel" : "session.notStartedLabel")}{live && liveElapsed && <time aria-label={t("session.liveElapsed", { time: liveElapsed })}>{liveElapsed}</time>}</span>
            {live && <span className="session-audience"><Image src="/assets/design/participants.svg" width={14} height={14} alt="" />{t("session.audienceCount", { count: audienceCount })}</span>}
          </div>
          <div className="top-actions">
            {!live && session.questions.length > 0 && <Link className="btn secondary" href={`/admin/session/${session.id}/report`}>{t("report.title")}</Link>}
            <button type="button" className="btn secondary" onClick={openShare}><QrCode aria-hidden="true" />{t("session.joinQr")}</button>
            {lectureRemoteAvailable && <button type="button" className="btn secondary" onClick={() => setRemoteOpen(true)}><Smartphone aria-hidden="true" />{t("session.remote")}</button>}
            <button type="button" className={`btn ${live ? "primary" : "secondary"} presentation-launch`} onClick={openPresentation} title={t("session.openSlideshow")}><Monitor aria-hidden="true" />{t("session.openPresentation")}</button>
            <span className="top-actions-divider" aria-hidden="true" />
            <button type="button" className={`btn ${live ? "lecture-end" : "primary"}`} disabled={lectureSaving} onClick={toggleStatus}>{live ? <><Square aria-hidden="true" />{t("session.endLecture")}</> : <><Play aria-hidden="true" />{t(lectureSaving ? "folders.startingLive" : "session.startLecture")}</>}</button>
          </div>
        </div>
        {presentationError
          ? <div className="login-error" role="alert">{presentationError}</div>
          : actionError && <div className="login-error" role="alert">{actionError} {t("common.tryAgain")}</div>}

        {tab === "live" ? (
          <div className="player-workspace" ref={playerWorkspaceRef}>
            <section className="player-stage">
              <header className="mobile-remote-heading">
                <h1>{t("session.mobileRemote")}</h1>
                <p>{session.title}</p>
              </header>
              <div className="stage-toolbar">
                <div className="stage-toolbar-status"><span className={`status-dot ${session.status}`} /><b title={session.title}>{session.title}</b></div>
                <div className="stage-toolbar-actions">
                  <PresentationControls controller={controller} />
                </div>
              </div>
              <div className="stage-canvas-wrap" onWheel={handleSlideWheel} onClick={(event) => { if (!(event.target as Element).closest("button, [role='dialog']")) selectQuestion(null); }}>
                <SlideCanvas slide={slide} questions={slideQuestions} liveQuestionId={controller.liveQuestionId} selectedId={selected?.id} onSelectPin={(id) => expandedIds?.includes(id) ? highlightPin(id) : selectQuestion(selected?.id === id ? null : id)} onSelectCluster={(ids) => { selectQuestion(null); openCluster(ids); }} expandedIds={expandedIds} highlightedId={highlightedId ?? selected?.id} dimmed={Boolean(expandedIds) || selected?.slideIndex === session.currentSlide} showQuestionLabels={showQuestionLabels} showPins={session.showQuestionPins}>
                  {clusterQuestions.length > 0 && <PinClusterPopover key={expandedIds!.join("|")} questions={clusterQuestions} folder={controller.folder ?? null} highlightedId={highlightedId} onHighlight={highlightPin} onClose={closeCluster} />}
                </SlideCanvas>
              </div>
              <nav className="player-controls" aria-label={t("session.slideNavigation")}>
                <label className="slide-page-picker">
                  <span className="sr-only">{t("session.slideNumberInput", { count: session.slides.length })}</span>
                  <input key={slide.id} type="number" inputMode="numeric" min={1} max={session.slides.length} defaultValue={session.currentSlide + 1} onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} onInput={(event) => setPageDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Escape") setPageDraft(""); handleSlidePageKeyDown(event); }} onBlur={(event) => { setPageDraft(""); resetSlidePageInput(event.currentTarget); }} />
                  <span aria-hidden="true">/ {session.slides.length}</span>
                  {pageTarget !== null && pageTarget !== session.currentSlide && <span className="slide-page-hint" role="status"><kbd>Enter ↵</kbd>{t("session.goToPage", { number: pageTarget + 1 })}</span>}
                </label>
              </nav>
              <button type="button" className="mobile-remote-questions" onClick={openMobileQuestions}>
                <MessageCircleQuestion aria-hidden="true" />
                <span>{t("session.questionList")}</span>
                <b>{slideQuestions.length}</b>
              </button>
              <section className="mobile-remote-settings" aria-label={t("session.mobileRemoteSettings")}>
                <div className="mobile-remote-setting">
                  <span>{t("session.pinLive")}</span>
                  <SessionToggle
                    checked={session.showQuestionPins}
                    label={t(session.showQuestionPins ? "session.turnPinsOff" : "session.turnPinsOn")}
                    onClick={toggleQuestionPins}
                  />
                </div>
                <div className="mobile-remote-setting">
                  <span>{t("session.presentationAutoplay")}</span>
                  <SessionToggle
                    checked={session.presentationAutoplay}
                    label={t(session.presentationAutoplay ? "session.turnAutoplayOff" : "session.turnAutoplayOn")}
                    onClick={togglePresentationAutoplay}
                  />
                </div>
                <div className="mobile-remote-setting">
                  <label htmlFor="mobile-remote-qr-placement">{t("session.qrPosition")}</label>
                  <select
                    id="mobile-remote-qr-placement"
                    value={session.showPresentationQr ? session.presentationQrPosition : "hidden"}
                    onChange={(event) => changePresentationQrPlacement(event.target.value)}
                  >
                    <option value="hidden">{t("session.qrHidden")}</option>
                    <option value="top-right">{t("session.qrTopRight")}</option>
                    <option value="top-left">{t("session.qrTopLeft")}</option>
                    <option value="bottom-right">{t("session.qrBottomRight")}</option>
                    <option value="bottom-left">{t("session.qrBottomLeft")}</option>
                  </select>
                </div>
              </section>
              <div className="filmstrip-row">
                <button type="button" className="filmstrip-arrow" disabled={session.currentSlide === 0} onClick={() => changeSlide(session.currentSlide - 1)} aria-label={t("session.previousSlide")}><ChevronLeft aria-hidden="true" /></button>
                <div className="filmstrip" ref={filmstripRef}>{session.slides.map((item, index) => {
                  const questionCount = questionsBySlide.get(index)?.length ?? 0;
                  return <div key={item.id} className={`filmstrip-item ${index === session.currentSlide ? "active" : ""}`}>
                    <button type="button" className="filmstrip-thumb" aria-current={index === session.currentSlide ? "page" : undefined} aria-label={t("common.slideLabel", { number: index + 1 })} onClick={() => changeSlide(index)}><SlideCanvas slide={item} compact /><span aria-hidden="true">{index + 1}</span></button>
                    {questionCount > 0 && <i aria-hidden="true">{questionCount}</i>}
                    <button type="button" className="filmstrip-more" popoverTarget="slide-page-menu" aria-label={t("session.slideMenu", { number: index + 1 })} onClick={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      const menu = document.getElementById("slide-page-menu");
                      if (menu) Object.assign(menu.style, { left: `${box.left}px`, top: `${box.top - 6}px` });
                      setMenuSlideId(item.id);
                    }}><MoreHorizontal aria-hidden="true" /></button>
                  </div>;
                })}</div>
                <button type="button" className="filmstrip-arrow" disabled={session.currentSlide === session.slides.length - 1} onClick={() => changeSlide(session.currentSlide + 1)} aria-label={t("session.nextSlide")}><ChevronRight aria-hidden="true" /></button>
              </div>
              <div id="slide-page-menu" popover="auto" className="slide-page-menu" role="menu" aria-label={t("session.slideMenu", { number: (session.slides.findIndex((item) => item.id === menuSlideId) + 1) || 1 })}>
                <button type="button" role="menuitem" disabled={session.slides.length <= 1} title={t(session.slides.length <= 1 ? "session.deleteLastSlideHint" : "session.deleteSlideHint")} onClick={(event) => { event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); if (menuSlideId) openDeleteSlide(menuSlideId); }}><Trash2 aria-hidden="true" />{t("session.deletePage")}</button>
              </div>
              <section className="stage-speaker-note" aria-labelledby="speaker-note-label">
                <div
                  className="speaker-note-resizer"
                  role="separator"
                  aria-orientation="horizontal"
                  aria-controls="speaker-note"
                  aria-label={t("session.resizeSpeakerNotes")}
                  aria-valuemin={NOTE_MIN_HEIGHT}
                  aria-valuenow={noteHeight}
                  tabIndex={0}
                  onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.y = String(event.clientY); }}
                  onPointerMove={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                    resizeNote(Number(event.currentTarget.dataset.y) - event.clientY);
                    event.currentTarget.dataset.y = String(event.clientY);
                  }}
                  onKeyDown={(event) => { const delta = { ArrowUp: 18, ArrowDown: -18 }[event.key]; if (delta) { event.preventDefault(); resizeNote(delta); } }}
                />
                <FileText aria-hidden="true" />
                <b id="speaker-note-label">{t("session.notes")}</b>
                <textarea
                  id="speaker-note"
                  rows={2}
                  style={{ height: noteHeight }}
                  aria-labelledby="speaker-note-label"
                  aria-describedby="speaker-note-status"
                  value={noteDraft}
                  maxLength={10000}
                  placeholder={t("session.speakerNotesHint")}
                  onChange={(event) => changeNoteDraft(event.target.value)}
                  onBlur={saveNoteOnBlur}
                />
                <small id="speaker-note-status" role="status" aria-live="polite">{noteStatus}</small>
                <label htmlFor="speaker-note" className="speaker-note-edit" title={t("session.speakerNotesSlide", { number: session.currentSlide + 1 })}><Pencil aria-hidden="true" /><span className="sr-only">{t("session.speakerNotesSlide", { number: session.currentSlide + 1 })}</span></label>
              </section>
              <div className="lecture-started-toast-region" role="status">{startedToast && <div className="lecture-started-toast"><span><Check aria-hidden="true" /></span>{t("session.lectureStartedToast")}</div>}</div>
            </section>
            <aside className="live-questions">
              <>
              <div
                className="question-panel-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label={t("session.resizeQuestions")}
                aria-valuemin={MIN_QUESTION_PANEL}
                aria-valuemax={MAX_QUESTION_PANEL}
                aria-valuenow={questionPanelWidth}
                tabIndex={0}
                onPointerDown={startQuestionPanelResize}
                onPointerMove={resizeQuestionPanel}
                onPointerUp={finishQuestionPanelResize}
                onPointerCancel={cancelQuestionPanelResize}
                onKeyDown={resizeQuestionPanelByKeyboard}
              ><GripVertical /></div>
                <div className="panel-heading">
                <h2>{t("session.liveQuestions")}</h2>
                </div>
                <div className="question-panel-tabs" role="tablist" aria-label={t("session.questionScope")}><button type="button" role="tab" aria-selected={questionScope === "slide"} onClick={() => setQuestionScope("slide")}>{t("session.thisSlide")} {slideQuestions.length}</button><button type="button" role="tab" aria-selected={questionScope === "all"} onClick={() => setQuestionScope("all")}>{t("common.all")} {session.questions.length}</button></div><button type="button" className="question-sort" popoverTarget="question-sort-menu" aria-haspopup="menu" aria-label={`${t("student.sortQuestions")}: ${t(questionSort === "empathy" ? "student.sortByEmpathy" : "student.sortByNewest")}`} onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const menu = document.getElementById("question-sort-menu");
                  if (menu) Object.assign(menu.style, { left: `${Math.max(8, Math.min(box.right - 150, window.innerWidth - 158))}px`, top: `${Math.max(8, Math.min(box.bottom + 6, window.innerHeight - 98))}px` });
                }}>{t(questionSort === "empathy" ? "student.sortByEmpathy" : "student.sortByNewest")}<ChevronDown aria-hidden="true" /></button>
                <div id="question-sort-menu" popover="auto" className="question-sort-menu" role="menu" aria-label={t("student.sortQuestions")} onToggle={(event) => { if (event.newState === "open") event.currentTarget.querySelector<HTMLElement>("[aria-checked=true]")?.focus(); }} onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                  event.preventDefault();
                  const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
                  const index = items.indexOf(document.activeElement as HTMLElement);
                  items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
                }}>
                  {(["empathy", "latest"] as const).map((sort) => <button key={sort} type="button" role="menuitemradio" aria-checked={questionSort === sort} onClick={(event) => { setQuestionSort(sort); event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); document.querySelector<HTMLButtonElement>(".question-sort")?.focus(); }}>
                    <span aria-hidden="true">{questionSort === sort ? "✓" : ""}</span>{t(sort === "empathy" ? "student.sortByEmpathy" : "student.sortByNewest")}
                  </button>)}
                </div>
                <div className="question-stack">{slideQuestions.length > 0 && <QuestionSummary questions={slideQuestions} folder={controller.folder ?? null} className="slide-question-summary" refreshKey={controller.slide?.id} />}{panelQuestions.length ? panelQuestions.map((q) => <QuestionCard key={q.id} question={q} selected={selected?.id === q.id} onClick={() => selectQuestionFromList(q.id, q.slideIndex)} />) : <div className={`no-questions ${live ? "live" : ""}`}><span><MessageCircleQuestion aria-hidden="true" /></span><b>{t(live ? "session.waitingQuestions" : "session.waitingFirstQuestion")}</b><small>{t(live ? "session.waitingQuestionsHint" : "session.waitingFirstQuestionHint")}</small></div>}</div></>
              <div className="live-question-reactions" aria-hidden="true">
                {liveReactions.map((reaction) => <span key={reaction.id} style={{ left: `${reaction.left}%`, animationDelay: `${reaction.delay}ms` }}>{reaction.emoji}</span>)}
              </div>
            </aside>
          </div>
        ) : (
          <div className="questions-page">
            <div className="questions-header"><div><h1>{t("session.questionList")}</h1><p>{t("session.questionsDescription")}</p></div><div className="kpi-inline"><span><b>{questionCounts.total}</b>{t("session.totalQuestions")}</span><span><b>{questionCounts.unanswered}</b>{t("status.unanswered")}</span><span><b>{questionCounts.resolved}</b>{t("status.resolved")}</span></div></div>
            <div className="filterbar"><div className="searchbox"><Search /><input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder={t("session.searchQuestions")} /></div><div className="filter-tabs">{(["all", "unanswered", "answered", "resolved"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => changeFilter(item)}>{item === "all" ? t("common.all") : item === "unanswered" ? t("status.unanswered") : item === "answered" ? t("status.answered") : t("status.resolved")}</button>)}</div><button className="btn secondary"><ListFilter />{t("common.filter")}</button></div>
            <div className="question-table"><div className="table-head"><span>{t("common.slide")}</span><span>{t("common.question")}</span><span>{t("common.status")}</span><span>{t("common.createdAt")}</span><span /></div>{visibleQuestions.map((q) => <button className="table-row" key={q.id} onClick={() => selectQuestionFromList(q.id, q.slideIndex)}><span className="slide-cell"><b>{q.slideIndex + 1}</b><small>Slide {q.slideIndex + 1}</small></span><span className="question-text">{q.text}</span><span><StatusBadge status={q.status} /></span><span className="muted">{timeAgo(q.createdAt)}</span><span><ChevronRight /></span></button>)}</div>
          </div>
        )}
      </main>

      {deleteTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDeleteSlide(); }}>
        <section className="delete-slide-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-slide-title" aria-describedby="delete-slide-description">
          <button type="button" className="modal-close" disabled={deletingSlide} onClick={closeDeleteSlide} aria-label={t("common.cancel")}><X /></button>
          <span className="delete-slide-icon"><Trash2 /></span>
          <h2 id="delete-slide-title">{t("session.deleteSlideTitle")}</h2>
          <p id="delete-slide-description">{t("session.deleteSlideDescription", { number: deleteTarget.pageIndex + 1 })}</p>
          <div className="delete-slide-preview"><SlideCanvas slide={deleteTarget} compact /><span>{deleteTarget.pageIndex + 1}</span></div>
          <div className="delete-slide-warning"><b>{t("session.deleteSlideWarning")}</b>{deleteTargetQuestionCount > 0 && <span>{t("session.deleteSlideQuestions", { count: deleteTargetQuestionCount })}</span>}</div>
          {deleteSlideError && <div className="login-error" role="alert">{deleteSlideError} {t("common.tryAgain")}</div>}
          <div className="delete-slide-actions">
            <button type="button" className="btn secondary" disabled={deletingSlide} onClick={closeDeleteSlide}>{t("common.cancel")}</button>
            <button type="button" className="btn destructive" disabled={deletingSlide} onClick={confirmDeleteSlide}>{deletingSlide ? <><span className="spinner" />{t("session.deletingSlide")}</> : <><Trash2 />{t("session.deleteSlideConfirm")}</>}</button>
          </div>
        </section>
      </div>}
      {shareOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeShare(); }}>
        <section className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title" aria-describedby="share-description" onKeyDown={(event) => { trapDialogFocus(event); if (event.key === "Escape") closeShare(); }}>
          <h2 id="share-title">{t("session.joinQrTitle")}</h2>
          <p id="share-description">{t("session.joinQrDescription")}</p>
          <div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} bgColor="transparent" fgColor="currentColor" /></div>
          <div className="session-code"><span>{t("session.joinCode")}</span><b>{session.code}</b></div>
          <div className="link-copy"><span>{joinUrl.replace(/^https?:\/\//, "")}</span><button type="button" className="btn primary" onClick={copyJoinLink}>{copied ? <><Check aria-hidden="true" />{t("session.copied")}</> : t("session.copyLink")}</button></div>
          <div className="share-actions"><button type="button" className="btn secondary" onClick={() => { closeShare(); openPresentation(); }}>{t("session.showQrOnPresentation")}</button><button type="button" className="btn secondary" autoFocus onClick={closeShare}>{t("common.close")}</button></div>
        </section>
      </div>}
      {remoteOpen && <RemoteDialog key={session.id} sessionId={session.id} onClose={() => setRemoteOpen(false)} />}
      {mobileQuestionsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMobileQuestions(); }}>
        <section className="mobile-questions-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-questions-title">
          <button type="button" className="modal-close" onClick={closeMobileQuestions} aria-label={t("session.closeQuestions")}><X /></button>
          <div className="panel-heading"><div><h2 id="mobile-questions-title">{t("session.liveQuestions")}</h2><p>{t("common.currentQuestionsCount", { count: slideQuestions.length })}</p></div></div>
          <div className="question-stack">{slideQuestions.length ? slideQuestions.map((q) => <QuestionCard key={q.id} question={q} onClick={() => { selectQuestion(q.id); closeMobileQuestions(); }} />) : <div className="no-questions"><MessageCircleQuestion /><b>{t("session.noQuestions")}</b><span>{t("session.noQuestionsHint1")}<br />{t("session.noQuestionsHint2")}</span></div>}</div>
        </section>
      </div>}
    </div>
    {endConfirmOpen && <div className={styles.root}><div className="modal-backdrop">
      <section className="end-lecture-modal" role="alertdialog" aria-modal="true" aria-labelledby="end-confirm-title" aria-describedby="end-confirm-description" onKeyDown={(event) => { trapDialogFocus(event); if (event.key === "Escape" && !lectureSaving) closeEndConfirm(); }}>
        <h2 id="end-confirm-title">{t("report.endConfirm")}</h2>
        <p id="end-confirm-description">{t("report.endDescription")}</p>
        <dl className="end-lecture-summary">{liveElapsed && <div><dt>{t("report.endElapsed")}</dt><dd>{liveElapsed}</dd></div>}<div><dt>{t("report.endAudience")}</dt><dd>{t("report.endAudienceCount", { count: audienceCount })}</dd></div><div><dt>{t("common.question")}</dt><dd>{t("report.endQuestionCount", { count: session.questions.length })}</dd></div></dl>
        {actionError && <p className="end-lecture-error" role="alert">{actionError}</p>}
        <div className="end-lecture-actions"><button type="button" autoFocus className="btn secondary" disabled={lectureSaving} onClick={closeEndConfirm}>{t("report.endContinue")}</button><button type="button" className="btn destructive" disabled={lectureSaving} onClick={confirmEnd}>{lectureSaving ? <span className="spinner" /> : t("report.endAndView")}</button></div>
      </section>
    </div></div>}
  </>;
}
