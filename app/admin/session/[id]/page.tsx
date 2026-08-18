"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clock3, Copy, FileText, FolderOpen, GripVertical, Link2, ListFilter, MessageCircleQuestion, MonitorUp, PanelLeftClose, PanelLeftOpen, Pause, Play, Plus, QrCode, Search, Share2, Trash2, Users, X } from "@/components/icons";
import { useLanguage } from "@/components/language-context";
import { QuestionDetailDialog } from "@/components/question-detail-dialog";
import { SlideCanvas } from "@/components/slide-canvas";
import { StatusBadge } from "@/components/status-badge";
import { useHorizontalSlideWheel } from "@/components/use-horizontal-slide-wheel";
import { useSessions } from "@/components/session-store";
import type { PresentationQrPosition, Question, QuestionStatus } from "@/lib/types";

type Tab = "live" | "questions";
const MIN_QUESTION_PANEL = 300;
const MAX_QUESTION_PANEL = 560;
const MIN_STAGE_WIDTH = 400;

const clampQuestionPanel = (width: number, workspaceWidth = MIN_STAGE_WIDTH + MAX_QUESTION_PANEL) =>
  Math.min(MAX_QUESTION_PANEL, Math.max(MIN_QUESTION_PANEL, Math.min(width, workspaceWidth - MIN_STAGE_WIDTH)));

export default function SessionAdmin() {
  const { t, categoryLabel, timeAgo } = useLanguage();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { folders, sessions, ready, appendSlides, deleteSlide, answerQuestion, resolveQuestion, setCurrentSlide, setStatus, setShowQuestionPins, setShowPresentationQr, setPresentationQrPosition, updateSlideNote } = useSessions();
  const session = sessions.find((item) => item.id === params.id);
  const [tab, setTab] = useState<Tab>(search.get("tab") === "questions" ? "questions" : "live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuestionStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [folderRailOpen, setFolderRailOpen] = useState(true);
  const [questionPanelWidth, setQuestionPanelWidth] = useState(380);
  const playerWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSavingSlideId, setNoteSavingSlideId] = useState<string | null>(null);
  const [noteSavedSlideId, setNoteSavedSlideId] = useState<string | null>(null);
  const presentationWindowRef = useRef<Window | null>(null);
  const slideInputRef = useRef<HTMLInputElement | null>(null);
  const [addingSlides, setAddingSlides] = useState(false);
  const [deleteSlideId, setDeleteSlideId] = useState<string | null>(null);
  const [deletingSlide, setDeletingSlide] = useState(false);
  const [deleteSlideError, setDeleteSlideError] = useState<string | null>(null);

  const visibleQuestions = useMemo(() => session?.questions.filter((q) => (filter === "all" || q.status === filter) && q.text.toLowerCase().includes(query.toLowerCase())) ?? [], [filter, query, session]);
  const runAction = (action: Promise<void>, message: string) => {
    setActionError(null);
    void action.catch((error) => {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`${message}: ${detail}`, error);
      setActionError(message);
    });
  };

  // 화살표나 점으로 슬라이드를 넘길 때 필름스트립이 따라오지 않으면, 장수가 많을수록
  // 지금 어디인지 놓친다. scrollIntoView 는 창까지 움직여서 컨테이너만 직접 민다.
  const filmstripRef = useRef<HTMLDivElement>(null);
  const currentSlide = session?.currentSlide;
  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip || currentSlide == null) return;
    const active = strip.children[currentSlide] as HTMLElement | undefined;
    if (!active) return;
    const stripBox = strip.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const offset = (activeBox.left - stripBox.left) - (stripBox.width - activeBox.width) / 2;
    strip.scrollTo({ left: strip.scrollLeft + offset, behavior: "smooth" });
  }, [currentSlide]);
  const handleSlideWheel = useHorizontalSlideWheel({
    currentIndex: session?.currentSlide ?? 0,
    slideCount: session?.slides.length ?? 0,
    onIndexChange: (index) => {
      if (session) runAction(setCurrentSlide(session.id, index), t("session.saveSlideError"));
    }
  });

  // 인사이트 핫스팟에서 ?slide= 로 진입하면 해당 슬라이드를 펼친 채 시작한다.
  // 최초 1회만 적용해, 이후 강사가 슬라이드를 넘기는 것을 URL 이 되돌리지 않게 한다.
  const slideParamApplied = useRef(false);
  useEffect(() => {
    if (slideParamApplied.current || !session) return;
    slideParamApplied.current = true;
    const param = search.get("slide");
    if (param === null) return;
    const index = Number(param);
    if (Number.isInteger(index) && index >= 0 && index < session.slides.length) setCurrentSlide(session.id, index);
  }, [search, session, setCurrentSlide]);

  useEffect(() => {
    if (!session || tab !== "live" || detailQuestionId || shareOpen || deleteSlideId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), dialog, [role='dialog'], [role='alertdialog'], [role='separator']")) return;
      const next = session.currentSlide + (event.key === "ArrowRight" ? 1 : -1);
      if (next < 0 || next >= session.slides.length) return;
      event.preventDefault();
      void setCurrentSlide(session.id, next).catch((error) => {
        console.error("Keyboard slide navigation failed", error);
        setActionError(t("session.saveSlideError"));
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSlideId, detailQuestionId, session, setCurrentSlide, shareOpen, t, tab]);

  useEffect(() => {
    if (tab !== "live") return;
    const fitQuestionPanel = () => {
      if (window.innerWidth <= 900 || !playerWorkspaceRef.current) return;
      setQuestionPanelWidth((width) => clampQuestionPanel(width, playerWorkspaceRef.current?.clientWidth));
    };
    fitQuestionPanel();
    window.addEventListener("resize", fitQuestionPanel);
    return () => window.removeEventListener("resize", fitQuestionPanel);
  }, [tab]);

  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;
  if (!session) return <div className="empty-state"><h1>{t("session.notFound")}</h1><button className="btn primary" onClick={() => router.push("/")}>{t("common.home")}</button></div>;

  const slide = session.slides[session.currentSlide];
  const folder = folders.find((item) => item.id === session.folderId);
  const folderHref = `/admin/folders/${folder?.id ?? "unfiled"}`;
  const folderSessions = sessions.filter((item) => item.folderId === (session.folderId ?? null));
  const slideQuestions = session.questions.filter((q) => q.slideIndex === session.currentSlide);
  const selected = session.questions.find((q) => q.id === selectedId) ?? slideQuestions[0];
  const detailQuestion = session.questions.find((q) => q.id === detailQuestionId);
  const noteDraft = slide ? noteDrafts[slide.id] ?? slide.speakerNote ?? "" : "";
  const noteDirty = Boolean(slide && noteDraft !== (slide.speakerNote ?? ""));
  const qrPositions: PresentationQrPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const qrPositionLabel = (position: PresentationQrPosition) => position === "top-left"
    ? t("session.qrTopLeft")
    : position === "top-right"
      ? t("session.qrTopRight")
      : position === "bottom-left"
        ? t("session.qrBottomLeft")
        : t("session.qrBottomRight");
  const openQuestionDetail = (questionId: string) => {
    setSelectedId(questionId);
    setDetailQuestionId(questionId);
  };
  const joinUrl = typeof window === "undefined" ? "" : `${window.location.origin}/join/${session.code}`;
  const copy = async () => { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const submitAnswer = () => {
    if (!selected || !answer.trim()) return;
    const body = answer.trim();
    setActionError(null);
    void answerQuestion(session.id, selected.id, body)
      .then(() => setAnswer(""))
      .catch((error) => {
        const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
        console.error(`Answer save failed: ${detail}`, error);
        setActionError(t("session.saveAnswerError"));
      });
  };
  const saveCurrentSlideNote = () => {
    if (!slide || !noteDirty || noteSavingSlideId === slide.id) return;
    const slideId = slide.id;
    const body = noteDraft;
    setActionError(null);
    setNoteSavingSlideId(slideId);
    setNoteSavedSlideId(null);
    void updateSlideNote(session.id, slideId, body)
      .then(() => {
        setNoteSavedSlideId(slideId);
        window.setTimeout(() => setNoteSavedSlideId((current) => current === slideId ? null : current), 1800);
      })
      .catch((error) => {
        const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
        console.error(`Speaker note save failed: ${detail}`, error);
        setActionError(t("session.saveSpeakerNotesError"));
      })
      .finally(() => setNoteSavingSlideId((current) => current === slideId ? null : current));
  };
  const addSlideImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length || addingSlides) return;
    setActionError(null);
    setAddingSlides(true);
    try {
      await appendSlides(session.id, files);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`Slide append failed: ${detail}`, error);
      setActionError(t("session.addSlidesError"));
    } finally {
      setAddingSlides(false);
    }
  };
  const deleteTarget = deleteSlideId ? session.slides.find((item) => item.id === deleteSlideId) : null;
  const deleteTargetQuestionCount = deleteTarget
    ? session.questions.filter((question) => question.slideIndex === deleteTarget.pageIndex).length
    : 0;
  const closeDeleteSlide = () => {
    if (deletingSlide) return;
    setDeleteSlideId(null);
    setDeleteSlideError(null);
  };
  const confirmDeleteSlide = async () => {
    if (!deleteTarget || deletingSlide) return;
    setDeleteSlideError(null);
    setDeletingSlide(true);
    try {
      await deleteSlide(session.id, deleteTarget.id);
      setDeleteSlideId(null);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`Slide deletion failed: ${detail}`, error);
      setDeleteSlideError(t("session.deleteSlideError"));
    } finally {
      setDeletingSlide(false);
    }
  };
  const resizeQuestionPanel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    setQuestionPanelWidth(clampQuestionPanel(resizeStart.current.width + resizeStart.current.x - event.clientX, playerWorkspaceRef.current?.clientWidth));
  };
  const openPresentation = () => {
    setActionError(null);
    setPresentationError(null);
    const existing = presentationWindowRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }

    // 팝업 차단을 피하려면 사용자 클릭 핸들러 안에서 동기적으로 열어야 한다.
    // 이름을 세션별로 고정해 버튼을 다시 눌러도 발표 창을 하나만 재사용한다.
    const width = window.screen.availWidth;
    const height = window.screen.availHeight;
    const popup = window.open(
      `/admin/session/${session.id}/present`,
      `pin-class-present-${session.id}`,
      `popup=yes,width=${width},height=${height}`
    );
    if (!popup) {
      setPresentationError(t("session.popupBlocked"));
      return;
    }
    presentationWindowRef.current = popup;
    popup.focus();
  };

  return (
    <div
      className={`session-admin-shell ${folderRailOpen ? "" : "folder-rail-collapsed"}`}
      style={{ "--question-panel-width": `${questionPanelWidth}px` } as React.CSSProperties}
    >
      <aside className="session-folder-rail">
        <div className="folder-rail-head">
          {folderRailOpen && <Link href={folderHref}><ArrowLeft />{t("session.backToFolder")}</Link>}
          <button type="button" onClick={() => setFolderRailOpen((open) => !open)} aria-label={t(folderRailOpen ? "session.collapseFolders" : "session.expandFolders")} title={t(folderRailOpen ? "session.collapseFolders" : "session.expandFolders")}>{folderRailOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</button>
        </div>
        {folderRailOpen && <>
          <div className="folder-rail-title"><FolderOpen /><span><small>{t("session.folderMaterials")}</small><b>{folder?.name ?? t("folders.unfiled")}</b></span></div>
          <nav aria-label={t("session.folderMaterials")}>
            {folderSessions.map((item) => <Link key={item.id} href={`/admin/session/${item.id}`} className={item.id === session.id ? "active" : ""} aria-current={item.id === session.id ? "page" : undefined}><span className="folder-rail-thumb"><SlideCanvas slide={item.slides[0]} compact /></span><span><b>{item.title}</b><small>{item.slides.length} {t("common.slide")}</small></span></Link>)}
          </nav>
        </>}
      </aside>
      <main className="session-admin-main">
        <div className="workspace-tabs">
          <button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")}><Play />{t("session.livePlayer")}<span>{session.questions.filter((q) => q.status === "unanswered").length}</span></button>
          <button className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}><MessageCircleQuestion />{t("session.questionList")}<span>{session.questions.length}</span></button>
          <div className="top-actions"><span className={`session-state-badge ${session.status}`}><i />{t(session.status === "live" ? "session.liveLabel" : "session.stoppedLabel")}</span><button className="btn secondary" onClick={() => runAction(setStatus(session.id, session.status === "live" ? "ended" : "live"), t("session.saveLectureError"))}>{session.status === "live" ? <><Pause />{t("session.end")}</> : <><Play />{t("session.restart")}</>}</button><button className="btn secondary" onClick={() => setShareOpen(true)}><Share2 />{t("session.joinLink")}</button><button className="btn primary presentation-launch" onClick={openPresentation} title={t("session.openSlideshow")}><MonitorUp />{t("session.slideshow")}</button></div>
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
                  <button type="button" className="stage-add-slides stage-delete-slide" disabled={session.slides.length <= 1 || addingSlides} onClick={() => { setDeleteSlideError(null); setDeleteSlideId(slide.id); }} title={t(session.slides.length <= 1 ? "session.deleteLastSlideHint" : "session.deleteSlideHint")}>
                    <Trash2 />
                    <span>{t("session.deleteSlide")}</span>
                  </button>
                </div>
              </div>
              <div className="stage-canvas-wrap" onWheel={handleSlideWheel}><SlideCanvas slide={slide} questions={slideQuestions} selectedId={selected?.id} onSelectPin={openQuestionDetail} showPins={session.showQuestionPins} /></div>
              <div className="player-controls"><button className="icon-btn" disabled={session.currentSlide === 0} onClick={() => runAction(setCurrentSlide(session.id, session.currentSlide - 1), t("session.saveSlideError"))} aria-label={t("session.previousSlide")}><ChevronLeft /></button><div className="slide-dots">{session.slides.map((_, i) => <button key={i} className={i === session.currentSlide ? "active" : ""} onClick={() => runAction(setCurrentSlide(session.id, i), t("session.saveSlideError"))} aria-label={t("common.slideNumber", { number: i + 1 })} />)}</div><button className="icon-btn" disabled={session.currentSlide === session.slides.length - 1} onClick={() => runAction(setCurrentSlide(session.id, session.currentSlide + 1), t("session.saveSlideError"))} aria-label={t("session.nextSlide")}><ChevronRight /></button></div>
              <div className="filmstrip" ref={filmstripRef}>{session.slides.map((item, index) => <button key={item.id} className={index === session.currentSlide ? "active" : ""} aria-current={index === session.currentSlide ? "page" : undefined} onClick={() => runAction(setCurrentSlide(session.id, index), t("session.saveSlideError"))}><SlideCanvas slide={item} compact /><span>{index + 1}</span>{session.questions.some((q) => q.slideIndex === index) && <i>{session.questions.filter((q) => q.slideIndex === index).length}</i>}</button>)}</div>
              <section className="stage-speaker-note" aria-labelledby="speaker-note-label">
                <div className="stage-speaker-note-head"><span><FileText /><b id="speaker-note-label">{t("session.speakerNotesSlide", { number: session.currentSlide + 1 })}</b></span><small><Check />{t("session.speakerNotesPrivate")}</small></div>
                <textarea
                  id="speaker-note"
                  aria-labelledby="speaker-note-label"
                  value={noteDraft}
                  maxLength={10000}
                  placeholder={t("session.speakerNotesHint")}
                  onChange={(event) => {
                    setNoteDrafts((current) => ({ ...current, [slide.id]: event.target.value }));
                    setNoteSavedSlideId(null);
                  }}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      saveCurrentSlideNote();
                    }
                  }}
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
                onPointerDown={(event) => {
                  resizeStart.current = { x: event.clientX, width: event.currentTarget.parentElement?.clientWidth ?? questionPanelWidth };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={resizeQuestionPanel}
                onPointerUp={(event) => { resizeStart.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
                onPointerCancel={() => { resizeStart.current = null; }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const renderedWidth = event.currentTarget.parentElement?.clientWidth ?? questionPanelWidth;
                  setQuestionPanelWidth(clampQuestionPanel(renderedWidth + (event.key === "ArrowLeft" ? 20 : -20), playerWorkspaceRef.current?.clientWidth));
                }}
              ><GripVertical /></div>
                <div className="panel-heading">
                <div><h2>{t("session.liveQuestions")}</h2><p>{t("common.currentQuestionsCount", { count: slideQuestions.length })}</p></div>
                <div className="panel-heading-actions">
                  <span className="pin-toggle-label">{t("session.showPins")}</span>
                  <button
                    type="button"
                    className={`pin-toggle ${session.showQuestionPins ? "on" : ""}`}
                    role="switch"
                    aria-checked={session.showQuestionPins}
                    aria-label={session.showQuestionPins ? t("session.turnPinsOff") : t("session.turnPinsOn")}
                    onClick={() => runAction(
                      setShowQuestionPins(session.id, !session.showQuestionPins),
                      t("session.savePinSettingError")
                    )}
                  >
                    <span className="pin-toggle-thumb" />
                    <span className="pin-toggle-state">{session.showQuestionPins ? "ON" : "OFF"}</span>
                  </button>
                  <span className="pulse-dot" aria-hidden="true" />
                </div>
                </div>
                <section className="qr-position-setting" aria-labelledby="qr-position-title">
                <div className="qr-position-heading">
                  <span><QrCode /></span>
                  <div><b id="qr-position-title">{t("session.qrPosition")}</b><small>{t("session.qrPositionHint")}</small></div>
                  <div className="panel-heading-actions">
                    <span className="pin-toggle-label">{t("presentation.showQr")}</span>
                    <button
                      type="button"
                      className={`pin-toggle ${session.showPresentationQr ? "on" : ""}`}
                      role="switch"
                      aria-checked={session.showPresentationQr}
                      aria-label={session.showPresentationQr ? t("presentation.turnQrOff") : t("presentation.turnQrOn")}
                      onClick={() => runAction(
                        setShowPresentationQr(session.id, !session.showPresentationQr),
                        t("presentation.saveQrSettingError")
                      )}
                    >
                      <span className="pin-toggle-thumb" />
                      <span className="pin-toggle-state">{session.showPresentationQr ? "ON" : "OFF"}</span>
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
                      onClick={() => runAction(
                        setPresentationQrPosition(session.id, position),
                        t("session.saveQrPositionError")
                      )}
                    >
                      <span className={`qr-corner-preview ${position}`} aria-hidden="true"><i /></span>
                      {qrPositionLabel(position)}
                    </button>
                  ))}
                </div>
                </section>
                <div className="question-stack">{slideQuestions.length ? slideQuestions.map((q) => <QuestionCard key={q.id} question={q} selected={selected?.id === q.id} onClick={() => openQuestionDetail(q.id)} />) : <div className="no-questions"><MessageCircleQuestion /><b>{t("session.noQuestions")}</b><span>{t("session.noQuestionsHint1")}<br />{t("session.noQuestionsHint2")}</span></div>}</div>
                {selected && <div className="answer-box">
                {selected.answer && <div className="saved-answer"><span>{t("session.latestAnswer")}</span><p>{selected.answer}</p></div>}
                <label htmlFor="answer">{selected.answer ? t("session.additionalAnswer") : t("session.quickAnswer")}</label>
                <textarea id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t("session.answerPlaceholder")} />
                <div className="answer-actions"><button className="btn tertiary" onClick={() => runAction(resolveQuestion(session.id, selected.id), t("session.saveQuestionError"))}><Check />{t("session.resolve")}</button><button className="btn primary" onClick={submitAnswer}>{t("session.sendAnswer")}</button></div>
                </div>}
            </aside>
          </div>
        ) : (
          <div className="questions-page">
            <div className="questions-header"><div><h1>{t("session.questionList")}</h1><p>{t("session.questionsDescription")}</p></div><div className="kpi-inline"><span><b>{session.questions.length}</b>{t("session.totalQuestions")}</span><span><b>{session.questions.filter((q) => q.status === "unanswered").length}</b>{t("status.unanswered")}</span><span><b>{session.questions.filter((q) => q.status === "resolved").length}</b>{t("status.resolved")}</span></div></div>
            <div className="filterbar"><div className="searchbox"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("session.searchQuestions")} /></div><div className="filter-tabs">{(["all", "unanswered", "answered", "resolved"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? t("common.all") : item === "unanswered" ? t("status.unanswered") : item === "answered" ? t("status.answered") : t("status.resolved")}</button>)}</div><button className="btn secondary"><ListFilter />{t("common.filter")}</button></div>
            <div className="question-table"><div className="table-head"><span>{t("common.slide")}</span><span>{t("common.question")}</span><span>{t("common.category")}</span><span>{t("common.status")}</span><span>{t("common.createdAt")}</span><span /></div>{visibleQuestions.map((q) => <button className="table-row" key={q.id} onClick={() => { runAction(setCurrentSlide(session.id, q.slideIndex), t("session.saveSlideError")); setSelectedId(q.id); setTab("live"); }}><span className="slide-cell"><b>{q.slideIndex + 1}</b><small>Slide {q.slideIndex + 1}</small></span><span className="question-text">{q.text}</span><span><em className={`category ${q.category}`}>{categoryLabel(q.category)}</em></span><span><StatusBadge status={q.status} /></span><span className="muted">{timeAgo(q.createdAt)}</span><span><ChevronRight /></span></button>)}</div>
          </div>
        )}
      </main>

      {detailQuestion && <QuestionDetailDialog question={detailQuestion} onClose={() => setDetailQuestionId(null)} />}
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
      {shareOpen && <div className="modal-backdrop" onMouseDown={() => setShareOpen(false)}><div className="share-modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShareOpen(false)} aria-label={t("question.closeDetail")}><X /></button><div className="modal-icon"><Users /></div><h2>{t("session.inviteTitle")}</h2><p>{t("session.inviteDescription1")}<br />{t("session.inviteDescription2")}</p><div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} fgColor="#171D26" /></div><div className="session-code"><span>{t("session.joinCode")}</span><b>{session.code}</b></div><div className="link-copy"><Link2 /><span>{joinUrl}</span><button onClick={copy} aria-label={t("session.copyJoinLink")}>{copied ? <Check /> : <Copy />}</button></div><button className="btn primary large full" onClick={copy}>{copied ? <><Check />{t("session.copied")}</> : <><Copy />{t("session.copyJoinLink")}</>}</button></div></div>}
    </div>
  );
}

function QuestionCard({ question, selected, onClick }: { question: Question; selected: boolean; onClick: () => void }) {
  const { t, categoryLabel, timeAgo } = useLanguage();
  return <button className={`question-card ${selected ? "selected" : ""}`} onClick={onClick}><div className="question-meta"><div className="question-copy"><span className={`category ${question.category}`}>{categoryLabel(question.category)}</span><p>{question.text}</p></div><span className="question-time"><Clock3 />{timeAgo(question.createdAt)}</span></div>{question.answer && <div className="question-answer"><span>{t("session.myAnswer")}</span><p>{question.answer}</p></div>}<div><StatusBadge status={question.status} />{question.x !== null && <span className="pin-context">{question.anchorKind !== "point" ? t("session.regionQuestion") : t("session.pinQuestion")}</span>}</div></button>;
}
