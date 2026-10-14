"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
const pinIcon = { src: "/assets/design/question-pin.svg", width: 32, height: 32 };
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, MapPin, MoreHorizontal, Send, SmilePlus, ThumbsUp, Trash2, X } from "@/app/component/icons";
import { LanguageSwitcher } from "@/app/component/language-switcher";
import { LoadingScreen } from "@/app/component/loading-screen";
import { PinLogo } from "@/app/component/pin-logo";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { Eye, EyeOff } from "lucide-react";
import { trapDialogFocus } from "@/app/_lib/dialog-focus";
import { LECTURE_REACTION_EMOJIS } from "@/app/_model/lecture-reactions";
import { questionMarkerEmoji } from "@/app/_model/types";
import { useJoinSessionController } from "./controller";
import styles from "./page.module.css";

export default function JoinSession() {
  const controller = useJoinSessionController();
  const [tapped, setTapped] = useState(false);

  if (controller.state === "loading") return <LoadingScreen />;
  if (controller.state === "failed") return <div className={`${styles.root} student-empty`}><PinLogo /><p role="alert">{controller.t("common.tryAgain")}</p><button type="button" className="btn primary" onClick={controller.retry}>{controller.t("common.retry")}</button></div>;
  if (controller.state === "missing") return <div className={`${styles.root} student-empty`}><PinLogo /><LanguageSwitcher /><h1>{controller.t("student.sessionNotFound")}</h1><p>{controller.t("student.checkLink")}</p></div>;
  if (controller.state === "ended") return <div className={`${styles.root} student-empty`}><PinLogo /><LanguageSwitcher /><h1>{controller.t("student.sessionEndedTitle")}</h1><p>{controller.t("student.sessionEndedDescription")}</p><Link className="btn primary" href={controller.finalHref}>{controller.t("experience.complete")}</Link></div>;

  const {
    t, timeAgo, finalHref, session, liveReactions, activeTool, slideIndex, current, slide,
    draftQuestion, draftText, editingQuestionId, viewingQuestion, submitting, toast,
    submitError, composerOpen, selectedQuestionId, focusedPins, questionSort, questionScope, setQuestionScope, questionsHidden, setQuestionsHidden, captureShielded, setCaptureShielded, slideQuestions, submittedQuestions,
    pendingReactionIds, reactionError, emojiError, handleSlideWheel, placeDraftTag,
    startEditingQuestion, selectQuestion, updateDraftText, startMovingDraftTag, moveDraftTag,
    finishMovingDraftTag, openDraftComposer, submit, closeComposer,
    selectTool, changeSlide, syncToLiveSlide, selectQuestionSort, toggleQuestionReaction,
    sendEmojiReaction
  } = controller;
  const composing = composerOpen && !viewingQuestion;
  const showCoach = !tapped && !composerOpen && !session.questions.some((question) => question.isMine);

  return (
    <main className={`${styles.root} student-shell student-slide-shell ${composing ? "composing" : ""}`} onPointerDown={() => setTapped(true)}>
      <button type="button" className="student-ask-button btn primary" onClick={() => { selectTool("pin"); placeDraftTag(.5, .5); }}><MapPin aria-hidden="true" />{t("student.askOnSlide")}</button>
      <div className="student-guide class-feedback-guide">
        <div><b>{session.title}<em>{t("session.liveLabel")}</em></b><span>{t("student.feedbackGuide")}</span></div>
        <div className="student-header-actions"><Link className="student-complete-button" href={finalHref}>{t("experience.complete")}</Link><LanguageSwitcher /></div>
      </div>
      <section className="student-stage" aria-label={t("student.slideAria", { title: session.title })} onWheel={handleSlideWheel}>
        <div className="student-image-stage">
          <div className="student-image-viewport" onContextMenu={(event) => event.preventDefault()}>
            <div className={`student-canvas lecture-fit tool-${activeTool}`} style={{ "--student-image-width": "min(100%, calc((100dvh - 180px) * 16 / 9))" } as CSSProperties}>
              <SlideCanvas
                slide={slide}
                questions={focusedPins}
                selectedId={selectedQuestionId}
                onSelectPin={selectQuestion}
                onCanvasClick={activeTool === "pin" ? placeDraftTag : undefined}
                showQuestionLabels
              >
                {showCoach && <span className="participant-coach" aria-hidden="true">👆 {t("student.coachTap")}</span>}
                {draftQuestion && !editingQuestionId && <button
                  className="draft-pin"
                  style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}
                  aria-label={t("student.movePin")}
                  onPointerDown={startMovingDraftTag}
                  onPointerMove={moveDraftTag}
                  onPointerUp={finishMovingDraftTag}
                  onPointerCancel={finishMovingDraftTag}
                  onClick={openDraftComposer}
                  onKeyDown={(event) => { const delta = { ArrowLeft: [-.01, 0], ArrowRight: [.01, 0], ArrowUp: [0, -.01], ArrowDown: [0, .01] }[event.key]; if (delta) { event.preventDefault(); placeDraftTag(Math.max(0, Math.min(1, draftQuestion.x + delta[0])), Math.max(0, Math.min(1, draftQuestion.y + delta[1]))); } }}
                >
                  <Image className="question-pin-icon" src={pinIcon} alt="" aria-hidden="true" draggable={false} />
                  {questionMarkerEmoji(draftQuestion.marker) && <span className="question-pin-marker emoji" aria-hidden="true">{questionMarkerEmoji(draftQuestion.marker)}</span>}
                </button>}
              </SlideCanvas>
            </div>
          </div>
          {composing && !editingQuestionId && <p className="participant-drag-hint" aria-hidden="true">✋ {t("student.dragHint")}</p>}
          <div className="participant-controls">
            <div className="participant-page-navigation participant-pages" aria-label={t("student.chooseQuestionSlide")}>
              <button type="button" disabled={current === 0} onClick={() => changeSlide(current - 1)} aria-label={t("session.previousSlide")}><ChevronLeft aria-hidden="true" /></button>
              <span><b>{current + 1}</b> / {session.slides.length}</span>
              <button type="button" disabled={current === session.slides.length - 1} onClick={() => changeSlide(current + 1)} aria-label={t("session.nextSlide")}><ChevronRight aria-hidden="true" /></button>
            </div>
            {slideIndex === null || slideIndex === session.currentSlide
              ? <span className="student-sync-button following" role="status"><i aria-hidden="true" />{t("student.following")}</span>
              : <button type="button" className="student-sync-button" onClick={syncToLiveSlide}>{t("student.followPresenter", { number: session.currentSlide + 1 })}<ArrowRight aria-hidden="true" /></button>}
            <div className="participant-reaction-tools">{session.allowEmojiReactions && <><span className="reaction-label">{t("student.react")}</span>
              {activeTool === "emoji" && <div className="student-emoji-picker participant-emoji-picker" role="group" aria-label={t("student.chooseEmoji")}>
                {LECTURE_REACTION_EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => void sendEmojiReaction(emoji)} aria-label={t("student.sendReaction", { emoji })}>{emoji}</button>)}
              </div>}
              <button type="button" className={`participant-emoji-toggle ${activeTool === "emoji" ? "active" : ""}`} aria-expanded={activeTool === "emoji"} onClick={() => selectTool(activeTool === "emoji" ? "pin" : "emoji")} aria-label={t("student.emojiTool")} title={t("student.emoji")}><SmilePlus aria-hidden="true" /></button></>}
              {emojiError && <span className="participant-reaction-error" role="alert">{emojiError}</span>}
              <div className="participant-page-reactions" aria-hidden="true">
                {liveReactions.map((reaction) => <span key={reaction.id} className="lecture-live-reaction" style={{ left: `${reaction.left}%`, animationDelay: `${reaction.delay}ms` }}>{reaction.emoji}</span>)}
              </div>
            </div>
          </div>
        </div>
        <section className="student-feedback-panel" aria-labelledby="student-feedback-title">
          <h2 id="student-feedback-title" className="student-panel-title">{t("student.feedbackListTitle")} <span>{t("student.questionTotal", { count: session.questions.length })}</span></h2>
          {questionsHidden ? <div className="student-questions-hidden">
            <span>{t("student.questionsHiddenCount", { count: slideQuestions.length })}</span>
            <button type="button" className="student-hide-questions" aria-label={t("student.showQuestions")} aria-expanded={false} aria-controls="student-question-list" onClick={() => setQuestionsHidden(false)}><EyeOff aria-hidden="true" /></button>
          </div> : <header className="student-feedback-head">
            <div className="student-scope-tabs" role="tablist" aria-label={t("session.questionScope")}>
              <button type="button" role="tab" aria-selected={questionScope === "slide"} aria-controls="student-question-list" onClick={() => setQuestionScope("slide")}>{t("session.thisSlide")} {slideQuestions.length}</button>
              <button type="button" role="tab" aria-selected={questionScope === "all"} aria-controls="student-question-list" onClick={() => setQuestionScope("all")}>{t("common.all")} {session.questions.length}</button>
            </div>
            <div className="student-feedback-head-actions">
              <label className="student-sort"><span className="sr-only">{t("student.sortQuestions")}</span><select value={questionSort} onChange={(event) => selectQuestionSort(event.target.value)}>
                <option value="empathy">{t("student.sortByEmpathy")}</option>
                <option value="newest">{t("student.sortByNewest")}</option>
              </select><ChevronDown aria-hidden="true" /></label>
              <button type="button" className="student-hide-questions" aria-label={t("student.hideQuestions")} aria-expanded aria-controls="student-question-list" onClick={() => setQuestionsHidden(true)}><Eye aria-hidden="true" /></button>
            </div>
          </header>}
          <div id="student-question-list" hidden={questionsHidden}>
          {submittedQuestions.length ? <ul className="student-feedback-list">
            {submittedQuestions.map((question) => {
              const reactionPending = pendingReactionIds.has(question.id);
              const menuId = `question-menu-${question.id}`;
              return <li key={question.id} className={`question-card ${selectedQuestionId === question.id ? "selected" : ""}`}>
                <div className="student-question-list-meta">
                  {question.isMine && <span className="student-mine-chip">{t("student.myQuestion")}</span>}
                  <time dateTime={question.createdAt}>{timeAgo(question.createdAt)}</time>
                  {session.allowQuestionReactions && <button
                    type="button"
                    className={`question-empathy-button ${question.reactedByMe ? "active" : ""}`}
                    onClick={() => void toggleQuestionReaction(question)}
                    aria-pressed={question.reactedByMe}
                    aria-label={question.isMine ? t("student.empathyOwn") : t(question.reactedByMe ? "student.empathyRemove" : "student.empathyAdd", { count: question.reactionCount })}
                    aria-busy={reactionPending}
                    disabled={question.isMine || reactionPending}
                  ><ThumbsUp aria-hidden="true" /><b>{question.reactionCount}</b></button>}
                  {question.isMine && <>
                    <button type="button" className="student-question-more" popoverTarget={menuId} aria-label={t("student.questionMenu")} onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); const menu = document.getElementById(menuId); if (menu) Object.assign(menu.style, { left: `${box.right}px`, top: `${box.bottom + 4}px` }); }}><MoreHorizontal aria-hidden="true" /></button>
                    <div id={menuId} popover="auto" className="student-question-menu" role="menu">
                      <button type="button" role="menuitem" onClick={(event) => { event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); startEditingQuestion(question.id); }}>{t("student.editQuestion")}</button>
                      <button type="button" role="menuitem" className="danger" disabled title={t("student.deleteUnavailable")}><Trash2 aria-hidden="true" />{t("student.deleteQuestion")}</button>
                    </div>
                  </>}
                </div>
                <button type="button" className="student-feedback-item" onClick={() => selectQuestion(question.id)} aria-pressed={selectedQuestionId === question.id}><p>{question.text}</p></button>
              </li>;
            })}
          </ul> : <p className="student-feedback-empty">{t("student.feedbackEmpty")}</p>}
          {reactionError && <p className="student-empathy-error" role="alert">{reactionError}</p>}
          </div>
        </section>
      </section>
      {captureShielded && <button type="button" className="capture-shield" autoFocus onClick={() => setCaptureShielded(false)}>{t("student.captureShieldResume")}</button>}
      <div className="student-toast-region" role="status">{toast && <div className="student-toast"><span><Check aria-hidden="true" /></span>{toast}</div>}</div>
      {composerOpen && <div className={`student-modal-backdrop ${viewingQuestion ? "modal-blocking" : "sheet"}`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}>
        <section className="student-question-modal" role="dialog" aria-modal={viewingQuestion ? true : undefined} aria-labelledby="question-modal-title" onKeyDown={(event) => { if (event.key === "Escape") closeComposer(); if (viewingQuestion) trapDialogFocus(event); }}>
          {viewingQuestion ? <div className="student-answer-view">
            <button type="button" className="icon-btn modal-close" onClick={closeComposer} aria-label={t("student.closeComposer")}><X /></button>
            <h2 id="question-modal-title">{t("student.myQuestion")}</h2>
            <p className="student-answer-question">{viewingQuestion.text}</p>
            <button className="btn primary large full" onClick={closeComposer}>{t("common.confirm")}</button>
          </div> : <>
            <span className="student-sheet-handle" aria-hidden="true" />
            <div className="student-sheet-title">
              <div><h2 id="question-modal-title">{editingQuestionId ? t("student.editPrompt") : t("student.askHere")}</h2><small>{t("student.askHereMeta", { number: current + 1 })}</small></div>
              <button type="button" onClick={closeComposer} aria-label={t("student.closeComposer")}><X aria-hidden="true" /></button>
            </div>
            <div className="textarea-wrap"><textarea autoFocus aria-label={t("student.optionalQuestion")} aria-describedby="student-empty-hint" value={draftText} onChange={(event) => updateDraftText(event.target.value)} maxLength={300} placeholder={t("student.placeholder")} /><span>{draftText.length} / 300</span></div>
            <p id="student-empty-hint" className="student-empty-hint">{t("student.emptyHint")}</p>
            {submitError && <div className="student-submit-error" role="alert">{submitError}</div>}
            <button type="button" className="btn primary large full student-send-button" onClick={() => void submit()} disabled={submitting}>{submitting ? <span className="spinner" /> : <Send aria-hidden="true" />}{editingQuestionId ? t("student.sendEdited") : t("student.sendQuestion")}</button>
          </>}
        </section>
      </div>}
    </main>
  );
}
