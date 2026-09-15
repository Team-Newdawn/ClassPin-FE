"use client";

import Link from "next/link";
import { SessionRuntime } from "@/app/component/session-runtime";
import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import deleteIcon from "@/assets/icons/delete_icon.svg";
import fileListIcon from "@/assets/icons/file_list_icon.svg";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, FileText, GripVertical, Link2, ListFilter, MessageCircleQuestion, MonitorUp, PanelLeftClose, PanelLeftOpen, Pause, Play, Plus, QrCode, Search, Share2, Trash2, Users, X } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import { LoadingScreen } from "@/app/component/loading-screen";
import { QuestionCard } from "./component/question-card";
import { QuestionCategoryManager } from "./component/question-category-manager";
import { QuestionDetailDialog } from "./component/question-detail-dialog";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { StatusBadge } from "@/app/component/status-badge";
import { MAX_QUESTION_PANEL, MIN_QUESTION_PANEL, useSessionAdminController } from "./controller";
import styles from "./page.module.css";
import {useLivePin} from "./live-pin-controller";
import {pinSorts,type PinSort} from "@/app/_model/live-pin";
import liveStyles from "./live-pin.module.css";
import { questionCategoryClass, questionCategoryLabel, questionMarkerEmoji, type QuestionCategory } from "@/app/_model/types";

export default function SessionAdmin() {
  const pinCanvasRef = useRef<HTMLDivElement>(null);
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const {
    ready, session, slide, folder, folderAccentIndex, folderHref, folderSessions, questionsBySlide, questionCounts, slideQuestions,
    selected, detailQuestion, visibleQuestions, tab, filter, query, shareOpen, answer, copied,
    actionError, lectureSaving, presentationError, folderRailOpen, questionPanelWidth, noteDraft,
    noteDirty, noteSavingSlideId, noteSavedSlideId, addingSlides, deleteTarget, deletingSlide,
    deleteSlideError, deleteTargetQuestionCount, joinUrl, playerWorkspaceRef, filmstripRef,
    slideInputRef, handleSlideWheel, showLive, showQuestions, toggleFolderRail, openShare,
    closeShare, changeAnswer, changeQuery, changeFilter, openQuestionDetail, closeQuestionDetail, selectForAnswer, closeAnswer,
    selectQuestionFromList, changeSlide, toggleStatus, toggleQuestionPins,
    changePresentationQrPlacement,
    saveQuestionCategories, reportActionError, submitAnswer, resolveSelectedQuestion,
    saveCurrentSlideNote, changeNoteDraft, saveNoteByKeyboard, addSlideImages, openDeleteSlide,
    closeDeleteSlide, confirmDeleteSlide, startQuestionPanelResize, resizeQuestionPanel,
    finishQuestionPanelResize, cancelQuestionPanelResize, resizeQuestionPanelByKeyboard,
    openPresentation, copyJoinLink, goHome
  } = useSessionAdminController();
  const livePin=useLivePin(session,selected);
  const panelQuestions=livePin.questionTime?livePin.top:livePin.all;

  if (!ready) return <LoadingScreen />;
  if (!session || !slide) return <div className={`${styles.root} empty-state`}><h1>{t("session.notFound")}</h1><button className="btn primary" onClick={goHome}>{t("common.home")}</button></div>;

  const categoryLabel = (category: QuestionCategory) => questionCategoryLabel(session.questionCategories, category, defaultCategoryLabel);
  const categoryClass = (category: QuestionCategory) => questionCategoryClass(session.questionCategories, category);
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
          <button className={tab === "live" ? "active" : ""} onClick={showLive}><svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2.803a1 1 0 0 1 1.5-.865l9 5.195a1 1 0 0 1 0 1.733l-9 5.196a1 1 0 0 1-1.5-.866z" /></svg>{t("session.livePlayer")}<span>{questionCounts.unanswered}</span></button>
          <button className={tab === "questions" ? "active" : ""} onClick={showQuestions}><MessageCircleQuestion />{t("session.questionList")}<span>{questionCounts.total}</span></button>
          <div className="top-actions"><span className={`session-state-badge ${session.status}`}><i />{t(session.status === "live" ? "session.liveLabel" : "session.stoppedLabel")}</span><SessionRuntime session={session} /><button className="btn secondary" onClick={toggleStatus}>{session.status === "live" ? <><Pause />{t("session.end")}</> : <><Play />{t("session.restart")}</>}</button><button className="btn secondary" onClick={openShare}><Share2 />{t("session.joinLink")}</button><button className="btn primary presentation-launch" onClick={openPresentation} title={t("session.openSlideshow")}><MonitorUp />{t("session.slideshow")}</button></div>
        </div>
        {presentationError
          ? <div className="login-error" role="alert">{presentationError}</div>
          : actionError && <div className="login-error" role="alert">{actionError} {t("common.tryAgain")}</div>}

        {tab === "live" ? (
          <div className="player-workspace" ref={playerWorkspaceRef}>
            <section className="player-stage">
              <div className="stage-toolbar">
                <div className="stage-toolbar-status"><span className={`status-dot ${session.status}`} /><b title={session.title}>{session.title}</b></div>
                <div className="stage-toolbar-actions">
                  <div className="stage-qr-placement">
                    <QrCode aria-hidden="true" />
                    <label className="sr-only" htmlFor="stage-qr-placement">{t("session.qrPosition")}</label>
                    <select
                      id="stage-qr-placement"
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
                  <input ref={slideInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" multiple hidden onChange={addSlideImages} />
                  <button type="button" className="stage-add-slides" disabled={addingSlides} onClick={() => slideInputRef.current?.click()} title={t("session.addSlidesHint")}>
                    {addingSlides ? <span className="spinner" /> : <Plus />}
                    <span>{t(addingSlides ? "session.addingSlides" : "session.addSlides")}</span>
                  </button>
                  <button type="button" className="stage-add-slides stage-delete-slide" disabled={session.slides.length <= 1 || addingSlides} onClick={() => openDeleteSlide(slide.id)} title={t(session.slides.length <= 1 ? "session.deleteLastSlideHint" : "session.deleteSlideHint")}>
                    <span className="stage-delete-icon" style={{ "--stage-delete-icon": `url(${deleteIcon.src})` } as React.CSSProperties} aria-hidden="true" />
                    <span>{t("session.deleteSlide")}</span>
                  </button>
                </div>
              </div>
              <div ref={pinCanvasRef} className={`stage-canvas-wrap ${detailQuestion ? liveStyles.pinDetailOpen : ""}`} onWheel={handleSlideWheel}><SlideCanvas slide={slide} questions={slideQuestions} questionCategories={session.questionCategories} selectedId={selected?.id} onSelectPin={openQuestionDetail} showPins={session.showQuestionPins} /></div>
              <div className="player-controls"><button className="icon-btn" disabled={session.currentSlide === 0} onClick={() => changeSlide(session.currentSlide - 1)} aria-label={t("session.previousSlide")}><ChevronLeft /></button><div className="slide-dots">{session.slides.map((_, i) => <button key={i} className={i === session.currentSlide ? "active" : ""} onClick={() => changeSlide(i)} aria-label={t("common.slideNumber", { number: i + 1 })} />)}</div><button className="icon-btn" disabled={session.currentSlide === session.slides.length - 1} onClick={() => changeSlide(session.currentSlide + 1)} aria-label={t("session.nextSlide")}><ChevronRight /></button></div>
              <div className="filmstrip" ref={filmstripRef}>{session.slides.map((item, index) => {
                const questionCount = questionsBySlide.get(index)?.length ?? 0;
                return <button key={item.id} className={index === session.currentSlide ? "active" : ""} aria-current={index === session.currentSlide ? "page" : undefined} onClick={() => changeSlide(index)}><SlideCanvas slide={item} compact /><span>{index + 1}</span>{questionCount > 0 && <i>{questionCount}</i>}</button>;
              })}</div>
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
                <div><h2>{t("session.liveQuestions")}</h2><p>{livePin.questionTime ? "질문 시간 TOP 5" : "전체 슬라이드"} · {panelQuestions.length}개 / 전체 {session.questions.length}개</p></div>
                <div className="panel-heading-actions">
                  <span className="pulse-dot" aria-hidden="true" />
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
                </div>
                </div>
                <section className={liveStyles.controls} aria-label="실시간 PIN 도우미">
                  <div className={liveStyles.buttons}>
                    <button className="btn secondary" role="switch" aria-checked={livePin.notifications} onClick={livePin.toggleNotifications}>PIN 알림 {livePin.notifications?"ON":"OFF"}</button>
                    <button className="btn primary" aria-pressed={livePin.questionTime} onClick={livePin.toggleQuestionTime}>{livePin.questionTime?"질문 시간 종료":"PIN ON · 질문 시간"}</button>
                  </div>
                  <small>알림은 이 강사 화면에만 적용됩니다. OFF여도 학생 질문은 계속 접수됩니다. 위 스위치는 슬라이드 PIN 표시입니다.</small>
                  {livePin.notice&&<div className={liveStyles.notice} role="status">{livePin.notice}<button aria-label="PIN 알림 닫기" onClick={livePin.dismissNotice}>×</button></div>}
                    <label>질문 카테고리<select value={livePin.category} onChange={e=>livePin.setCategory(e.target.value)}><option value="all">전체 카테고리</option>{Object.keys(session.questionCategories).map(key=><option key={key} value={key}>{categoryLabel(key)}</option>)}</select></label>
                    <label>정렬 기준<select value={livePin.sort} onChange={e=>livePin.setSort(e.target.value as PinSort)}>{Object.entries(pinSorts).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
                    {livePin.sort === "importance" && <small>중요 표시 → 미답변 → 공감 많은 순 → 오래 기다린 순으로 정렬합니다. AI 평가가 아닌 질문 정보 기준입니다.</small>}
                  {livePin.questionTime&&<>
                    <strong>여기까지의 미답변 TOP 5 · {panelQuestions.length}개</strong>
                    <small>1~{session.currentSlide+1}페이지 · 공감 동률은 오래 기다린 질문 우선</small>
                  </>}
                </section>
                <div className="question-stack">{panelQuestions.length ? panelQuestions.map((q,index) => <div key={q.id}>{livePin.sort === "category" && (index === 0 || panelQuestions[index-1].category !== q.category) && <h3 className={liveStyles.categoryHeading}>{categoryLabel(q.category)}</h3>}<small>{livePin.questionTime ? `${index+1}위 · ` : ""}{q.slideIndex+1}페이지 · 공감 {q.reactionCount}</small><QuestionCard question={q} questionCategories={session.questionCategories} selected={selected?.id === q.id} onClick={() => selectForAnswer(q.id)} /></div>) : <div className="no-questions"><MessageCircleQuestion /><b>선택한 조건의 질문이 없습니다.</b><span>카테고리를 변경하거나 전체 카테고리를 선택해 주세요.</span></div>}</div>
                {selected && <div className="answer-box">
                <div className={liveStyles.suggestionHeader}><strong>질문 답변</strong><button type="button" className="btn tertiary" onClick={closeAnswer} aria-label="답변창 닫기"><X />닫기</button></div>
                <section className={liveStyles.suggestion} aria-label="AI 추천 답변">
                  <strong>AI 추천 답변 · 강사 전용 초안</strong>
                  <small>대상: {selected.slideIndex+1}페이지 · {selected.text}</small>
                  {livePin.draft?.status==="queued"&&<p role="status">분석 대기 중 · 새 PIN부터 순서대로 처리합니다.</p>}
                  {livePin.draft?.status==="running"&&<p role="status">로컬 AI 분석 중… 보통 수십 초가 걸립니다.</p>}
                  {livePin.draft?.status==="failed"&&<p role="status">{livePin.draft.error}</p>}
                  {livePin.draft?.result&&<><p>{livePin.draft.result.analysis}</p><blockquote>{livePin.draft.result.quote}</blockquote><p className={liveStyles.draft}>{livePin.draft.result.draft}</p><small>{livePin.draft.result.model} · {(livePin.draft.result.elapsedMs/1000).toFixed(1)}초 · 외부 API 0원 (운영비 제외)</small><button className="btn secondary" disabled={Boolean(answer.trim())} onClick={()=>changeAnswer(livePin.draft!.result!.draft)}>답변 입력란에 넣기</button>{answer.trim()&&<small>작성 중인 답변을 보호합니다. 입력란을 비우면 초안을 넣을 수 있습니다.</small>}</>}
                  {(!livePin.draft||livePin.draft.status==="failed")&&<button className="btn secondary" onClick={livePin.retry} disabled={selected.status!=="unanswered"}>추천 답변 생성 / 재시도</button>}
                  <small>근거가 있어도 오답일 수 있습니다. 검토·수정 후 ‘답변 전송’을 눌러야 학생에게 전달됩니다.</small>
                </section>
                {selected.answer && <div className="saved-answer"><span>{t("session.latestAnswer")}</span><p>{selected.answer}</p></div>}
                <label htmlFor="answer">{selected.answer ? t("session.additionalAnswer") : t("session.quickAnswer")}</label>
                <textarea id="answer" value={answer} onChange={(event) => changeAnswer(event.target.value)} placeholder={t("session.answerPlaceholder")} />
                <div className="answer-actions"><button className="btn tertiary" onClick={resolveSelectedQuestion}><Check />{t("session.resolve")}</button><button className="btn primary" onClick={submitAnswer}>{t("session.sendAnswer")}</button></div>
                </div>}
            </aside>
          </div>
        ) : (
          <div className="questions-page">
            <div className="questions-header"><div><h1>{t("session.questionList")}</h1><p>{t("session.questionsDescription")}</p></div><div className="kpi-inline"><span><b>{questionCounts.total}</b>{t("session.totalQuestions")}</span><span><b>{questionCounts.unanswered}</b>{t("status.unanswered")}</span><span><b>{questionCounts.resolved}</b>{t("status.resolved")}</span></div></div>
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

      {detailQuestion && <QuestionDetailDialog key={detailQuestion.id} canvasRef={pinCanvasRef} question={detailQuestion} questionCategories={session.questionCategories} onClose={closeQuestionDetail} answerEditor={selected?.id === detailQuestion.id ? <div className={liveStyles.bubbleEditor}>
        <strong>AI 추천 답변 · 강사 전용</strong>
        {(livePin.draft?.status === "running" || livePin.draft?.status === "queued") && <small role="status">{livePin.draft.status === "running" ? "AI 답변 생성 중…" : "AI 분석 대기 중…"}</small>}
        {livePin.draft?.status === "failed" && <small role="alert">{livePin.draft.error}</small>}
        {livePin.draft?.result ? <>
          <button type="button" className="btn secondary" disabled={Boolean(answer.trim())} onClick={() => changeAnswer(livePin.draft!.result!.draft)}>이 답변 넣기</button>
          {answer.trim() && <small>작성 중인 답변을 보호합니다. 입력란을 비우면 AI 답변을 넣을 수 있습니다.</small>}
        </> : (!livePin.draft || livePin.draft.status === "failed") && <button type="button" className="btn secondary" onClick={livePin.retry} disabled={selected.status !== "unanswered"}>AI 답변 생성 / 재시도</button>}
        <label htmlFor="pin-detail-answer">강사 답변 작성</label>
        <textarea id="pin-detail-answer" value={answer} onChange={event => changeAnswer(event.target.value)} placeholder={livePin.draft?.result?.draft || "AI 초안을 넣거나 직접 답변을 작성하세요"} rows={livePin.draft?.result?.draft ? 7 : 4} />
        <small>AI 답변은 틀릴 수 있습니다. 검토 후 전송해야 학생에게 전달됩니다.</small>
        {actionError && <small role="alert">{actionError}</small>}
        <button type="button" className="btn primary full" disabled={!answer.trim()} onClick={submitAnswer}>답변 전송</button>
      </div> : undefined} />}
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
