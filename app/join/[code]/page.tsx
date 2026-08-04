"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, MapPin, MessageCircleQuestion, Pencil, Send, Smile, Trash2, X } from "@/components/icons";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { PinLogo } from "@/components/pin-logo";
import { SlideCanvas } from "@/components/slide-canvas";
import { StatusBadge } from "@/components/status-badge";
import { useHorizontalSlideWheel } from "@/components/use-horizontal-slide-wheel";
import { useSessions } from "@/components/session-store";
import { categoryKeys } from "@/lib/i18n";
import type { NormalizedPoint, QuestionCategory } from "@/lib/types";

type StudentTab = "slide" | "questions";
type StudentTool = "pin" | "pen" | "emoji";
type EmojiReaction = { id: number; emoji: string; left: number };

type DraftQuestion = {
  anchorKind: "point" | "box" | "path";
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  path: NormalizedPoint[] | null;
  category: QuestionCategory;
  text: string;
};

const MAX_PATH_POINTS = 512;
const MIN_PATH_DISTANCE_PX = 2;
const MIN_PATH_LENGTH_PX = 12;

export default function JoinSession() {
  const { t, categoryLabel, timeAgo } = useLanguage();
  const params = useParams<{ code: string }>();
  const { sessions, ready, addQuestion, updateQuestion, loadSessionByCode } = useSessions();
  const session = useMemo(() => sessions.find((item) => item.code.toLowerCase() === params.code.toLowerCase()), [params.code, sessions]);
  const [tab, setTab] = useState<StudentTab>("slide");
  const [activeTool, setActiveTool] = useState<StudentTool>("pin");
  const [slideIndex, setSlideIndex] = useState<number | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<Record<string, DraftQuestion>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [viewingQuestionId, setViewingQuestionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [emojiReactions, setEmojiReactions] = useState<EmojiReaction[]>([]);
  const pinDragged = useRef(false);
  const pinDragStart = useRef<{ x: number; y: number } | null>(null);
  const penPath = useRef<NormalizedPoint[]>([]);
  const reactionId = useRef(0);
  const reactionTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!ready || lookupDone || session) return;
    void loadSessionByCode(params.code).finally(() => setLookupDone(true));
  }, [loadSessionByCode, lookupDone, params.code, ready, session]);
  useEffect(() => () => {
    reactionTimers.current.forEach((timer) => clearTimeout(timer));
    reactionTimers.current.clear();
  }, []);
  const current = slideIndex ?? session?.currentSlide ?? 0;
  const handleSlideWheel = useHorizontalSlideWheel({
    currentIndex: current,
    slideCount: session?.slides.length ?? 0,
    onIndexChange: (index) => {
      setSlideIndex(index);
      setComposerOpen(false);
      setEditingQuestionId(null);
      setViewingQuestionId(null);
    }
  });

  if (!ready || (!session && !lookupDone)) return <div className="loading-screen"><span className="spinner dark" /></div>;
  if (!session) return <div className="student-empty"><PinLogo /><LanguageSwitcher /><h1>{t("student.sessionNotFound")}</h1><p>{t("student.checkLink")}</p></div>;
  const effectiveTool = !session.showQuestionPins && activeTool === "emoji" ? "pin" : activeTool;
  const slide = session.slides[current];
  const submittedQuestions = session.questions.filter((question) => question.slideIndex === current);
  const draftQuestion = draftQuestions[slide.id];
  const viewingQuestion = viewingQuestionId ? submittedQuestions.find((question) => question.id === viewingQuestionId) : null;
  const activeCategory = draftQuestion?.category ?? "concept";
  const draftText = draftQuestion?.text ?? "";
  const placeDraftTag = (x: number, y: number, nextCategory = activeCategory) => {
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitError(null);
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      return {
        ...currentDrafts,
        [slide.id]: {
          anchorKind: "point",
          x,
          y,
          width: null,
          height: null,
          path: null,
          category: currentDraft?.category ?? nextCategory,
          text: currentDraft?.text ?? ""
        }
      };
    });
    setSubmitted(false);
    setComposerOpen(true);
  };
  const selectCategory = (nextCategory: QuestionCategory) => {
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, category: nextCategory } };
    });
  };
  const startEditingQuestion = (questionId: string) => {
    const question = submittedQuestions.find((item) => item.id === questionId);
    if (!question) return;
    if (question.status !== "unanswered" || question.answer) {
      setEditingQuestionId(null);
      setViewingQuestionId(question.id);
      setSubmitted(false);
      setSubmitError(null);
      setComposerOpen(true);
      return;
    }
    if (question.x === null || question.y === null) return;
    setDraftQuestions((currentDrafts) => ({
      ...currentDrafts,
      [slide.id]: {
        anchorKind: question.anchorKind === "path" ? "path" : question.anchorKind === "box" ? "box" : "point",
        x: question.x!,
        y: question.y!,
        width: question.width ?? null,
        height: question.height ?? null,
        path: question.path ?? null,
        category: question.category,
        text: question.text
      }
    }));
    setEditingQuestionId(question.id);
    setViewingQuestionId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(true);
  };
  const updateDraftText = (text: string) => {
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, text } };
    });
  };
  const clearDraftQuestion = () => {
    penPath.current = [];
    setDraftQuestions((currentDrafts) => {
      if (!currentDrafts[slide.id]) return currentDrafts;
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[slide.id];
      return nextDrafts;
    });
  };
  const normalizedPoint = (clientX: number, clientY: number, canvas: DOMRect): NormalizedPoint => ({
    x: Math.min(1, Math.max(0, (clientX - canvas.left) / canvas.width)),
    y: Math.min(1, Math.max(0, (clientY - canvas.top) / canvas.height))
  });
  const appendPenPath = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return penPath.current;
    const canvas = event.currentTarget.getBoundingClientRect();
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    let nextPath = [...penPath.current];
    samples.forEach((sample) => {
      const point = normalizedPoint(sample.clientX, sample.clientY, canvas);
      const previous = nextPath[nextPath.length - 1];
      if (previous && Math.hypot(
        (point.x - previous.x) * canvas.width,
        (point.y - previous.y) * canvas.height
      ) < MIN_PATH_DISTANCE_PX) return;
      if (nextPath.length >= MAX_PATH_POINTS) {
        nextPath = nextPath.filter((_, index) => index % 2 === 0);
      }
      nextPath.push(point);
    });
    penPath.current = nextPath;
    return nextPath;
  };
  const startPenDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget.getBoundingClientRect();
    const start = normalizedPoint(event.clientX, event.clientY, canvas);
    penPath.current = [start];
    event.currentTarget.setPointerCapture(event.pointerId);
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitError(null);
    setSubmitted(false);
    setComposerOpen(false);
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      return {
        ...currentDrafts,
        [slide.id]: {
          anchorKind: "path",
          x: start.x,
          y: start.y,
          width: null,
          height: null,
          path: [start],
          category: currentDraft?.category ?? "concept",
          text: currentDraft?.text ?? ""
        }
      };
    });
  };
  const movePenDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const path = appendPenPath(event);
    const start = path[0];
    if (!start) return;
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, anchorKind: "path", x: start.x, y: start.y, path } };
    });
  };
  const finishPenDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    const path = appendPenPath(event);
    const canvas = event.currentTarget.getBoundingClientRect();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    penPath.current = [];
    const pathLength = path.slice(1).reduce((length, point, index) => {
      const previous = path[index];
      return length + Math.hypot(
        (point.x - previous.x) * canvas.width,
        (point.y - previous.y) * canvas.height
      );
    }, 0);
    if (path.length < 2 || pathLength < MIN_PATH_LENGTH_PX) {
      clearDraftQuestion();
      return;
    }
    const start = path[0];
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, anchorKind: "path", x: start.x, y: start.y, path } };
    });
    setComposerOpen(true);
  };
  const cancelPenDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    penPath.current = [];
    clearDraftQuestion();
  };
  const moveDraftTag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const canvas = event.currentTarget.closest(".slide-canvas")?.getBoundingClientRect();
    if (!canvas) return;
    const start = pinDragStart.current;
    if (!pinDragged.current && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
    pinDragged.current = true;
    const x = Math.min(1, Math.max(0, (event.clientX - canvas.left) / canvas.width));
    const y = Math.min(1, Math.max(0, (event.clientY - canvas.top) / canvas.height));
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, x, y } };
    });
  };
  const finishMovingDraftTag = (event: React.PointerEvent<HTMLButtonElement>) => {
    moveDraftTag(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pinDragStart.current = null;
  };
  const submit = async () => {
    if (!draftQuestion || submitting) return;
    const values = {
      category: draftQuestion.category,
      text: draftQuestion.text.trim() || categoryLabel(draftQuestion.category)
    };
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (editingQuestionId) {
        await updateQuestion(session.id, editingQuestionId, values);
      } else {
        await addQuestion(session.id, {
          slideIndex: current,
          anchorKind: draftQuestion.anchorKind,
          x: draftQuestion.x,
          y: draftQuestion.y,
          width: draftQuestion.width,
          height: draftQuestion.height,
          path: draftQuestion.path,
          ...values
        });
      }
      setSubmitted(true);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`Question save failed: ${detail}`, error);
      setSubmitError(editingQuestionId ? t("student.editError") : t("student.saveError"));
    } finally {
      setSubmitting(false);
    }
  };
  const closeComposer = () => {
    if (submitted || editingQuestionId) {
      clearDraftQuestion();
      setSubmitted(false);
    }
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitError(null);
    setComposerOpen(false);
  };
  const deleteDraftQuestion = () => {
    clearDraftQuestion();
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(false);
  };
  const selectTool = (tool: StudentTool) => {
    if (tool === "emoji" && !session.showQuestionPins) return;
    if (tool !== activeTool) {
      clearDraftQuestion();
      setEditingQuestionId(null);
      setViewingQuestionId(null);
      setSubmitError(null);
      setSubmitted(false);
      setComposerOpen(false);
    }
    setActiveTool(tool);
  };
  const sendEmojiReaction = (emoji: string) => {
    if (!session.showQuestionPins) return;
    const id = ++reactionId.current;
    const lanes = [28, 42, 56, 70];
    setEmojiReactions((currentReactions) => [...currentReactions, { id, emoji, left: lanes[id % lanes.length] }]);
    const timer = setTimeout(() => {
      setEmojiReactions((currentReactions) => currentReactions.filter((reaction) => reaction.id !== id));
      reactionTimers.current.delete(timer);
    }, 1800);
    reactionTimers.current.add(timer);
  };
  return (
    <main className="student-shell student-slide-shell">
      <header className="student-header"><PinLogo /><div className="student-header-actions"><LanguageSwitcher /><span className="student-live-status"><i />{session.status === "live" ? "LIVE" : t("student.endedSession")}</span></div></header>
      <nav className="student-view-tabs" role="tablist" aria-label={t("student.lectureView")}>
        <button
          type="button"
          id="student-slide-tab"
          role="tab"
          aria-selected={tab === "slide"}
          aria-controls="student-slide-panel"
          className={tab === "slide" ? "active" : ""}
          onClick={() => setTab("slide")}
        >
          Slide
        </button>
        <button
          type="button"
          id="student-questions-tab"
          role="tab"
          aria-selected={tab === "questions"}
          aria-controls="student-questions-panel"
          className={tab === "questions" ? "active" : ""}
          onClick={() => setTab("questions")}
        >
          Questions
          {submittedQuestions.length > 0 && <span>{submittedQuestions.length}</span>}
        </button>
      </nav>
      {tab === "slide" ? <section
        id="student-slide-panel"
        className="student-stage"
        role="tabpanel"
        aria-labelledby="student-slide-tab"
        aria-label={t("student.slideAria", { title: session.title })}
        onWheel={handleSlideWheel}
      >
        <div className="student-slide-content">
          <div className={`student-canvas tool-${effectiveTool}`}>
            <SlideCanvas
              slide={slide}
              questions={submittedQuestions}
              onSelectPin={startEditingQuestion}
              onCanvasClick={effectiveTool === "pin" ? placeDraftTag : undefined}
              showQuestionLabels
              showPins={session.showQuestionPins}
            >
              {effectiveTool === "pen" && <div
                className="student-pen-layer"
                onPointerDown={startPenDrawing}
                onPointerMove={movePenDrawing}
                onPointerUp={finishPenDrawing}
                onPointerCancel={cancelPenDrawing}
                aria-label={t("student.selectArea")}
              />}
              {draftQuestion?.anchorKind === "point" && !editingQuestionId && !submitted && <>
                <button
                  className="draft-pin"
                  style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}
                  aria-label={t("student.movePin")}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    pinDragged.current = false;
                    pinDragStart.current = { x: event.clientX, y: event.clientY };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={moveDraftTag}
                  onPointerUp={finishMovingDraftTag}
                  onPointerCancel={finishMovingDraftTag}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!pinDragged.current) setComposerOpen(true);
                    pinDragged.current = false;
                  }}
                >?</button>
                <span className={`draft-tag category ${draftQuestion.category}`} style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}>{categoryLabel(draftQuestion.category)}</span>
              </>}
              {draftQuestion?.anchorKind === "path" && (draftQuestion.path?.length ?? 0) >= 1 && !editingQuestionId && !submitted && <>
                <svg className="draft-path" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    points={draftQuestion.path!.map((point) => `${point.x},${point.y}`).join(" ")}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <button
                  type="button"
                  className={`draft-path-label category ${draftQuestion.category}`}
                  style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}
                  aria-label={t("student.openAreaQuestion")}
                  onClick={(event) => {
                    event.stopPropagation();
                    setComposerOpen(true);
                  }}
                >
                  {categoryLabel(draftQuestion.category)}
                </button>
              </>}
              {draftQuestion?.anchorKind === "box" && draftQuestion.width != null && draftQuestion.height != null && !editingQuestionId && !submitted && <button
                type="button"
                className="draft-region"
                style={{
                  left: `${draftQuestion.x * 100}%`,
                  top: `${draftQuestion.y * 100}%`,
                  width: `${draftQuestion.width * 100}%`,
                  height: `${draftQuestion.height * 100}%`
                }}
                aria-label={t("student.openAreaQuestion")}
                onClick={(event) => {
                  event.stopPropagation();
                  setComposerOpen(true);
                }}
              >
                <span>{categoryLabel(draftQuestion.category)}</span>
              </button>}
              {session.showQuestionPins && emojiReactions.map((reaction) => <span
                className="slide-emoji-reaction"
                key={reaction.id}
                style={{ left: `${reaction.left}%` }}
                aria-hidden="true"
              >{reaction.emoji}</span>)}
            </SlideCanvas>
          </div>
          <div className="student-slide-toolbar-wrap">
            {effectiveTool === "emoji" && session.showQuestionPins && <div className="student-emoji-picker" role="group" aria-label={t("student.chooseEmoji")}>
              {["👍", "❓", "💡", "🙁"].map((emoji) => <button type="button" key={emoji} onClick={() => sendEmojiReaction(emoji)} aria-label={t("student.sendReaction", { emoji })}>{emoji}</button>)}
            </div>}
            <div className="student-slide-toolbar" role="toolbar" aria-label={t("student.questionTools")}>
              <button type="button" className={effectiveTool === "pin" ? "active" : ""} aria-pressed={effectiveTool === "pin"} onClick={() => selectTool("pin")} aria-label={t("student.pinTool")} title={t("student.pin")}><MapPin /></button>
              <button type="button" className={effectiveTool === "pen" ? "active" : ""} aria-pressed={effectiveTool === "pen"} onClick={() => selectTool("pen")} aria-label={t("student.penTool")} title={t("student.pen")}><Pencil /></button>
              <button type="button" className={effectiveTool === "emoji" ? "active" : ""} aria-pressed={effectiveTool === "emoji"} onClick={() => selectTool("emoji")} aria-label={session.showQuestionPins ? t("student.emojiTool") : t("student.emojiDisabledAria")} title={session.showQuestionPins ? t("student.emoji") : t("student.emojiDisabled")} disabled={!session.showQuestionPins}><Smile /></button>
            </div>
          </div>
        </div>
        <div className="student-slide-nav">
          <button className="icon-btn" disabled={current === 0} onClick={() => { setSlideIndex(current - 1); setComposerOpen(false); setEditingQuestionId(null); setViewingQuestionId(null); }} aria-label={t("session.previousSlide")}><ChevronLeft /></button>
          <span>{current + 1} / {session.slides.length}</span>
          <button className="icon-btn" disabled={current === session.slides.length - 1} onClick={() => { setSlideIndex(current + 1); setComposerOpen(false); setEditingQuestionId(null); setViewingQuestionId(null); }} aria-label={t("session.nextSlide")}><ChevronRight /></button>
        </div>
        {slideIndex !== null && <button className="student-sync-button" onClick={() => { setSlideIndex(null); setComposerOpen(false); setEditingQuestionId(null); setViewingQuestionId(null); }}>{t("student.currentSlide")}</button>}
        <p className="student-stage-hint">{effectiveTool === "pin" ? t("student.pinHint") : effectiveTool === "pen" ? t("student.areaHint") : t("student.emojiHint")}</p>
      </section> : <section
        id="student-questions-panel"
        className="student-questions-view"
        role="tabpanel"
        aria-labelledby="student-questions-tab"
      >
        <div className="student-questions-content">
          <div className="student-questions-heading">
            <div>
              <span>Slide {current + 1}</span>
              <h1>{t("student.questionsTitle")}</h1>
              <p>{t("student.questionsDescription")}</p>
            </div>
            <strong>{submittedQuestions.length}</strong>
          </div>
          <div className="student-question-slide-nav" aria-label={t("student.chooseQuestionSlide")}>
            <button
              type="button"
              className="icon-btn"
              disabled={current === 0}
              onClick={() => { setSlideIndex(current - 1); setEditingQuestionId(null); setViewingQuestionId(null); }}
              aria-label={t("student.previousSlideQuestions")}
            >
              <ChevronLeft />
            </button>
            <span>{current + 1} / {session.slides.length}</span>
            <button
              type="button"
              className="icon-btn"
              disabled={current === session.slides.length - 1}
              onClick={() => { setSlideIndex(current + 1); setEditingQuestionId(null); setViewingQuestionId(null); }}
              aria-label={t("student.nextSlideQuestions")}
            >
              <ChevronRight />
            </button>
          </div>
          {submittedQuestions.length ? <div className="student-question-list">
            {submittedQuestions.map((question, index) => (
              <article
                className="student-question-list-card"
                key={question.id}
              >
                <span className="student-question-number">{index + 1}</span>
                <span className="student-question-list-body">
                  <span className="student-question-list-meta">
                    <span className={`category ${question.category}`}>{categoryLabel(question.category)}</span>
                    <StatusBadge status={question.status} />
                    <time dateTime={question.createdAt}>{timeAgo(question.createdAt)}</time>
                  </span>
                  <strong>{question.text}</strong>
                  {question.answer && <span className="student-question-list-answer"><b>{t("question.instructorAnswer")}</b>{question.answer}</span>}
                </span>
              </article>
            ))}
          </div> : <div className="student-questions-empty">
            <span><MessageCircleQuestion /></span>
            <h2>{t("session.noQuestions")}</h2>
            <p>{t("student.noQuestionsHint1")}<br />{t("student.noQuestionsHint2")}</p>
            <button type="button" className="btn primary" onClick={() => setTab("slide")}>{t("student.goToSlide")}</button>
          </div>}
        </div>
      </section>}
      {composerOpen && <div className="student-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}>
        <section className="student-question-modal" role="dialog" aria-modal="true" aria-labelledby="question-modal-title">
          <button className="modal-close" onClick={closeComposer} aria-label={t("student.closeComposer")}><X /></button>
          {viewingQuestion ? <div className="student-answer-view">
            <span className={`category ${viewingQuestion.category}`}>{categoryLabel(viewingQuestion.category)}</span>
            <h2 id="question-modal-title">{t("student.myQuestion")}</h2>
            <p className="student-answer-question">{viewingQuestion.text}</p>
            <div className={`student-answer-panel ${viewingQuestion.answer ? "" : "pending"}`}>
              <span>{t("question.instructorAnswer")}</span>
              <p>{viewingQuestion.answer ?? t("student.waitingAnswer")}</p>
            </div>
            <button className="btn primary large full" onClick={closeComposer}>{t("common.confirm")}</button>
          </div> : submitted ? <div className="submitted"><span><Check /></span><h2 id="question-modal-title">{editingQuestionId ? t("student.edited") : t("student.submitted")}</h2><p>{t("student.instructorCanSee")}</p><button className="btn primary" onClick={closeComposer}>{editingQuestionId ? t("common.confirm") : t("student.newQuestion")}</button></div> : <>
            <div className="student-modal-heading">
              <span>?</span>
              <div><h2 id="question-modal-title">{editingQuestionId ? t("student.editPrompt") : draftQuestion?.anchorKind !== "point" ? t("student.areaPrompt") : t("student.pointPrompt")}</h2><p>{editingQuestionId ? t("student.editHint") : t("student.composeHint")}</p></div>
            </div>
            <div className="category-scroll">{categoryKeys.map((item) => <button key={item} className={activeCategory === item ? "active" : ""} onClick={() => selectCategory(item)}>{categoryLabel(item)}</button>)}</div>
            <div className="textarea-wrap"><textarea value={draftText} onChange={(event) => updateDraftText(event.target.value)} maxLength={300} placeholder={t("student.optionalQuestion")} /><span>{draftText.length}/300</span></div>
            {submitError && <div className="student-submit-error" role="alert">{submitError}</div>}
            <div className="student-composer-actions">
              <button className="btn primary large full" onClick={() => void submit()} disabled={submitting}>{submitting ? <span className="spinner" /> : <Send />}{editingQuestionId ? t("student.sendEdited") : t("student.sendQuestion")}</button>
              {editingQuestionId
                ? <button className="btn secondary large full" onClick={closeComposer} disabled={submitting}>{t("student.cancelEdit")}</button>
                : <button className="btn destructive large full" onClick={deleteDraftQuestion}><Trash2 />{draftQuestion?.anchorKind !== "point" ? t("student.deleteArea") : t("student.deletePin")}</button>}
            </div>
          </>}
        </section>
      </div>}
    </main>
  );
}
