"use client";

import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import fileListIcon from "@/assets/icons/file_list_icon.svg";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clock3, Copy, FileText, GripVertical, Link2, ListFilter, MessageCircleQuestion, MonitorUp, PanelLeftClose, PanelLeftOpen, Pause, Play, Plus, QrCode, Search, Share2, Trash2, Users, X } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import { LoadingScreen } from "@/app/component/loading-screen";
import { QuestionDetailDialog } from "./component/question-detail-dialog";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { StatusBadge } from "@/app/component/status-badge";
import { MAX_QUESTION_PANEL, MIN_QUESTION_PANEL, useSessionAdminController } from "./controller";
import styles from "./page.module.css";
import { configuredQuestionCategories, enabledQuestionCategories, isValidQuestionCategorySettings, QUESTION_CATEGORY_LABEL_MAX, QUESTION_CATEGORY_MAX, questionCategoryClass, questionCategoryLabel, questionMarkerEmoji, type PresentationQrPosition, type Question, type QuestionCategory, type QuestionCategorySettings } from "@/app/_model/types";

export default function SessionAdmin() {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const {
    ready, session, slide, folder, folderAccentIndex, folderHref, folderSessions, slideQuestions,
    selected, detailQuestion, visibleQuestions, tab, filter, query, shareOpen, answer, copied,
    actionError, lectureSaving, presentationError, folderRailOpen, questionPanelWidth, noteDraft,
    noteDirty, noteSavingSlideId, noteSavedSlideId, addingSlides, deleteTarget, deletingSlide,
    deleteSlideError, deleteTargetQuestionCount, joinUrl, playerWorkspaceRef, filmstripRef,
    slideInputRef, handleSlideWheel, showLive, showQuestions, toggleFolderRail, openShare,
    closeShare, changeAnswer, changeQuery, changeFilter, openQuestionDetail, closeQuestionDetail,
    selectQuestionFromList, changeSlide, toggleStatus, toggleQuestionPins,
    togglePresentationInteractions, togglePresentationQr, changePresentationQrPosition,
    saveQuestionCategories, reportActionError, submitAnswer, resolveSelectedQuestion,
    saveCurrentSlideNote, changeNoteDraft, saveNoteByKeyboard, addSlideImages, openDeleteSlide,
    closeDeleteSlide, confirmDeleteSlide, startQuestionPanelResize, resizeQuestionPanel,
    finishQuestionPanelResize, cancelQuestionPanelResize, resizeQuestionPanelByKeyboard,
    openPresentation, copyJoinLink, goHome
  } = useSessionAdminController();

  if (!ready) return <LoadingScreen />;
  if (!session || !slide) return <div className={`${styles.root} empty-state`}><h1>{t("session.notFound")}</h1><button className="btn primary" onClick={goHome}>{t("common.home")}</button></div>;

  const categoryLabel = (category: QuestionCategory) => questionCategoryLabel(session.questionCategories, category, defaultCategoryLabel);
  const categoryClass = (category: QuestionCategory) => questionCategoryClass(session.questionCategories, category);
  const qrPositions: PresentationQrPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const qrPositionLabel = (position: PresentationQrPosition) => position === "top-left"
    ? t("session.qrTopLeft")
    : position === "top-right"
      ? t("session.qrTopRight")
      : position === "bottom-left"
        ? t("session.qrBottomLeft")
        : t("session.qrBottomRight");
  return <>
    <div
      className={`${styles.root} session-admin-shell ${folderRailOpen ? "" : "folder-rail-collapsed"}`}
      style={{ "--question-panel-width": `${questionPanelWidth}px` } as React.CSSProperties}
      inert={lectureSaving}
      aria-busy={lectureSaving}
    >
      <aside className={`session-folder-rail folder-accent-${folderAccentIndex}`}>
        <div className="folder-rail-head">
          {folderRailOpen && <Link href={folderHref}><ArrowLeft />{t("session.backToFolder")}</Link>}
          <button type="button" onClick={toggleFolderRail} aria-label={t(folderRailOpen ? "session.collapseFolders" : "session.expandFolders")} title={t(folderRailOpen ? "session.collapseFolders" : "session.expandFolders")}>{folderRailOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</button>
        </div>
        {folderRailOpen && <>
          <div className="folder-rail-title"><span className="folder-rail-file-icon" style={{ "--folder-file-list-icon": `url(${fileListIcon.src})` } as React.CSSProperties} aria-hidden="true" /><span><small>{t("session.folderMaterials")}</small><b>{folder?.name ?? t("folders.unfiled")}</b></span></div>
          <nav aria-label={t("session.folderMaterials")}>
            {folderSessions.map((item) => <Link key={item.id} href={`/admin/session/${item.id}`} className={item.id === session.id ? "active" : ""} aria-current={item.id === session.id ? "page" : undefined}><span className="folder-rail-thumb"><SlideCanvas slide={item.slides[0]} compact /></span><span><b>{item.title}</b><small>{item.slides.length} {t("common.slide")}</small></span></Link>)}
          </nav>
        </>}
      </aside>
      <main className="session-admin-main">
        <div className="workspace-tabs">
          <button className={tab === "live" ? "active" : ""} onClick={showLive}><svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2.803a1 1 0 0 1 1.5-.865l9 5.195a1 1 0 0 1 0 1.733l-9 5.196a1 1 0 0 1-1.5-.866z" /></svg>{t("session.livePlayer")}<span>{session.questions.filter((q) => q.status === "unanswered").length}</span></button>
          <button className={tab === "questions" ? "active" : ""} onClick={showQuestions}><MessageCircleQuestion />{t("session.questionList")}<span>{session.questions.length}</span></button>
          <div className="top-actions"><span className={`session-state-badge ${session.status}`}><i />{t(session.status === "live" ? "session.liveLabel" : "session.stoppedLabel")}</span><button className="btn secondary" onClick={toggleStatus}>{session.status === "live" ? <><Pause />{t("session.end")}</> : <><Play />{t("session.restart")}</>}</button><button className="btn secondary" onClick={openShare}><Share2 />{t("session.joinLink")}</button><button className="btn primary presentation-launch" onClick={openPresentation} title={t("session.openSlideshow")}><MonitorUp />{t("session.slideshow")}</button></div>
        </div>
        {presentationError
          ? <div className="login-error" role="alert">{presentationError}</div>
          : actionError && <div className="login-error" role="alert">{actionError} {t("common.tryAgain")}</div>}

        {tab === "live" ? (
          <div className="player-workspace" ref={playerWorkspaceRef}>
            <section className="player-stage">
              <div className="stage-toolbar">
                <div className="stage-toolbar-status"><span className={`status-dot ${session.status}`} /><b title={session.title}>{session.title}</b><span className="stage-sync-label">{t(session.status === "live" ? "session.syncing" : "session.stoppedLabel")}</span></div>
                <div className="stage-toolbar-actions">
                  <span>{session.currentSlide + 1} / {session.slides.length}</span>
                  <input ref={slideInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" multiple hidden onChange={addSlideImages} />
                  <button type="button" className="stage-add-slides" disabled={addingSlides} onClick={() => slideInputRef.current?.click()} title={t("session.addSlidesHint")}>
                    {addingSlides ? <span className="spinner" /> : <Plus />}
                    <span>{t(addingSlides ? "session.addingSlides" : "session.addSlides")}</span>
                  </button>
                  <button type="button" className="stage-add-slides stage-delete-slide" disabled={session.slides.length <= 1 || addingSlides} onClick={() => openDeleteSlide(slide.id)} title={t(session.slides.length <= 1 ? "session.deleteLastSlideHint" : "session.deleteSlideHint")}>
                    <Trash2 />
                    <span>{t("session.deleteSlide")}</span>
                  </button>
                </div>
              </div>
              <div className="stage-canvas-wrap" onWheel={handleSlideWheel}><SlideCanvas slide={slide} questions={slideQuestions} questionCategories={session.questionCategories} selectedId={selected?.id} onSelectPin={openQuestionDetail} showPins={session.showQuestionPins} /></div>
              <div className="player-controls"><button className="icon-btn" disabled={session.currentSlide === 0} onClick={() => changeSlide(session.currentSlide - 1)} aria-label={t("session.previousSlide")}><ChevronLeft /></button><div className="slide-dots">{session.slides.map((_, i) => <button key={i} className={i === session.currentSlide ? "active" : ""} onClick={() => changeSlide(i)} aria-label={t("common.slideNumber", { number: i + 1 })} />)}</div><button className="icon-btn" disabled={session.currentSlide === session.slides.length - 1} onClick={() => changeSlide(session.currentSlide + 1)} aria-label={t("session.nextSlide")}><ChevronRight /></button></div>
              <div className="filmstrip" ref={filmstripRef}>{session.slides.map((item, index) => <button key={item.id} className={index === session.currentSlide ? "active" : ""} aria-current={index === session.currentSlide ? "page" : undefined} onClick={() => changeSlide(index)}><SlideCanvas slide={item} compact /><span>{index + 1}</span>{session.questions.some((q) => q.slideIndex === index) && <i>{session.questions.filter((q) => q.slideIndex === index).length}</i>}</button>)}</div>
              <section className="stage-speaker-note" aria-labelledby="speaker-note-label">
                <div className="stage-speaker-note-head"><span><FileText /><b id="speaker-note-label">{t("session.speakerNotesSlide", { number: session.currentSlide + 1 })}</b></span><small><Check />{t("session.speakerNotesPrivate")}</small></div>
                <textarea
                  id="speaker-note"
                  aria-labelledby="speaker-note-label"
                  value={noteDraft}
                  maxLength={10000}
                  placeholder={t("session.speakerNotesHint")}
                  onChange={(event) => changeNoteDraft(event.target.value)}
                  onKeyDown={saveNoteByKeyboard}
                />
                <div className="stage-speaker-note-actions"><span>{noteDraft.length.toLocaleString()} / 10,000 · {t("session.speakerNotesShortcut")}</span><button type="button" className="btn primary speaker-note-save" disabled={!noteDirty || noteSavingSlideId === slide.id} onClick={saveCurrentSlideNote}>{noteSavingSlideId === slide.id ? <><span className="spinner" />{t("session.speakerNotesSaving")}</> : noteSavedSlideId === slide.id && !noteDirty ? <><Check />{t("session.speakerNotesSaved")}</> : <><FileText />{t("session.speakerNotesSave")}</>}</button></div>
              </section>
            </section>
            <aside className="live-questions">
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
                <div><h2>{t("session.liveQuestions")}</h2><p>{t("common.currentQuestionsCount", { count: slideQuestions.length })}</p></div>
                <div className="panel-heading-actions">
                  <span className="session-toggle-label">{t("session.showPins")}</span>
                  <button
                    type="button"
                    className={`session-toggle ${session.showQuestionPins ? "on" : ""}`}
                    role="switch"
                    aria-checked={session.showQuestionPins}
                    aria-label={session.showQuestionPins ? t("session.turnPinsOff") : t("session.turnPinsOn")}
                    onClick={toggleQuestionPins}
                  >
                    <span className="session-toggle-thumb" />
                    <span className="session-toggle-state">{session.showQuestionPins ? "ON" : "OFF"}</span>
                  </button>
                  <span className="pulse-dot" aria-hidden="true" />
                </div>
                </div>
                <section className="qr-position-setting" aria-labelledby="presentation-mode-title">
                <div className="qr-position-heading">
                  <span><MonitorUp /></span>
                  <div><b id="presentation-mode-title">{t("session.presentationMode")}</b><small>{t("session.presentationModeHint")}</small></div>
                  <div className="panel-heading-actions">
                    <span className="session-toggle-label">{t(session.presentationInteractions ? "session.interactiveMode" : "session.slidesOnlyMode")}</span>
                    <button
                      type="button"
                      className={`session-toggle ${session.presentationInteractions ? "on" : ""}`}
                      role="switch"
                      aria-checked={session.presentationInteractions}
                      aria-label={session.presentationInteractions ? t("session.disableInteractions") : t("session.enableInteractions")}
                      onClick={togglePresentationInteractions}
                    >
                      <span className="session-toggle-thumb" />
                      <span className="session-toggle-state">{session.presentationInteractions ? "ON" : "OFF"}</span>
                    </button>
                  </div>
                </div>
                </section>
                <section className="qr-position-setting" aria-labelledby="qr-position-title">
                <div className="qr-position-heading">
                  <span><QrCode /></span>
                  <div><b id="qr-position-title">{t("session.qrPosition")}</b><small>{t("session.qrPositionHint")}</small></div>
                  <div className="panel-heading-actions">
                    <span className="session-toggle-label">{t("presentation.showQr")}</span>
                    <button
                      type="button"
                      className={`session-toggle ${session.showPresentationQr ? "on" : ""}`}
                      role="switch"
                      aria-checked={session.showPresentationQr}
                      aria-label={session.showPresentationQr ? t("presentation.turnQrOff") : t("presentation.turnQrOn")}
                      onClick={togglePresentationQr}
                    >
                      <span className="session-toggle-thumb" />
                      <span className="session-toggle-state">{session.showPresentationQr ? "ON" : "OFF"}</span>
                    </button>
                  </div>
                </div>
                <div className="qr-position-options" role="group" aria-label={t("session.qrPosition")}>
                  {qrPositions.map((position) => (
                    <button
                      type="button"
                      key={position}
                      className={session.presentationQrPosition === position ? "active" : ""}
                      aria-pressed={session.presentationQrPosition === position}
                      onClick={() => changePresentationQrPosition(position)}
                    >
                      <span className={`qr-corner-preview ${position}`} aria-hidden="true"><i /></span>
                      {qrPositionLabel(position)}
                    </button>
                  ))}
                </div>
                </section>
                <div className="question-stack">{slideQuestions.length ? slideQuestions.map((q) => <QuestionCard key={q.id} question={q} questionCategories={session.questionCategories} selected={selected?.id === q.id} onClick={() => openQuestionDetail(q.id)} />) : <div className="no-questions"><MessageCircleQuestion /><b>{t("session.noQuestions")}</b><span>{t("session.noQuestionsHint1")}<br />{t("session.noQuestionsHint2")}</span></div>}</div>
                {selected && <div className="answer-box">
                {selected.answer && <div className="saved-answer"><span>{t("session.latestAnswer")}</span><p>{selected.answer}</p></div>}
                <label htmlFor="answer">{selected.answer ? t("session.additionalAnswer") : t("session.quickAnswer")}</label>
                <textarea id="answer" value={answer} onChange={(event) => changeAnswer(event.target.value)} placeholder={t("session.answerPlaceholder")} />
                <div className="answer-actions"><button className="btn tertiary" onClick={resolveSelectedQuestion}><Check />{t("session.resolve")}</button><button className="btn primary" onClick={submitAnswer}>{t("session.sendAnswer")}</button></div>
                </div>}
            </aside>
          </div>
        ) : (
          <div className="questions-page">
            <div className="questions-header"><div><h1>{t("session.questionList")}</h1><p>{t("session.questionsDescription")}</p></div><div className="kpi-inline"><span><b>{session.questions.length}</b>{t("session.totalQuestions")}</span><span><b>{session.questions.filter((q) => q.status === "unanswered").length}</b>{t("status.unanswered")}</span><span><b>{session.questions.filter((q) => q.status === "resolved").length}</b>{t("status.resolved")}</span></div></div>
            <QuestionCategoryManager
              key={JSON.stringify(session.questionCategories)}
              initialSettings={session.questionCategories}
              usedCategories={session.questions.map((question) => question.category)}
              onSave={saveQuestionCategories}
              onError={reportActionError}
            />
            <div className="filterbar"><div className="searchbox"><Search /><input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder={t("session.searchQuestions")} /></div><div className="filter-tabs">{(["all", "unanswered", "answered", "resolved"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => changeFilter(item)}>{item === "all" ? t("common.all") : item === "unanswered" ? t("status.unanswered") : item === "answered" ? t("status.answered") : t("status.resolved")}</button>)}</div><button className="btn secondary"><ListFilter />{t("common.filter")}</button></div>
            <div className="question-table"><div className="table-head"><span>{t("common.slide")}</span><span>{t("common.question")}</span><span>{t("common.category")}</span><span>{t("common.status")}</span><span>{t("common.createdAt")}</span><span /></div>{visibleQuestions.map((q) => <button className="table-row" key={q.id} onClick={() => selectQuestionFromList(q.id, q.slideIndex)}><span className="slide-cell"><b>{q.slideIndex + 1}</b><small>Slide {q.slideIndex + 1}</small></span><span className="question-text">{q.text}</span><span><em className={`category ${categoryClass(q.category)}`}>{questionMarkerEmoji(q.marker) && <i aria-hidden="true">{questionMarkerEmoji(q.marker)}</i>}{categoryLabel(q.category)}</em></span><span><StatusBadge status={q.status} /></span><span className="muted">{timeAgo(q.createdAt)}</span><span><ChevronRight /></span></button>)}</div>
          </div>
        )}
      </main>

      {detailQuestion && <QuestionDetailDialog question={detailQuestion} questionCategories={session.questionCategories} onClose={closeQuestionDetail} />}
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
      {shareOpen && <div className="modal-backdrop" onMouseDown={closeShare}><div className="share-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={closeShare} aria-label={t("question.closeDetail")}><X /></button><div className="modal-icon"><Users /></div><h2>{t("session.inviteTitle")}</h2><p>{t("session.inviteDescription1")}<br />{t("session.inviteDescription2")}</p><div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} fgColor="#171D26" /></div><div className="session-code"><span>{t("session.joinCode")}</span><b>{session.code}</b></div><div className="link-copy"><Link2 /><span>{joinUrl}</span><button onClick={copyJoinLink} aria-label={t("session.copyJoinLink")}>{copied ? <Check /> : <Copy />}</button></div><button className="btn primary large full" onClick={copyJoinLink}>{copied ? <><Check />{t("session.copied")}</> : <><Copy />{t("session.copyJoinLink")}</>}</button></div></div>}
    </div>
  </>;
}

function QuestionCard({ question, questionCategories, selected, onClick }: { question: Question; questionCategories: QuestionCategorySettings; selected: boolean; onClick: () => void }) {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const label = questionCategoryLabel(questionCategories, question.category, defaultCategoryLabel);
  return <button className={`question-card ${selected ? "selected" : ""}`} onClick={onClick}><div className="question-meta"><div className="question-copy"><span className={`category ${questionCategoryClass(questionCategories, question.category)}`}>{questionMarkerEmoji(question.marker) && <i aria-hidden="true">{questionMarkerEmoji(question.marker)}</i>}{label}</span><p>{question.text}</p></div><span className="question-time"><Clock3 />{timeAgo(question.createdAt)}</span></div>{question.answer && <div className="question-answer"><span>{t("session.myAnswer")}</span><p>{question.answer}</p></div>}<div><StatusBadge status={question.status} />{question.x !== null && <span className="pin-context">{question.anchorKind !== "point" ? t("session.regionQuestion") : t("session.pinQuestion")}</span>}</div></button>;
}

function QuestionCategoryManager({ initialSettings, usedCategories, onSave, onError }: {
  initialSettings: QuestionCategorySettings;
  usedCategories: QuestionCategory[];
  onSave: (settings: QuestionCategorySettings) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const { categoryLabel: defaultCategoryLabel, t } = useLanguage();
  const [settings, setSettings] = useState(initialSettings);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const categories = configuredQuestionCategories(settings);
  const activeCategories = enabledQuestionCategories(settings);
  const label = (category: string) => questionCategoryLabel(settings, category, defaultCategoryLabel);

  const addCategory = () => {
    const categoryLabel = newCategory.trim();
    if (!categoryLabel) return;
    if (categories.length >= QUESTION_CATEGORY_MAX) {
      onError(t("session.questionCategoryLimit", { count: QUESTION_CATEGORY_MAX }));
      return;
    }
    if (categories.some((key) => label(key).toLocaleLowerCase() === categoryLabel.toLocaleLowerCase())) {
      onError(t("session.questionCategoryDuplicate"));
      return;
    }
    setSettings((current) => ({
      ...current,
      [`custom-${crypto.randomUUID()}`]: { label: categoryLabel, enabled: true, archived: false }
    }));
    setNewCategory("");
    onError(null);
  };

  const deleteCategory = (key: string) => {
    setSettings((current) => {
      if (usedCategories.includes(key)) return { ...current, [key]: { ...current[key], enabled: false, archived: true } };
      const next = { ...current };
      delete next[key];
      return next;
    });
    onError(null);
  };

  const save = async () => {
    if (saving) return;
    const next = Object.fromEntries(Object.entries(settings).map(([key, setting]) => [key, { ...setting, label: setting.label.trim() }]));
    if (!isValidQuestionCategorySettings(next)) {
      onError(t("session.questionCategoryInvalid"));
      return;
    }
    onError(null);
    setSaving(true);
    try {
      await onSave(next);
      setSettings(next);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`${t("session.questionCategorySaveError")}: ${detail}`, error);
      onError(t("session.questionCategorySaveError"));
    } finally {
      setSaving(false);
    }
  };

  return <section className="question-category-manager" aria-labelledby="question-category-manager-title">
    <div className="question-category-manager-head">
      <div><b id="question-category-manager-title">{t("session.questionCategoryTitle")}</b><small>{t("session.questionCategoryDescription")}</small></div>
      <button type="button" className="btn primary" onClick={() => void save()} disabled={saving}>{saving ? <span className="spinner" /> : <Check />}{t(saving ? "session.questionCategorySaving" : "session.questionCategorySave")}</button>
    </div>
    <form className="question-category-add" onSubmit={(event) => { event.preventDefault(); addCategory(); }}>
      <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} maxLength={QUESTION_CATEGORY_LABEL_MAX} placeholder={t("session.questionCategoryPlaceholder")} aria-label={t("session.questionCategoryPlaceholder")} disabled={saving || categories.length >= QUESTION_CATEGORY_MAX} />
      <button className="btn secondary" disabled={saving || !newCategory.trim() || categories.length >= QUESTION_CATEGORY_MAX}><Plus />{t("session.questionCategoryAdd")}</button>
    </form>
    <div className="question-category-manager-list">
      {categories.map((key) => <div className={`question-category-manager-row ${settings[key].enabled ? "" : "disabled"}`} key={key}>
        <div className="question-category-manager-row-head">
          <span className={`category ${questionCategoryClass(settings, key)}`}>{label(key)}</span>
          <label><input type="checkbox" checked={settings[key].enabled} onChange={(event) => setSettings((current) => ({ ...current, [key]: { ...current[key], enabled: event.target.checked } }))} aria-label={t("session.questionCategoryUseAria", { category: label(key) })} disabled={saving} />{t("session.questionCategoryUse")}</label>
        </div>
        <label><span>{t("session.questionCategoryDisplayName")}</span><input value={settings[key].label} onChange={(event) => setSettings((current) => ({ ...current, [key]: { ...current[key], label: event.target.value } }))} maxLength={QUESTION_CATEGORY_LABEL_MAX} placeholder={label(key)} aria-label={t("session.questionCategoryDisplayNameAria", { category: label(key) })} disabled={saving} /></label>
        <button type="button" className="icon-btn category-delete" onClick={() => deleteCategory(key)} aria-label={t("session.questionCategoryDelete", { category: label(key) })} disabled={saving}><Trash2 /></button>
      </div>)}
    </div>
    <p>{t(activeCategories.length ? "session.questionCategoryEnabledHint" : "session.questionCategoryInvalid")}</p>
  </section>;
}
